//! Screen capture and JPEG encoding for mobile screen view.
//! Uses XCap (DXGI on Windows) for capture — same API as OBS/Discord.
//! Frames are sent as binary WebSocket messages.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::mpsc;

/// How many frames per second to capture.
const FPS: u64 = 10;
/// JPEG quality (1–100). 60 is fine for terminal text.
const JPEG_QUALITY: u8 = 60;

/// Start capturing the primary monitor and sending JPEG frames into `tx`.
/// Returns a handle; drop it or call `stop()` to end the stream.
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
        tracing::info!("screen stream started on primary monitor");

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

            // Convert RGBA → RGB (JPEG doesn't support alpha)
            let rgb = image::DynamicImage::from(img).to_rgb8();
            let (w, h) = rgb.dimensions();

            // Encode to JPEG
            let mut jpeg_buf = Vec::with_capacity(512 * 1024);
            {
                let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
                    &mut jpeg_buf,
                    JPEG_QUALITY,
                );
                if let Err(e) = encoder.encode(
                    &rgb,
                    w,
                    h,
                    image::ColorType::Rgb8.into(),
                ) {
                    tracing::error!("jpeg encode failed: {e}");
                    std::thread::sleep(interval);
                    continue;
                }
            }

            if tx.send(jpeg_buf).is_err() {
                // Receiver dropped — client disconnected
                break;
            }

            let elapsed = t0.elapsed();
            if elapsed < interval {
                std::thread::sleep(interval - elapsed);
            }
        }
    });

    StreamHandle { running }
}

/// Drop this handle or call `stop()` to stop the stream.
pub struct StreamHandle {
    running: Arc<AtomicBool>,
}

impl StreamHandle {
    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
    }
}
