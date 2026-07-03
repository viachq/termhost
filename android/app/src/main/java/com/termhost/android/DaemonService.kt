package com.termhost.android

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

class DaemonService : Service() {

    private var daemonProcess: Process? = null
    private var daemonThread: Thread? = null
    private val daemonPort = 9090
    private val daemonStarted = AtomicBoolean(false)

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = buildNotification()
        startForeground(NOTIF_ID, notification)

        if (daemonProcess == null || !daemonProcess!!.isAlive) {
            startDaemon()
        }

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopDaemon()
        super.onDestroy()
    }

    private fun startDaemon() {
        if (!daemonStarted.compareAndSet(false, true)) {
            android.util.Log.d(TAG, "Daemon already starting, skipping")
            return
        }

        val binary = extractBinary()
        if (binary == null) {
            daemonStarted.set(false)
            stopSelf()
            return
        }

        val busybox = findBusybox()
        val prorootDir = findProrootDir()
        val rootfsDir = filesDir.resolve("rootfs")

        daemonThread = Thread {
            try {
                // Kill old daemon first (port 9090 cleanup)
                killOldDaemon()

                // Ensure rootfs is ready before starting daemon
                if (prorootDir != null) {
                    ensureRootfs(rootfsDir)
                }

                val args = mutableListOf(
                    binary.absolutePath,
                    "--port", daemonPort.toString()
                )
                if (busybox != null) {
                    args.add("--busybox")
                    args.add(busybox.absolutePath)
                }
                if (prorootDir != null) {
                    args.add("--proroot-dir")
                    args.add(prorootDir.absolutePath)
                    args.add("--rootfs-dir")
                    args.add(rootfsDir.absolutePath)
                }
                args.add("--pid-file")
                args.add(filesDir.resolve("daemon.pid").absolutePath)
                val pb = ProcessBuilder(args)
                pb.environment()["TERMHOST_DATA_DIR"] = filesDir.resolve("data").absolutePath
                pb.directory(filesDir)
                pb.redirectErrorStream(true)

                daemonProcess = pb.start()

                daemonProcess!!.inputStream.bufferedReader().use { reader ->
                    reader.lines().forEach { line ->
                        android.util.Log.d(TAG, "[daemon] $line")
                    }
                }

                val exitCode = daemonProcess!!.waitFor()
                android.util.Log.d(TAG, "daemon exited: $exitCode")
            } catch (e: Exception) {
                android.util.Log.e(TAG, "daemon error", e)
            } finally {
                daemonStarted.set(false)
                filesDir.resolve("daemon.pid").delete()
            }
        }.apply {
            name = "termhostd"
            isDaemon = false
            start()
        }
    }

    private fun killOldDaemon() {
        val pidFile = filesDir.resolve("daemon.pid")
        if (!pidFile.exists()) return
        val pid = pidFile.readText().trim().toIntOrNull() ?: return
        try {
            val cmdline = try {
                java.io.File("/proc/$pid/cmdline").readText().trimEnd('\u0000')
            } catch (e: Exception) { null }
            if (cmdline != null && cmdline.contains("termhostd")) {
                ProcessBuilder("kill", pid.toString()).start().waitFor()
                Thread.sleep(300)
                android.util.Log.d(TAG, "Killed old daemon PID $pid")
            }
        } catch (e: Exception) {
            android.util.Log.w(TAG, "Failed to kill old daemon", e)
        }
        pidFile.delete()
    }

    private fun ensureRootfs(rootfsDir: File) {
        if (rootfsDir.resolve("bin").exists()) {
            android.util.Log.d(TAG, "Rootfs already ready")
            return
        }
        val tarFile = rootfsDir.resolve("rootfs.tar.gz")
        if (!tarFile.exists()) {
            downloadRootfs(rootfsDir)
        }
        if (tarFile.exists()) {
            extractTar(tarFile, rootfsDir)
        }
    }

    private fun stopDaemon() {
        daemonProcess?.let {
            it.destroyForcibly()
            daemonProcess = null
        }
        daemonThread?.join(2000)
        daemonThread = null
        filesDir.resolve("daemon.pid").delete()
    }

    private fun extractBinary(): File? {
        val libName = "libtermhostd.so"
        val abi = getAbi()

        // Try native lib dir via PackageManager
        try {
            val ai = packageManager.getApplicationInfo(packageName, 0)
            val ndField = ApplicationInfo::class.java.getDeclaredField("nativeLibraryDir")
            ndField.isAccessible = true
            val nativeLibDirPath = ndField.get(ai) as? String
            if (nativeLibDirPath != null) {
                val nativeLib = File(nativeLibDirPath, libName)
                if (nativeLib.exists() && nativeLib.canExecute()) {
                    android.util.Log.d(TAG, "Using native lib: ${nativeLib.absolutePath}")
                    return nativeLib
                }
            }
        } catch (e: Exception) {
            android.util.Log.w(TAG, "nativeLibraryDir reflection failed", e)
        }

        // fallback: copy from assets to filesDir
        val target = filesDir.resolve("termhostd-android")
        if (target.exists() && target.canExecute()) {
            return target
        }
        try {
            assets.open("bin/$abi/termhostd-android").use { input ->
                FileOutputStream(target).use { output ->
                    input.copyTo(output)
                }
            }
            target.setExecutable(true)
            return target
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to extract binary for $abi", e)
            return null
        }
    }

    private fun findBusybox(): File? {
        val libName = "libbusybox.so"
        // Try native lib dir (apk_private_file SELinux context — allows execve)
        try {
            val ai = packageManager.getApplicationInfo(packageName, 0)
            val ndField = ApplicationInfo::class.java.getDeclaredField("nativeLibraryDir")
            ndField.isAccessible = true
            val nativeLibDirPath = ndField.get(ai) as? String
            if (nativeLibDirPath != null) {
                val nativeLib = File(nativeLibDirPath, libName)
                if (nativeLib.exists()) {
                    android.util.Log.d(TAG, "Using busybox from native lib: ${nativeLib.absolutePath}")
                    return nativeLib
                }
            }
        } catch (e: Exception) {
            android.util.Log.w(TAG, "nativeLibraryDir reflection for busybox failed", e)
        }
        // Fallback: extract from assets to filesDir
        val abi = getAbi()
        val target = filesDir.resolve("busybox")
        if (target.exists()) {
            return target
        }
        try {
            assets.open("bin/$abi/busybox").use { input ->
                FileOutputStream(target).use { output ->
                    input.copyTo(output)
                }
            }
            target.setExecutable(true)
            android.util.Log.d(TAG, "Extracted busybox from assets to ${target.absolutePath}")
            return target
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to extract busybox from assets", e)
            return null
        }
    }

    private fun findProrootDir(): File? {
        try {
            val ai = packageManager.getApplicationInfo(packageName, 0)
            val ndField = ApplicationInfo::class.java.getDeclaredField("nativeLibraryDir")
            ndField.isAccessible = true
            val nativeLibDirPath = ndField.get(ai) as? String
            if (nativeLibDirPath != null) {
                val launcher = File(nativeLibDirPath, "libproroot.so")
                if (launcher.exists()) {
                    android.util.Log.d(TAG, "Proroot dir: $nativeLibDirPath")
                    return File(nativeLibDirPath)
                }
            }
        } catch (e: Exception) {
            android.util.Log.w(TAG, "findProrootDir reflection failed", e)
        }
        return null
    }

    private fun downloadRootfs(targetDir: File) {
        val tarFile = targetDir.resolve("rootfs.tar.gz")
        val url = "https://cdimage.ubuntu.com/ubuntu-base/releases/24.04/release/ubuntu-base-24.04.4-base-arm64.tar.gz"
        try {
            android.util.Log.d(TAG, "Downloading Ubuntu rootfs (~30 MB)...")
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 15000
            conn.readTimeout = 60000
            conn.inputStream.use { input ->
                val tmpFile = File(filesDir, "rootfs.tar.gz.tmp")
                targetDir.mkdirs()
                tmpFile.outputStream().use { output -> input.copyTo(output) }
                tmpFile.renameTo(tarFile)
            }
            android.util.Log.d(TAG, "Downloaded ${tarFile.length()} bytes")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Rootfs download failed", e)
        }
    }

    private fun extractTar(tarFile: File, targetDir: File) {
        targetDir.mkdirs()
        try {
            android.util.Log.d(TAG, "Extracting rootfs via manual tar parser...")
            java.util.zip.GZIPInputStream(tarFile.inputStream()).use { gz ->
                val header = ByteArray(512)
                while (true) {
                    readFully(gz, header)
                    // End of archive: two consecutive zero blocks
                    if (header.all { it == 0.toByte() }) break

                    val name = String(header, 0, 100, Charsets.US_ASCII).trimEnd('\u0000')
                    val prefix = String(header, 345, 155, Charsets.US_ASCII).trimEnd('\u0000')
                    val fullName = if (prefix.isNotEmpty()) "$prefix/$name" else name

                    val sizeStr = String(header, 124, 12, Charsets.US_ASCII).trim()
                    val size = if (sizeStr.isEmpty()) 0L else sizeStr.toLong(8)
                    val typeFlag = header[156].toInt().toChar()

                    // Skip padded ("./" prefix) and non-file entries
                    if (fullName.isBlank() || fullName == "." || fullName == "/") {
                        skipPadding(gz, size)
                        continue
                    }

                    val f = File(targetDir, fullName).normalize()
                    if (!f.absolutePath.startsWith(targetDir.absolutePath)) {
                        skipPadding(gz, size)
                        continue
                    }

                    when (typeFlag) {
                        '5' -> f.mkdirs()
                        '2' -> {
                            val linkTarget = String(header, 157, 100, Charsets.US_ASCII).trimEnd('\u0000')
                            f.parentFile?.mkdirs()
                            try {
                                java.nio.file.Files.createSymbolicLink(f.toPath(), java.nio.file.Paths.get(linkTarget))
                            } catch (_: Exception) {}
                        }
                        else -> {
                            f.parentFile?.mkdirs()
                            if (size > 0) {
                                val data = ByteArray(size.toInt())
                                readFully(gz, data)
                                f.writeBytes(data)
                            } else {
                                f.writeBytes(ByteArray(0))
                            }
                        }
                    }
                    skipPadding(gz, size)
                }
            }
            if (targetDir.resolve("bin").exists()) {
                android.util.Log.d(TAG, "Rootfs extracted successfully")
                tarFile.delete()
            } else {
                android.util.Log.e(TAG, "Extraction produced no bin/")
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Extraction failed", e)
        }
    }

    private fun readFully(input: java.io.InputStream, buf: ByteArray) {
        var off = 0
        while (off < buf.size) {
            val n = input.read(buf, off, buf.size - off)
            if (n < 0) throw java.io.EOFException("Unexpected EOF in tar")
            off += n
        }
    }

    private fun skipFully(input: java.io.InputStream, count: Long) {
        var remaining = count
        while (remaining > 0) {
            val skipped = input.skip(remaining)
            if (skipped <= 0) throw java.io.EOFException("Failed to skip in tar")
            remaining -= skipped
        }
    }

    private fun skipPadding(input: java.io.InputStream, size: Long) {
        val pad = (512 - (size % 512)) % 512
        if (pad > 0) skipFully(input, pad)
    }

    private fun getAbi(): String {
        return if (Build.SUPPORTED_64_BIT_ABIS.isNotEmpty()) {
            Build.SUPPORTED_64_BIT_ABIS[0]
        } else {
            Build.SUPPORTED_32_BIT_ABIS[0]
        }
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.daemon_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.daemon_channel_desc)
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.daemon_notif_text))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    companion object {
        private const val TAG = "TermhostDaemon"
        private const val CHANNEL_ID = "daemon_service"
        private const val NOTIF_ID = 1
    }
}
