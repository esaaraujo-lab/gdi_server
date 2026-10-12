use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, WindowEvent, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, ShortcutState};
use std::path::PathBuf;

fn downloads_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join("Meggy").join("Downloads"))
}

/// v1.1.3: Pause all video/audio playback in the main webview.
/// Uses AppHandle to get the webview window safely.
fn pause_all_media(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let js = r#"
            try {
                document.querySelectorAll('video, audio').forEach(function(el) {
                    if (!el.paused) { el.pause(); }
                });
                if (window.player && typeof window.player.pause === 'function') {
                    try { window.player.pause(); } catch(e) {}
                }
                if (window.__gdiPlayer && typeof window.__gdiPlayer.pause === 'function') {
                    try { window.__gdiPlayer.pause(); } catch(e) {}
                }
                document.querySelectorAll('iframe').forEach(function(frame) {
                    try {
                        frame.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
                    } catch(e) {}
                });
            } catch(e) {}
        "#;
        let _ = window.eval(js);
    }
}

/// Hide main window + pause media
fn hide_main_window(app: &AppHandle) {
    pause_all_media(app);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

/// Show main window + focus
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn open_downloads_folder() -> Result<String, String> {
    let path = downloads_dir().ok_or("Could not find home directory")?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    open::that(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

fn open_new_window_internal(app: &AppHandle) -> tauri::Result<()> {
    let mut idx = 1;
    loop {
        let label = format!("window-{}", idx);
        if app.get_webview_window(&label).is_none() {
            WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
                .title("Meggy — Plataforma de Estudos")
                .inner_size(1024.0, 720.0)
                .min_inner_size(800.0, 600.0)
                .center()
                .resizable(true)
                .build()?;
            return Ok(());
        }
        idx += 1;
    }
}

#[tauri::command]
fn open_new_window(app: AppHandle) -> Result<(), String> {
    open_new_window_internal(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            hide_main_window(&app);
        } else {
            show_main_window(&app);
        }
    }
    Ok(())
}

/// v1.1.3: Entry point.
/// FIX: Removed pause_all_media from on_window_event (caused crash on startup).
/// Now pause is ONLY called from tray menu and Ctrl+Shift+M (where we have AppHandle).
/// The close button (X) just hides the window without pausing — media stops
/// because the webview is hidden (browser pauses hidden tabs in most cases).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    let mods = shortcut.mods;
                    let ctrl_shift =
                        mods.contains(Modifiers::CONTROL) && mods.contains(Modifiers::SHIFT);
                    if ctrl_shift {
                        match shortcut.key {
                            Code::KeyN => {
                                let _ = open_new_window_internal(app);
                            }
                            Code::KeyM => {
                                if let Some(window) = app.get_webview_window("main") {
                                    if window.is_visible().unwrap_or(false) {
                                        hide_main_window(app);
                                    } else {
                                        show_main_window(app);
                                    }
                                }
                            }
                            Code::KeyD => {
                                let _ = open_downloads_folder();
                            }
                            _ => {}
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            open_downloads_folder,
            open_new_window,
            toggle_main_window,
        ])
        .setup(|app| {
            // ─── System Tray ───
            let show_item =
                MenuItem::with_id(app, "show", "Mostrar Meggy", true, None::<&str>)?;
            let hide_item =
                MenuItem::with_id(app, "hide", "Ocultar para bandeja (pausa áudio)", true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let new_window_item =
                MenuItem::with_id(app, "new_window", "Nova Janela", true, None::<&str>)?;
            let downloads_item = MenuItem::with_id(
                app,
                "downloads",
                "Abrir pasta de Downloads",
                true,
                None::<&str>,
            )?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[
                &show_item,
                &hide_item,
                &sep1,
                &new_window_item,
                &downloads_item,
                &sep2,
                &quit_item,
            ])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(true)
                .tooltip("Meggy — Plataforma de Estudos")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        show_main_window(app);
                    }
                    "hide" => {
                        // ★ v1.1.3: Pause media before hiding (from tray menu)
                        hide_main_window(app);
                    }
                    "new_window" => {
                        let _ = open_new_window_internal(app);
                    }
                    "downloads" => {
                        let _ = open_downloads_folder();
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // ─── Global Shortcuts ───
            app.global_shortcut().register("Ctrl+Shift+N")?;
            app.global_shortcut().register("Ctrl+Shift+M")?;
            app.global_shortcut().register("Ctrl+Shift+D")?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // ★ v1.1.3 FIX: Simplified — just hide, NO app_handle() call
            // (the app_handle() call in v1.1.2 caused a crash on startup on
            // some Windows machines — "opens and closes immediately").
            // Media pausing is now handled ONLY in tray menu + Ctrl+Shift+M.
            // When the window is hidden via X button, the browser engine
            // automatically throttles/pauses media in most cases.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
