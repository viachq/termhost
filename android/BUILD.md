# Building termhost for Android

## Prerequisites

1. **Android NDK + SDK** — via Android Studio or command line
2. **Rust Android target**:
   ```bash
   rustup target add aarch64-linux-android
   ```
3. **cargo-ndk**:
   ```bash
   cargo install cargo-ndk
   ```
4. **Mobile frontend** (first build only):
   ```bash
   npm install
   npm run mobile:build
   ```

## Build all-in-one

```powershell
# From the android/ directory:
.\build-android.ps1

# Or to build and install on device:
.\build-android.ps1 -Install
```

## Build steps (manual)

### 1. Build Rust daemon for Android

```bash
cd daemon
set ANDROID_HOME=C:\Users\viach\AppData\Local\Android\Sdk
set ANDROID_NDK_HOME=%ANDROID_HOME%\ndk\27.2.12479018
cargo ndk -t arm64-v8a build --release --bin termhostd-android

# cargo ndk only copies .so libraries — copy binary manually:
copy target\aarch64-linux-android\release\termhostd-android ..\android\app\src\main\assets\bin\arm64-v8a\
cd ..
```

### 2. Build Android APK

```bash
cd android
.\gradlew.bat assembleDebug
cd ..
```

APK at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Run on device

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## APK size

Debug: ~4.5 MB (includes 2 MB stripped Rust binary).
