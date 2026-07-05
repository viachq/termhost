//! Screen capture and streaming modules.
//! - `start()` — old XCap + JPEG streaming (via WebSocket, kept for compatibility)
//! - `FfmpegStream` — new FFmpeg H.264 hardware-encoded stream (via HTTP)

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tokio::sync::mpsc;

// ══════════════════════════════════════════════
// XCap + JPEG streaming (legacy WS-based)
// ══════════════════════════════════════════════

const FPS: u64 = 10;
const JPEG_QUALITY: u8 = 85;
const MAX_WIDTH: u32 = 1280;

pub fn start(tx: mpsc::UnboundedSender<Vec<u8>>) -> StreamHandle {
    let running = Arc::new(AtomicBool::new(true));
    let flag = running.clone();

    std::thread::spawn(move || {
        let monitors = match xcap::Monitor::all() {
            Ok(m) => m,
            Err(e) => {
                tracing::error!("xcap: failed to list monitors: {e}");
                return;
            }
        };
        let Some(monitor) = monitors.into_iter().next() else {
            tracing::error!("xcap: no monitors found");
            return;
        };

        let interval = std::time::Duration::from_millis(1000 / FPS);

        while flag.load(Ordering::Relaxed) {
            let t0 = std::time::Instant::now();

            let img = match monitor.capture_image() {
                Ok(img) => img,
                Err(e) => {
                    tracing::error!("xcap: capture failed: {e}");
                    std::thread::sleep(interval);
                    continue;
                }
            };

            let mut rgb = image::DynamicImage::from(img).to_rgb8();
            let (w, h) = rgb.dimensions();
            if w > MAX_WIDTH {
                let ratio = MAX_WIDTH as f64 / w as f64;
                rgb = image::imageops::resize(&rgb, MAX_WIDTH, (h as f64 * ratio) as u32, image::imageops::FilterType::CatmullRom);
            }
            let (w, h) = rgb.dimensions();

            let mut jpeg_buf = Vec::with_capacity(512 * 1024);
            {
                let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg_buf, JPEG_QUALITY);
                if let Err(e) = encoder.encode(&rgb, w, h, image::ColorType::Rgb8.into()) {
                    tracing::error!("jpeg encode failed: {e}");
                    std::thread::sleep(interval);
                    continue;
                }
            }

            if tx.send(jpeg_buf).is_err() { break; }

            let elapsed = t0.elapsed();
            if elapsed < interval { std::thread::sleep(interval - elapsed); }
        }
    });

    StreamHandle { running }
}

pub struct StreamHandle {
    running: Arc<AtomicBool>,
}

impl StreamHandle {
    pub fn stop(&self) { self.running.store(false, Ordering::Relaxed); }
}

// ══════════════════════════════════════════════
// FFmpeg H.264 hardware stream (HTTP-based)
// ══════════════════════════════════════════════

pub struct FfmpegStream {
    child: Mutex<Option<Child>>,
}

impl FfmpegStream {
    pub fn start() -> std::io::Result<Self> {
        let child = Command::new("ffmpeg")
            .args([
                "-f", "gdigrab",
                "-framerate", "15",
                "-i", "desktop",
                "-c:v", "h264_mf",
                "-b:v", "1.5M",
                "-vf", "scale=1280:720",
                "-f", "mp4",
                "-movflags", "frag_keyframe+empty_moov",
                "-progress", "pipe:2",
                "-loglevel", "warning",
                "-",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        tracing::info!("ffmpeg stream started (pid {})", child.id());
        Ok(Self { child: Mutex::new(Some(child)) })
    }

    pub fn take_stdout(&self) -> Option<std::process::ChildStdout> {
        self.child.lock().unwrap().as_mut().and_then(|c| c.stdout.take())
    }

    pub fn stop(&self) {
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
            tracing::info!("ffmpeg stream stopped");
        }
    }
}

impl Drop for FfmpegStream {
    fn drop(&mut self) { self.stop(); }
}
