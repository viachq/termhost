use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;

fn encode_powershell_command(cmd: &str) -> String {
    let utf16_le: Vec<u8> = cmd.encode_utf16().flat_map(|c| c.to_le_bytes()).collect();
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((utf16_le.len() + 2) / 3 * 4);
    for chunk in utf16_le.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        out.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        out.push(if chunk.len() > 1 { CHARS[((triple >> 6) & 0x3F) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { CHARS[(triple & 0x3F) as usize] as char } else { '=' });
    }
    out
}

pub struct PtyInstance {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
}

pub struct PtyManager {
    instances: HashMap<String, PtyInstance>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            instances: HashMap::new(),
        }
    }

    pub fn has(&self, id: &str) -> bool {
        self.instances.contains_key(id)
    }

    pub fn register(&mut self, id: String, instance: PtyInstance) {
        self.instances.insert(id, instance);
    }

    pub fn get_writer(&self, id: &str) -> Result<Arc<Mutex<Box<dyn Write + Send>>>, Box<dyn std::error::Error>> {
        let instance = self
            .instances
            .get(id)
            .ok_or_else(|| format!("PTY {} not found", id))?;
        Ok(instance.writer.clone())
    }

    pub fn get_master(&self, id: &str) -> Result<Arc<Mutex<Box<dyn MasterPty + Send>>>, Box<dyn std::error::Error>> {
        let instance = self
            .instances
            .get(id)
            .ok_or_else(|| format!("PTY {} not found", id))?;
        Ok(instance.master.clone())
    }

    pub fn kill(&mut self, id: &str) {
        self.instances.remove(id);
    }
}

pub fn create_pty<F>(
    cwd: &str,
    command: Option<&str>,
    cols: u16,
    rows: u16,
    on_data: F,
) -> Result<PtyInstance, Box<dyn std::error::Error>>
where
    F: Fn(String) + Send + 'static,
{
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let prompt_hook = r#"function prompt { $Host.UI.RawUI.WindowTitle = (Get-Location).Path; return "PS $($executionContext.SessionState.Path.CurrentLocation)$('>' * ($nestedPromptLevel + 1)) " }"#;

    let (exe, args): (&str, Vec<String>) = if let Some(command) = command {
        if command.is_empty() {
            let encoded = encode_powershell_command(prompt_hook);
            ("powershell.exe", vec!["-NoLogo".into(), "-NoExit".into(), "-EncodedCommand".into(), encoded])
        } else {
            let combined = format!("{}; {}", prompt_hook, command);
            let encoded = encode_powershell_command(&combined);
            ("powershell.exe", vec!["-NoLogo".into(), "-NoExit".into(), "-EncodedCommand".into(), encoded])
        }
    } else {
        let encoded = encode_powershell_command(prompt_hook);
        ("powershell.exe", vec!["-NoLogo".into(), "-NoExit".into(), "-EncodedCommand".into(), encoded])
    };

    let mut cmd = CommandBuilder::new(exe);
    cmd.args(&args);
    cmd.cwd(cwd);

    let _child = pair.slave.spawn_command(cmd)?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader()?;
    let writer = pair.master.take_writer()?;

    let (tx, rx) = mpsc::channel::<Vec<u8>>();

    thread::spawn(move || {
        let mut buf = [0u8; 65536];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if tx.send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
            }
        }
    });

    thread::spawn(move || {
        let mut pending = Vec::with_capacity(65536);
        loop {
            match rx.recv() {
                Err(_) => break,
                Ok(data) => pending.extend_from_slice(&data),
            }
            while let Ok(data) = rx.try_recv() {
                pending.extend_from_slice(&data);
            }
            let text = String::from_utf8_lossy(&pending).into_owned();
            on_data(text);
            pending.clear();
        }
    });

    Ok(PtyInstance {
        master: Arc::new(Mutex::new(pair.master)),
        writer: Arc::new(Mutex::new(writer)),
    })
}
