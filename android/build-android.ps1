param(
    [string]$Target = "arm64-v8a",
    [string]$BuildType = "debug",
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path "$PSScriptRoot\.."
$DaemonDir = Join-Path $Root "daemon"
$AndroidDir = $Root | Join-Path -ChildPath "android"
$AssetsDir = Join-Path $AndroidDir "app\src\main\assets\bin"
$JniLibsDir = Join-Path $AndroidDir "app\src\main\jniLibs"
$OutDir = Join-Path $DaemonDir "target\aarch64-linux-android\release"

Write-Host "=== Step 0: Fetch busybox static binary ==="
$busyboxUrl = "https://raw.githubusercontent.com/SahrulGunawan-ID/busybox-static-binaries/main/busybox-arm64"
$busyboxJni = Join-Path $JniLibsDir "arm64-v8a/libbusybox.so"
$busyboxAsset = Join-Path $AssetsDir "arm64-v8a/busybox"
if (-not (Test-Path $busyboxJni)) {
    Write-Host "Downloading busybox..."
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($busyboxUrl, $busyboxJni)
    Write-Host "busybox downloaded to jniLibs"
} else {
    Write-Host "busybox already in jniLibs"
}
# Also ensure it's in assets
New-Item -ItemType Directory -Path (Split-Path $busyboxAsset -Parent) -Force | Out-Null
Copy-Item -Path $busyboxJni -Destination $busyboxAsset -Force
Write-Host "busybox ready in assets"

Write-Host "=== Step 0b: Fetch proroot .so files ==="
$prorootFiles = @("libproroot.so", "libproroot-runtime.so", "libproroot-bridge.so", "libproroot-linker.so", "libproroot-stub-loader.so")
$prorootJniDir = Join-Path $JniLibsDir "arm64-v8a"
$prorootBase = "https://raw.githubusercontent.com/coderredlab/proroot/main/arm64-v8a"
$wc = New-Object System.Net.WebClient
foreach ($f in $prorootFiles) {
    $dst = Join-Path $prorootJniDir $f
    if (-not (Test-Path $dst)) {
        Write-Host "Downloading $f ..."
        $wc.DownloadFile("$prorootBase/$f", $dst)
        Write-Host "  OK: $((Get-Item $dst).Length) bytes"
    } else {
        Write-Host "$f already in jniLibs"
    }
}
Write-Host "proroot ready in jniLibs"

Write-Host "=== Step 1: Build Rust daemon for Android ==="
Push-Location $DaemonDir
try {
    $env:ANDROID_HOME = "C:\Users\viach\AppData\Local\Android\Sdk"
    $env:ANDROID_NDK_HOME = "$env:ANDROID_HOME\ndk\27.2.12479018"

    cargo ndk -t $Target build --release --bin termhostd-android 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Rust build failed" }

    # Manually copy binary (cargo ndk only copies .so libraries)
    $abi = $Target.Replace("arm64-v8a", "arm64-v8a").Replace("armeabi-v7a", "armeabi-v7a").Replace("x86_64", "x86_64").Replace("x86", "x86")
    $dest = Join-Path $AssetsDir $abi
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    Copy-Item -Path (Join-Path $OutDir "termhostd-android") -Destination (Join-Path $dest "termhostd-android") -Force

    Write-Host "=== Rust binary built and copied ==="
} finally {
    Pop-Location
}

Write-Host "=== Step 2: Build Android APK ==="
Push-Location $AndroidDir
try {
    if ($BuildType -eq "release") {
        & ".\gradlew.bat" assembleRelease 2>&1
    } else {
        & ".\gradlew.bat" assembleDebug 2>&1
    }
    if ($LASTEXITCODE -ne 0) { throw "Gradle build failed" }

    $apkDir = Join-Path $AndroidDir "app\build\outputs\apk\$BuildType"
    Write-Host "=== APK built at: $apkDir ==="
} finally {
    Pop-Location
}

if ($Install) {
    Write-Host "=== Step 3: Install on device ==="
    $apk = Get-ChildItem -Path $apkDir -Filter "*.apk" | Select-Object -First 1
    if ($apk) {
        adb install -r $apk.FullName 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "=== Installed successfully ==="
        }
    }
}
