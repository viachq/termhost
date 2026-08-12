use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;

/// Reference-counted handle to a CloudflareTunnel instance.
pub type CloudflareTunnelRef = Arc<CloudflareTunnel>;

/// Manages the cloudflared child process that creates a Cloudflare Tunnel
/// to make the local HTTP server publicly accessible.
pub struct CloudflareTunnel {
    child: Mutex<Option<std::process::Child>>,
    url: Mutex<Option<String>>,
    running: AtomicBool,
}

impl CloudflareTunnel {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            child: Mutex::new(None),
            url: Mutex::new(None),
            running: AtomicBool::new(false),
        })
    }

    /// Start cloudflared pointing at the given local URL.
    /// Returns the public URL on success, or an error message.
    pub async fn start(self: &Arc<Self>, local_url: &str) -> Result<String, String> {
        let mut child_lock = self.child.lock().await;
        if child_lock.is_some() {
            return Err("Cloudflare Tunnel already running".into());
        }

        // First check if cloudflared is on PATH
        let which = std::process::Command::new("where")
            .arg("cloudflared")
            .output()
            .map_err(|e| format!("Failed to check for cloudflared: {e}"))?;

        if !which.status.success() {
            return Err("cloudflared not found on PATH. Install it with: winget install cloudflared".into());
        }

        // Spawn cloudflared tunnel
        let mut child = std::process::Command::new("cloudflared")
            .args([
                "tunnel",
                "--url",
                local_url,
                "--no-autoupdate",
            ])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start cloudflared: {e}"))?;

        let stdout = child.stdout.take()
            .ok_or_else(|| "Failed to capture cloudflared stdout".to_string())?;
        let stderr = child.stderr.take()
            .ok_or_else(|| "Failed to capture cloudflared stderr".to_string())?;

        self.running.store(true, Ordering::SeqCst);

        // Use a oneshot channel to receive the URL from stdout/stderr readers
        let (url_tx, mut url_rx) = tokio::sync::mpsc::channel::<String>(1);
        let url_tx_stdout = url_tx.clone();
        let url_tx_stderr = url_tx;

        // Spawn a reader task for stdout
        tokio::spawn(async move {
            Self::read_url_stdout(stdout, url_tx_stdout).await;
        });

        // Spawn a reader task for stderr
        tokio::spawn(async move {
            Self::read_url_stderr(stderr, url_tx_stderr).await;
        });

        // Wait up to 10 seconds for the URL to arrive
        let timeout_dur = std::time::Duration::from_secs(10);
        let result = tokio::time::timeout(timeout_dur, url_rx.recv()).await;
        *child_lock = Some(child);

        match result {
            Ok(Some(url)) => {
                *self.url.lock().await = Some(url.clone());
                Ok(url)
            }
            Ok(None) => Err("Cloudflare Tunnel reader ended without yielding a URL".into()),
            Err(_) => {
                Err("Cloudflare Tunnel started but timed out waiting for the public URL (10s). Check that cloudflared has internet access.".into())
            }
        }
    }

    async fn read_url_stdout(
        stdout: std::process::ChildStdout,
        url_tx: tokio::sync::mpsc::Sender<String>,
    ) {
        use tokio::io::AsyncBufReadExt;
        let reader = tokio::io::BufReader::new(tokio::process::ChildStdout::from_std(stdout).unwrap());
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.contains(".trycloudflare.com") || line.contains("https://") {
                let extracted = line.split_whitespace()
                    .find(|w| w.starts_with("https://"))
                    .or_else(|| {
                        line.split('|')
                            .find(|w| w.trim().starts_with("https://"))
                            .map(|w| w.trim())
                    });
                if let Some(url) = extracted {
                    let _ = url_tx.send(url.to_string()).await;
                    break;
                }
            }
        }
    }

    async fn read_url_stderr(
        stderr: std::process::ChildStderr,
        url_tx: tokio::sync::mpsc::Sender<String>,
    ) {
        use tokio::io::AsyncBufReadExt;
        let reader = tokio::io::BufReader::new(tokio::process::ChildStderr::from_std(stderr).unwrap());
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.contains(".trycloudflare.com") || line.contains("https://") {
                let extracted = line.split_whitespace()
                    .find(|w| w.starts_with("https://"))
                    .or_else(|| {
                        line.split('|')
                            .find(|w| w.trim().starts_with("https://"))
                            .map(|w| w.trim())
                    });
                if let Some(url) = extracted {
                    let _ = url_tx.send(url.to_string()).await;
                    break;
                }
            }
        }
    }

    /// Stop the cloudflared tunnel
    pub async fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        let mut child_lock = self.child.lock().await;
        if let Some(mut c) = child_lock.take() {
            let _ = c.kill();
            let _ = c.wait();
        }
        *self.url.lock().await = None;
    }

    /// Get the current public URL, if available
    pub async fn url(&self) -> Option<String> {
        self.url.lock().await.clone()
    }

    /// Check if the tunnel is running
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}
