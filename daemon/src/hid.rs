//! Types text and sends named special keys system-wide via SendInput — lands
//! wherever Windows currently has keyboard focus (a terminal, a browser
//! field, Notepad, anything). Not tied to any PTY; this is real OS-level
//! keyboard input injection, the same mechanism a physical keyboard or
//! Bluetooth HID device uses.

#[cfg(target_os = "windows")]
mod imp {
    use std::mem::size_of;
    use winapi::um::winuser::{
        SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
        VK_BACK, VK_CONTROL, VK_DOWN, VK_ESCAPE, VK_LEFT, VK_RETURN, VK_RIGHT, VK_TAB, VK_UP,
    };

    fn key_event(vk: u16, scan: u16, unicode: bool, key_up: bool) -> INPUT {
        let mut flags = 0u32;
        if unicode {
            flags |= KEYEVENTF_UNICODE;
        }
        if key_up {
            flags |= KEYEVENTF_KEYUP;
        }
        let ki = KEYBDINPUT {
            wVk: vk,
            wScan: scan,
            dwFlags: flags,
            time: 0,
            dwExtraInfo: 0,
        };
        let mut input: INPUT = unsafe { std::mem::zeroed() };
        input.type_ = INPUT_KEYBOARD;
        unsafe {
            *input.u.ki_mut() = ki;
        }
        input
    }

    fn send_inputs(inputs: &mut [INPUT]) {
        if inputs.is_empty() {
            return;
        }
        unsafe {
            SendInput(
                inputs.len() as u32,
                inputs.as_mut_ptr(),
                size_of::<INPUT>() as i32,
            );
        }
    }

    fn vk_down_up(vk: i32) -> [INPUT; 2] {
        [
            key_event(vk as u16, 0, false, false),
            key_event(vk as u16, 0, false, true),
        ]
    }

    /// Synthesizes a down+up key event pair for every character. Enter and
    /// our backspace marker (`\x7f`, matching the terminal keybar's convention)
    /// go through as real virtual keys (VK_RETURN/VK_BACK) — apps distinguish
    /// an actual Enter/Backspace press from a literal Unicode CR or DEL char,
    /// which KEYEVENTF_UNICODE alone wouldn't reliably trigger everywhere.
    /// Everything else goes through KEYEVENTF_UNICODE, which takes any Unicode
    /// code point directly — no keyboard-layout/virtual-key mapping needed.
    pub fn type_text(text: &str) {
        let mut inputs: Vec<INPUT> = Vec::with_capacity(text.len() * 2);
        for ch in text.chars() {
            match ch {
                '\r' | '\n' => inputs.extend(vk_down_up(VK_RETURN)),
                '\u{7f}' | '\u{8}' => inputs.extend(vk_down_up(VK_BACK)),
                _ => {
                    let mut buf = [0u16; 2];
                    for unit in ch.encode_utf16(&mut buf) {
                        inputs.push(key_event(0, *unit, true, false));
                        inputs.push(key_event(0, *unit, true, true));
                    }
                }
            }
        }
        send_inputs(&mut inputs);
    }

    /// Named special keys / Ctrl-combos the "PC (anywhere)" quick-key row
    /// sends — things literal text typing can't express (Escape, Tab,
    /// arrows, Ctrl+C/V/A/X/Z). Unknown names are ignored.
    pub fn send_key(spec: &str) {
        let mut inputs: Vec<INPUT> = Vec::new();
        match spec {
            "esc" => inputs.extend(vk_down_up(VK_ESCAPE)),
            "tab" => inputs.extend(vk_down_up(VK_TAB)),
            "up" => inputs.extend(vk_down_up(VK_UP)),
            "down" => inputs.extend(vk_down_up(VK_DOWN)),
            "left" => inputs.extend(vk_down_up(VK_LEFT)),
            "right" => inputs.extend(vk_down_up(VK_RIGHT)),
            "ctrl+c" | "ctrl+v" | "ctrl+a" | "ctrl+x" | "ctrl+z" => {
                let letter_vk = spec.as_bytes()[5] as i32; // 'c'/'v'/'a'/'x'/'z' -> ASCII == VK for A-Z when uppercased
                let letter_vk = (letter_vk as u8 as char).to_ascii_uppercase() as i32;
                inputs.push(key_event(VK_CONTROL as u16, 0, false, false));
                inputs.push(key_event(letter_vk as u16, 0, false, false));
                inputs.push(key_event(letter_vk as u16, 0, false, true));
                inputs.push(key_event(VK_CONTROL as u16, 0, false, true));
            }
            _ => {}
        }
        send_inputs(&mut inputs);
    }
}

#[cfg(target_os = "windows")]
pub use imp::{send_key, type_text};

#[cfg(not(target_os = "windows"))]
pub fn type_text(_text: &str) {}
#[cfg(not(target_os = "windows"))]
pub fn send_key(_spec: &str) {}
