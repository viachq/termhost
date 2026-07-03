//! Keeps Windows from sleeping while the WS server is active, so the daemon
//! stays reachable from a phone even with the desktop UI closed.
//!
//! Supports a timeout: after N minutes of WS uptime the system is allowed to
//! sleep again, or "never" to block indefinitely.
//!
//! SetThreadExecutionState is per-thread and its effect is cleared when the
//! setting thread exits. Calling it from an arbitrary tokio worker is fragile
//! (work-stealing, idle parking), so a single dedicated long-lived thread owns
//! the flag and re-arms it periodically — guaranteeing it survives regardless
//! of async scheduling.

#[cfg(target_os = "windows")]
mod imp {
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
    use std::sync::Once;
    use std::thread;
    use std::time::{Duration, Instant};
    use winapi::um::winbase::SetThreadExecutionState;

    const ES_CONTINUOUS: u32 = 0x8000_0000;
    const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;

    /// true = block sleep, false = allow
    static ACTIVE: AtomicBool = AtomicBool::new(false);
    /// 0 = never (block indefinitely), otherwise minutes
    static TIMEOUT_MINUTES: AtomicU32 = AtomicU32::new(0);
    /// When blocking started
    static BLOCKED_AT: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
    static INIT: Once = Once::new();

    pub fn set_config(never: bool, timeout_minutes: u32) {
        if never {
            ACTIVE.store(true, Ordering::SeqCst);
            TIMEOUT_MINUTES.store(0, Ordering::SeqCst);
            let _ = BLOCKED_AT.set(Instant::now());
        } else if timeout_minutes > 0 {
            ACTIVE.store(true, Ordering::SeqCst);
            TIMEOUT_MINUTES.store(timeout_minutes, Ordering::SeqCst);
            let _ = BLOCKED_AT.set(Instant::now());
        } else {
            ACTIVE.store(false, Ordering::SeqCst);
            TIMEOUT_MINUTES.store(0, Ordering::SeqCst);
        }

        INIT.call_once(|| {
            let _ = thread::Builder::new()
                .name("sleep-guard".into())
                .spawn(|| loop {
                    let should_block = ACTIVE.load(Ordering::SeqCst);
                    let timed_out = if should_block {
                        let timeout = TIMEOUT_MINUTES.load(Ordering::SeqCst);
                        if timeout > 0 {
                            BLOCKED_AT.get()
                                .map(|start| start.elapsed() >= Duration::from_secs(timeout as u64 * 60))
                                .unwrap_or(false)
                        } else {
                            false // never
                        }
                    } else {
                        true // not active, so timeout is irrelevant
                    };

                    let flags = if should_block && !timed_out {
                        ES_CONTINUOUS | ES_SYSTEM_REQUIRED
                    } else {
                        ES_CONTINUOUS // allow sleep
                    };
                    unsafe { SetThreadExecutionState(flags); }
                    thread::sleep(Duration::from_secs(30));
                });
        });
    }

    pub fn prevent_system_sleep(enable: bool) {
        if enable {
            set_config(true, 0);
        } else {
            set_config(false, 0);
        }
    }
}

#[cfg(target_os = "windows")]
pub use imp::{prevent_system_sleep, set_config};

#[cfg(not(target_os = "windows"))]
pub fn prevent_system_sleep(_enable: bool) {}

#[cfg(not(target_os = "windows"))]
pub fn set_config(_never: bool, _timeout_minutes: u32) {}
