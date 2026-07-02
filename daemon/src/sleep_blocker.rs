//! Keeps Windows from sleeping while the WS server is active, so the daemon
//! stays reachable from a phone even with the desktop UI closed.
//!
//! SetThreadExecutionState is per-thread and its effect is cleared when the
//! setting thread exits. Calling it from an arbitrary tokio worker is fragile
//! (work-stealing, idle parking), so a single dedicated long-lived thread owns
//! the flag and re-arms it periodically — guaranteeing it survives regardless
//! of async scheduling.

#[cfg(target_os = "windows")]
mod imp {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Once;
    use std::thread;
    use std::time::Duration;
    use winapi::um::winbase::SetThreadExecutionState;

    const ES_CONTINUOUS: u32 = 0x8000_0000; // keep the state until changed
    const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001; // block system sleep (not display)

    static ACTIVE: AtomicBool = AtomicBool::new(false);
    static INIT: Once = Once::new();

    pub fn prevent_system_sleep(enable: bool) {
        ACTIVE.store(enable, Ordering::SeqCst);
        // Spawn the guard thread once; it then follows ACTIVE for the process life.
        INIT.call_once(|| {
            let _ = thread::Builder::new()
                .name("sleep-guard".into())
                .spawn(|| loop {
                    let flags = if ACTIVE.load(Ordering::SeqCst) {
                        ES_CONTINUOUS | ES_SYSTEM_REQUIRED
                    } else {
                        ES_CONTINUOUS // release: system may sleep normally
                    };
                    // Safe: FFI call with valid flag bits; no pointers involved.
                    unsafe { SetThreadExecutionState(flags); }
                    // Re-arm well within any system idle timeout (minutes).
                    thread::sleep(Duration::from_secs(30));
                });
        });
    }
}

#[cfg(target_os = "windows")]
pub use imp::prevent_system_sleep;

#[cfg(not(target_os = "windows"))]
pub fn prevent_system_sleep(_enable: bool) {}
