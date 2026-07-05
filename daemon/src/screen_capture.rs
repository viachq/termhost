//! Screen streaming via XCap (DXGI) + FFmpeg H.264 hardware encoding.
//! Capture: XCap uses DXGI Desktop Duplication — same as OBS, 0.5% CPU.
//! Encode: FFmpeg with h264_mf (MediaFoundation) — Intel QuickSync GPU encode.
//! Transport: fragmented MP4 served as HTTP chunked response to `<video>` element.

use std::io::Write;
use std::process::{Command, Stdio, Child};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

// ══════════════════════════════════════════════
// Legacy XCap + JPEG streaming (kept for WS-based fallback)
// ══════════════════════════════════════════════

use tokio::sync::mpsc;

const XCAP_FPS: u64 = 10;
const JPEG_QUALITY: u8 = 85;
const MAX_WIDTH: u32 = 1280;

pub fn start(tx: mpsc::UnboundedSender<Vec<u8>>) -> StreamHandle {
    let running = Arc::new(AtomicBool::new(true));
    let flag = running.clone();

    thread::spawn(move || {
        let monitors = match xcap::Monitor::all() { Ok(m) => m, Err(e) => { tracing::error!("xcap: {e}"); return } };
        let Some(monitor) = monitors.into_iter().next() else { tracing::error!("xcap: no monitors"); return };
        let interval = std::time::Duration::from_millis(1000 / XCAP_FPS);

        while flag.load(Ordering::Relaxed) {
            let t0 = std::time::Instant::now();
            let img = match monitor.capture_image() { Ok(i) => i, Err(e) => { tracing::error!("xcap: {e}"); thread::sleep(interval); continue } };
            let mut rgb = image::DynamicImage::from(img).to_rgb8();
            let (w, h) = rgb.dimensions();
            if w > MAX_WIDTH { let r = MAX_WIDTH as f64 / w as f64; rgb = image::imageops::resize(&rgb, MAX_WIDTH, (h as f64 * r) as u32, image::imageops::FilterType::CatmullRom); }
            let (w, h) = rgb.dimensions();
            let mut jpeg = Vec::with_capacity(512 * 1024);
            if image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, JPEG_QUALITY).encode(&rgb, w, h, image::ColorType::Rgb8.into()).is_err() { continue; }
            if tx.send(jpeg).is_err() { break; }
            let e = t0.elapsed(); if e < interval { thread::sleep(interval - e); }
        }
    });
    StreamHandle { running }
}

pub struct StreamHandle { running: Arc<AtomicBool> }
impl StreamHandle {
    pub fn stop(&self) { self.running.store(false, Ordering::Relaxed); }
}

// ══════════════════════════════════════════════
// DXGI capture (XCap) + FFmpeg H.264 encode pipeline
// ══════════════════════════════════════════════

/// Default capture params
pub struct StreamConfig {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub bitrate: &'static str,
}

impl Default for StreamConfig {
    fn default() -> Self {
        Self { width: 1280, height: 720, fps: 30, bitrate: "2M" }
    }
}

/// Full pipeline: XCap capture → H.264 encode → fragmented MP4 stdout
pub struct ScreenPipeline {
    ffmpeg: Mutex<Option<Child>>,
    running: Arc<AtomicBool>,
}

impl ScreenPipeline {
    pub fn start(config: StreamConfig) -> std::io::Result<Self> {
        // Spawn FFmpeg: reads raw BGRA from stdin, outputs H.264 fMP4 to stdout
        let mut child = Command::new("ffmpeg")
            .args([
                "-f", "rawvideo",
                "-pixel_format", "bgra",
                "-video_size", &format!("{}x{}", config.width, config.height),
                "-framerate", &config.fps.to_string(),
                "-i", "-",
                "-c:v", "h264_mf",
                "-b:v", config.bitrate,
                "-f", "mp4",
                "-movflags", "frag_keyframe+empty_moov",
                "-progress", "pipe:2",
                "-loglevel", "warning",
                "-",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        let mut ffmpeg_stdin = child.stdin.take().expect("ffmpeg stdin");

        // Start capture + pipe thread
        let running = Arc::new(AtomicBool::new(true));
        let flag = running.clone();

        thread::spawn(move || {
            // Get screens
            let monitors = match xcap::Monitor::all() {
                Ok(m) => m,
                Err(e) => {
                    tracing::error!("xcap: {e}");
                    return;
                }
            };
            let Some(monitor) = monitors.into_iter().next() else {
                tracing::error!("xcap: no monitors");
                return;
            };

            let interval = std::time::Duration::from_micros(1_000_000 / config.fps as u64);
            let frame_size = (config.width * config.height * 4) as usize;

            tracing::info!("dxgi capture started: {}x{} @ {}fps", config.width, config.height, config.fps);

            loop {
                let t0 = std::time::Instant::now();

                // Check stop signal
                if !flag.load(Ordering::Relaxed) {
                    tracing::debug!("dxgi capture: stop flag set");
                    break;
                }

                let img = match monitor.capture_image() {
                    Ok(i) => i,
                    Err(e) => { tracing::warn!("xcap capture failed: {e}"); thread::sleep(interval); continue; }
                };

                let raw = img.as_raw();

                // Resize if needed
                if img.width() != config.width || img.height() != config.height {
                    tracing::debug!("resizing from {}x{} → {}x{}", img.width(), img.height(), config.width, config.height);
                    let resized = image::imageops::resize(
                        &img, config.width, config.height,
                        image::imageops::FilterType::CatmullRom,
                    );
                    tracing::debug!("resized done, raw len={}", resized.as_raw().len());
                    if ffmpeg_stdin.write_all(resized.as_raw()).is_err() {
                        tracing::warn!("ffmpeg stdin write failed after resize ({} bytes)", resized.as_raw().len());
                        break;
                    }
                } else {
                    tracing::debug!("writing raw frame {}x{} ({} bytes)", img.width(), img.height(), raw.len());
                    if ffmpeg_stdin.write_all(raw).is_err() {
                        tracing::warn!("ffmpeg stdin write failed raw ({} bytes)", raw.len());
                        break;
                    }
                }

                let elapsed = t0.elapsed();
                if elapsed < interval { thread::sleep(interval - elapsed); }
            }

            let _ = ffmpeg_stdin.flush();
            tracing::info!("dxgi capture stopped");
        });

        tracing::info!("screen pipeline started (pid {})", child.id());

        Ok(Self {
            ffmpeg: Mutex::new(Some(child)),
            running,
        })
    }

    pub fn take_stdout(&self) -> Option<std::process::ChildStdout> {
        self.ffmpeg.lock().unwrap().as_mut().and_then(|c| c.stdout.take())
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
        if let Some(mut child) = self.ffmpeg.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
            tracing::info!("screen pipeline stopped");
        }
    }
}

impl Drop for ScreenPipeline {
    fn drop(&mut self) { self.stop(); }
}
