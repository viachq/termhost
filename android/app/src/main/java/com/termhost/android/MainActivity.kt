package com.termhost.android

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val daemonPort = 9090
    private var retryCount = 0
    private val maxRetries = 60
    private var loadingHtml: String = ""

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (!granted) {
            Toast.makeText(this, "Notifications disabled", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        loadingHtml = """
            <!DOCTYPE html><html><body style="background:#0a0a0a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px">
            <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
            <div style="width:32px;height:32px;border:3px solid #333;border-top-color:#e94560;border-radius:50%;animation:spin .8s linear infinite"></div>
            <p style="color:#888;font-family:sans-serif;font-size:14px">Starting daemon...</p>
            </body></html>
        """.trimIndent()

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                builtInZoomControls = true
                displayZoomControls = false
                loadWithOverviewMode = true
                useWideViewPort = true
                setSupportZoom(true)
                userAgentString = settings.userAgentString + " TermhostAndroid/0.1.0"
            }

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean = false

                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: android.webkit.WebResourceError?
                ) {
                    if (request?.url?.toString()?.contains("127.0.0.1") == true && retryCount < maxRetries) {
                        retryCount++
                        val delay = minOf(1000L * retryCount, 5000L)
                        view?.postDelayed({
                            view.loadUrl("http://127.0.0.1:$daemonPort")
                        }, delay)
                    }
                }

                override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                    if (url?.contains("127.0.0.1") == true) retryCount = 0
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    retryCount = 0
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onReceivedTitle(view: WebView?, title: String?) {
                    supportActionBar?.title = title
                }
                override fun onConsoleMessage(msg: ConsoleMessage?): Boolean {
                    Log.d(TAG, "JS [${msg?.lineNumber()}:${msg?.sourceId()}] ${msg?.message()}")
                    return true
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                WebView.setWebContentsDebuggingEnabled(true)
            }
        }

        // Wrap WebView in a FrameLayout so we can use margins to shift it below
        // the status bar (setPadding on WebView doesn't always shift the CSS viewport).
        val root = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#0c0c0c"))
        }
        root.addView(webView, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        setContentView(root)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            Log.d(TAG, "System bars insets: top=${bars.top} bottom=${bars.bottom}")
            (webView.layoutParams as ViewGroup.MarginLayoutParams).apply {
                topMargin = bars.top
                bottomMargin = bars.bottom
            }
            webView.requestLayout()
            insets
        }

        startDaemonService()
        requestNotificationPermission()

        webView.loadDataWithBaseURL(null, loadingHtml, "text/html", "UTF-8", null)
        webView.postDelayed({
            webView.loadUrl("http://127.0.0.1:$daemonPort")
        }, 1500)
    }

    override fun onResume() {
        super.onResume()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    private fun startDaemonService() {
        val intent = Intent(this, DaemonService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            when {
                ContextCompat.checkSelfPermission(
                    this, Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED -> {}
                shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) -> {
                    Toast.makeText(this, "Need notification permission for daemon", Toast.LENGTH_LONG).show()
                    requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
                else -> {
                    requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
        }
    }

    companion object {
        private const val TAG = "TermhostActivity"
    }
}
