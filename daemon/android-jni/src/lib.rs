use std::sync::OnceLock;
use std::thread;

use jni::objects::JClass;
use jni::sys::jint;
use jni::JNIEnv;

static DAEMON_PORT: OnceLock<u16> = OnceLock::new();

fn run_daemon(port: u16) {
    // We inline the daemon start logic here — the full android_main content.
    // For now, this is a placeholder that starts the real daemon code.
    let _ = port;
}

#[no_mangle]
pub extern "system" fn Java_com_termhost_android_DaemonService_nativeStartDaemon(
    _env: JNIEnv,
    _class: JClass,
    port: jint,
) {
    let port = port as u16;
    let _ = DAEMON_PORT.set(port);

    thread::spawn(move || {
        run_daemon(port);
    });
}
