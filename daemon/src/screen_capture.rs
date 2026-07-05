//! Screen streaming module.
//! - MJPEG over WebSocket (XCap / DXGI capture + JPEG encode, low latency)
//! - FFmpeg H.264 over HTTP (gdigrab + h264_mf or libx264)

use std::process::{Command, Stdio, Child};
use std::sync::Mutex;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::mpsc;

// ══════════════════════════════════════════════
// MJPEG — XCap / DXGI + JPEG, sent over WS
// ══════════════════════════════════════════════

pub fn start(tx: mpsc::UnboundedSender<Vec<u8>>) -> StreamHandle {
    let running = Arc::new(AtomicBool::new(true));
    let flag = running.clone();
    std::thread::spawn(move || {
        let monitors = match xcap::Monitor::all() { Ok(m) => m, Err(e) => { tracing::error!("xcap: {e}"); return } };
        let Some(monitor) = monitors.into_iter().next() else { tracing::error!("xcap: no monitors"); return };
        while flag.load(Ordering::Relaxed) {
            let t0 = std::time::Instant::now();
            let img = match monitor.capture_image() { Ok(i) => i, Err(_) => { std::thread::sleep(std::time::Duration::from_millis(33)); continue } };
            let mut rgb = image::DynamicImage::from(img).to_rgb8();
            let (w, h) = rgb.dimensions();
            if w > 1280 { let r = 1280.0 / w as f64; rgb = image::imageops::resize(&rgb, 1280, (h as f64 * r) as u32, image::imageops::FilterType::CatmullRom); }
            let (w, h) = rgb.dimensions();
            let mut jpeg = Vec::with_capacity(512 * 1024);
            if image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 85).encode(&rgb, w, h, image::ColorType::Rgb8.into()).is_err() { continue; }
            if tx.send(jpeg).is_err() { break; }
            let e = t0.elapsed(); if e < std::time::Duration::from_millis(33) { std::thread::sleep(std::time::Duration::from_millis(33) - e); }
        }
    });
    StreamHandle { running }
}

pub struct StreamHandle { running: Arc<AtomicBool> }
impl StreamHandle { pub fn stop(&self) { self.running.store(false, Ordering::Relaxed); } }

// ══════════════════════════════════════════════
// FFmpeg H.264 streaming modes
// ══════════════════════════════════════════════

pub enum StreamMode { H264Mf, Libx264 }

pub struct FfmpegStream { child: Mutex<Option<Child>> }

impl FfmpegStream {
    pub fn start(mode: StreamMode, width: u32, height: u32, fps: u32, bitrate: &str) -> std::io::Result<Self> {
        let scale = format!("scale={}:{}", width, height);
        let fps_str = fps.to_string();
        let (encoder, extra): (&str, &[&str]) = match mode {
            StreamMode::H264Mf => ("h264_mf", &["-preset", "veryfast"]),
            StreamMode::Libx264 => ("libx264", &["-preset", "ultrafast", "-tune", "zerolatency"]),
        };
        let mut args = vec![
            "-f", "gdigrab", "-framerate", fps_str.as_str(), "-i", "desktop",
            "-c:v", encoder, "-b:v", bitrate, "-vf", scale.as_str(),
            "-f", "mp4", "-movflags", "frag_keyframe+empty_moov",
            "-progress", "pipe:2", "-loglevel", "warning",
        ];
        args.extend(extra);
        args.push("-");

        let child = Command::new("ffmpeg").args(&args).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()?;
        tracing::info!("ffmpeg {encoder} (pid {}, {}x{}@{}fps, {}b)", child.id(), width, height, fps, bitrate);
        Ok(Self { child: Mutex::new(Some(child)) })
    }
    pub fn take_stdout(&self) -> Option<std::process::ChildStdout> { self.child.lock().unwrap().as_mut().and_then(|c| c.stdout.take()) }
    pub fn stop(&self) { if let Some(mut child) = self.child.lock().unwrap().take() { let _ = child.kill(); let _ = child.wait(); } }
}
impl Drop for FfmpegStream { fn drop(&mut self) { self.stop(); } }
