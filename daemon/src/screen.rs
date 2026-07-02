use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Server-side virtual terminal per PTY. We feed it the same bytes the PTY emits,
/// so at any moment `snapshot()` yields the *current screen* (cursor + colours in
/// place) — unlike a raw byte-buffer replay, which re-runs historical redraws and
/// scrolls a shell prompt off-screen (PSReadLine, TUIs). Used to paint a freshly
/// attached mobile client cleanly.
pub struct ScreenManager {
    parsers: HashMap<String, Arc<Mutex<vt100::Parser>>>,
}

impl ScreenManager {
    pub fn new() -> Self {
        Self { parsers: HashMap::new() }
    }

    pub fn create(&mut self, id: &str, rows: u16, cols: u16) -> Arc<Mutex<vt100::Parser>> {
        // 1000 lines of scrollback so history is retained alongside the live screen.
        let p = Arc::new(Mutex::new(vt100::Parser::new(rows, cols, 1000)));
        self.parsers.insert(id.to_string(), p.clone());
        p
    }

    pub fn feed(parser: &Arc<Mutex<vt100::Parser>>, data: &[u8]) {
        if let Ok(mut p) = parser.lock() {
            p.process(data);
        }
    }

    pub fn feed_by_id(&self, id: &str, data: &[u8]) {
        if let Some(p) = self.parsers.get(id) {
            Self::feed(p, data);
        }
    }

    pub fn resize(&self, id: &str, rows: u16, cols: u16) {
        if let Some(p) = self.parsers.get(id) {
            if let Ok(mut p) = p.lock() {
                p.set_size(rows, cols);
            }
        }
    }

    /// Bytes that, written to a fresh terminal, reproduce the current screen.
    pub fn snapshot(&self, id: &str) -> Option<String> {
        self.parsers.get(id).and_then(|p| {
            p.lock().ok().map(|p| {
                String::from_utf8_lossy(&p.screen().contents_formatted()).into_owned()
            })
        })
    }

    pub fn remove(&mut self, id: &str) {
        self.parsers.remove(id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // A TUI positions text absolutely and redraws in place. The snapshot must
    // reconstruct the *current* grid — including content the cursor jumped back to
    // draw — not the linear byte order. Deterministic (no capture-timing flakiness).
    #[test]
    fn snapshot_reconstructs_positioned_screen() {
        let mut sm = ScreenManager::new();
        let p = sm.create("t", 24, 80);
        // clear, draw at row3/col5, then jump to row10 and draw — classic TUI redraw.
        ScreenManager::feed(&p, b"\x1b[2J\x1b[3;5HHELLO\x1b[10;1Hworld");
        let visible = strip_escapes(&sm.snapshot("t").expect("snapshot"));
        assert!(visible.contains("HELLO"), "missing positioned text: {visible:?}");
        assert!(visible.contains("world"), "missing second line: {visible:?}");
    }

    // Content that scrolls off the visible grid must NOT appear in the snapshot —
    // this is exactly why raw byte-replay fails and the snapshot is needed.
    #[test]
    fn snapshot_is_bounded_to_visible_grid() {
        let mut sm = ScreenManager::new();
        let p = sm.create("t", 24, 80);
        ScreenManager::feed(&p, b"OLD_PROMPT");
        // push 30 newlines: OLD_PROMPT scrolls into history, off the 24-row screen
        for _ in 0..30 { ScreenManager::feed(&p, b"\r\n"); }
        ScreenManager::feed(&p, b"NEW_PROMPT>");
        let visible = strip_escapes(&sm.snapshot("t").expect("snapshot"));
        assert!(visible.contains("NEW_PROMPT>"), "current prompt must show");
        assert!(!visible.contains("OLD_PROMPT\n") && visible.matches("OLD_PROMPT").count() == 0,
            "scrolled-off content must not be in the snapshot: {visible:?}");
    }

    fn strip_escapes(s: &str) -> String {
        // crude CSI/OSC stripper just for the assertion/printout
        let b = s.as_bytes();
        let mut out = String::new();
        let mut i = 0;
        while i < b.len() {
            if b[i] == 0x1b {
                i += 1;
                if i < b.len() && b[i] == b'[' {
                    i += 1;
                    while i < b.len() && !(0x40..=0x7e).contains(&b[i]) { i += 1; }
                    i += 1;
                } else if i < b.len() && b[i] == b']' {
                    while i < b.len() && b[i] != 0x07 { i += 1; }
                    i += 1;
                } else { i += 1; }
            } else {
                out.push(b[i] as char);
                i += 1;
            }
        }
        out
    }
}
