use std::os::windows::process::CommandExt;
use crate::{BroadcastMsg, DaemonState};
use tray_icon::menu::{Menu, MenuItem, PredefinedMenuItem, MenuEvent};
use tray_icon::{TrayIconBuilder, TrayIconEvent, Icon};
use std::sync::Arc;

const ICON_BYTES: &[u8] = include_bytes!("../icon.ico");

fn load_icon() -> Icon {
    let img = image::load_from_memory_with_format(ICON_BYTES, image::ImageFormat::Ico)
        .expect("Failed to decode icon")
        .into_rgba8();
    let (w, h) = img.dimensions();
    Icon::from_rgba(img.into_raw(), w, h).expect("Failed to create tray icon")
}

pub fn run_tray(state: Arc<DaemonState>) {
    let icon = load_icon();

    let menu = Menu::new();
    let show_item = MenuItem::new("Open Agent Workspace", true, None);
    let show_id = show_item.id().clone();
    let kill_item = MenuItem::new("Kill all terminals", true, None);
    let kill_id = kill_item.id().clone();
    let shutdown_item = MenuItem::new("Shutdown daemon", true, None);
    let shutdown_id = shutdown_item.id().clone();

    let _ = menu.append(&show_item);
    let _ = menu.append(&PredefinedMenuItem::separator());
    let _ = menu.append(&kill_item);
    let _ = menu.append(&shutdown_item);

    let _tray = TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_tooltip("Agent Workspace (daemon)")
        .with_icon(icon)
        .build()
        .expect("Failed to create tray icon");

    let menu_rx = MenuEvent::receiver();
    let tray_rx = TrayIconEvent::receiver();

    loop {
        // Process Win32 messages so the tray icon works
        unsafe {
            let mut msg = std::mem::zeroed::<winapi::um::winuser::MSG>();
            while winapi::um::winuser::PeekMessageW(
                &mut msg,
                std::ptr::null_mut(),
                0,
                0,
                winapi::um::winuser::PM_REMOVE,
            ) != 0
            {
                winapi::um::winuser::TranslateMessage(&msg);
                winapi::um::winuser::DispatchMessageW(&msg);
            }
        }

        // Handle menu events
        if let Ok(event) = menu_rx.try_recv() {
            if event.id() == &show_id {
                handle_show(&state);
            } else if event.id() == &kill_id {
                handle_kill_all(&state);
            } else if event.id() == &shutdown_id {
                std::process::exit(0);
            }
        }

        // Handle tray icon events (double-click to open app)
        if let Ok(TrayIconEvent::DoubleClick { .. }) = tray_rx.try_recv() {
            handle_show(&state);
        }

        std::thread::sleep(std::time::Duration::from_millis(50));
    }
}

fn handle_show(state: &Arc<DaemonState>) {
    let clients = state.client_count.load(std::sync::atomic::Ordering::Relaxed);
    if clients > 0 {
        let _ = state.broadcast_tx.send(BroadcastMsg::ShowWindow);
    } else {
        launch_app();
    }
}

fn handle_kill_all(state: &Arc<DaemonState>) {
    let ids: Vec<String> = state.pty_manager.lock()
        .map(|m| m.list_ids())
        .unwrap_or_default();
    for id in ids {
        if let Ok(mut mgr) = state.pty_manager.lock() {
            mgr.kill(&id);
        }
        if let Ok(mut bm) = state.buffer_manager.lock() {
            bm.remove(&id);
        }
        if let Ok(mut infos) = state.terminal_infos.lock() {
            infos.retain(|t| t.id != id);
        }
    }
}

fn launch_app() {
    let daemon_exe = std::env::current_exe().unwrap_or_default();
    let dir = daemon_exe.parent().unwrap_or(std::path::Path::new("."));
    let app_exe = dir.join("agent-workspace.exe");

    if app_exe.exists() {
        let _ = std::process::Command::new(&app_exe)
            .creation_flags(0x00000200) // CREATE_NEW_PROCESS_GROUP
            .spawn();
    } else {
        // Dev mode: app exe is in src-tauri/target/debug/
        let dev_app = dir  // daemon/target/debug
            .parent().unwrap()  // daemon/target
            .parent().unwrap()  // daemon
            .parent().unwrap()  // project root
            .join("src-tauri").join("target").join("debug").join("agent-workspace.exe");
        if dev_app.exists() {
            let _ = std::process::Command::new(&dev_app)
                .creation_flags(0x00000200)
                .spawn();
        } else {
            eprintln!("App exe not found at {:?} or {:?}", app_exe, dev_app);
        }
    }
}
