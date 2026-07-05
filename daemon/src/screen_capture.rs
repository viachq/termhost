//! Screen streaming via FFmpeg subprocess with GDI capture + H.264 encoding.
//! Uses `gdigrab` for capture and `h264_mf` (MediaFoundation) for GPU encode.
//! Output is fragmented MP4 piped to the daemon for HTTP live streaming.

use std::process::{Command, Stdio, Child};
use std::sync::Mutex;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::mpsc;

// ══════════════════════════════════════════════
// Legacy XCap + JPEG streaming (WS fallback)
// ══════════════════════════════════════════════

const XCAP_FPS: u64 = 10;
const JPEG_QUALITY: u8 = 85;
const MAX_WIDTH: u32 = 1280;

pub fn start(tx: mpsc::UnboundedSender<Vec<u8>>) -> StreamHandle {
    let running = Arc::new(AtomicBool::new(true));
    let flag = running.clone();
    std::thread::spawn(move || {
        let monitors = match xcap::Monitor::all() { Ok(m) => m, Err(e) => { tracing::error!("xcap: {e}"); return } };
        let Some(monitor) = monitors.into_iter().next() else { tracing::error!("xcap: no monitors"); return };
        let interval = std::time::Duration::from_millis(1000 / XCAP_FPS);
        while flag.load(Ordering::Relaxed) {
            let t0 = std::time::Instant::now();
            let img = match monitor.capture_image() { Ok(i) => i, Err(_) => { std::thread::sleep(interval); continue } };
            let mut rgb = image::DynamicImage::from(img).to_rgb8();
            let (w, h) = rgb.dimensions();
            if w > MAX_WIDTH { let r = MAX_WIDTH as f64 / w as f64; rgb = image::imageops::resize(&rgb, MAX_WIDTH, (h as f64 * r) as u32, image::imageops::FilterType::CatmullRom); }
            let (w, h) = rgb.dimensions();
            let mut jpeg = Vec::with_capacity(512 * 1024);
            if image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, JPEG_QUALITY).encode(&rgb, w, h, image::ColorType::Rgb8.into()).is_err() { continue; }
            if tx.send(jpeg).is_err() { break; }
            let e = t0.elapsed(); if e < interval { std::thread::sleep(interval - e); }
        }
    });
    StreamHandle { running }
}

pub struct StreamHandle { running: Arc<AtomicBool> }
impl StreamHandle {
    pub fn stop(&self) { self.running.store(false, Ordering::Relaxed); }
}

// ══════════════════════════════════════════════
// FFmpeg H.264 hardware stream (HTTP-based)
// ══════════════════════════════════════════════

/// Spawns FFmpeg and streams its stdout (fragmented MP4) via HTTP.
pub struct FfmpegStream {
    child: Mutex<Option<Child>>,
}

impl FfmpegStream {
    /// Start FFmpeg with the given resolution, framerate, and bitrate.
    pub fn start(width: u32, height: u32, fps: u32, bitrate: &str) -> std::io::Result<Self> {
        let scale = format!("scale={}:{}", width, height);

        let child = Command::new("ffmpeg")
            .args([
                "-f", "gdigrab",
                "-framerate", &fps.to_string(),
                "-i", "desktop",
                "-c:v", "h264_mf",
                "-b:v", bitrate,
                "-vf", &scale,
                "-preset", "veryfast",
                "-f", "mp4",
                "-movflags", "frag_keyframe+empty_moov",
                "-progress", "pipe:2",
                "-loglevel", "warning",
                "-",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        tracing::info!("ffmpeg stream started (pid {}, {}x{} @ {}fps, {}b)", child.id(), width, height, fps, bitrate);
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
