use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, WindowEvent, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, ShortcutState};
use std::path::PathBuf;

/// Return the user's Meggy Downloads directory: `~/Meggy/Downloads/`.
fn downloads_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join("Meggy").join("Downloads"))
}

/// v1.1.1: Pause all video/audio playback in the webview before hiding the window.
/// This prevents the "audio keeps playing after closing" bug.
/// Injects JavaScript that pauses all <video>, <audio>, and Plyr players.
fn pause_all_media(window: &tauri::WebviewWindow) {
    let js = r#"
        try {
            // Pause all HTML5 video and audio elements
            document.querySelectorAll('video, audio').forEach(function(el) {
                if (!el.paused) {
                    el.pause();
                }
            });
            // Pause Plyr player (Meggy uses Plyr for video playback)
            if (window.player && typeof window.player.pause === 'function') {
                try { window.player.pause(); } catch(e) {}
            }
            // Pause any GDI player instance
            if (window.__gdiPlayer && typeof window.__gdiPlayer.pause === 'function') {
                try { window.__gdiPlayer.pause(); } catch(e) {}
            }
            // Pause any YouTube/iframe embeds
            document.querySelectorAll('iframe').forEach(function(frame) {
                try {
                    frame.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
                } catch(e) {}
            });
        } catch(e) {
            console.warn('[Meggy Desktop] pause_all_media error:', e);
        }
    "#;
    let _ = window.eval(js);
}

/// Open the Meggy Downloads folder (`~/Meggy/Downloads/`) in the system
/// file manager. Creates the folder if it does not yet exist.
#[tauri::command]
fn open_downloads_folder() -> Result<String, String> {
    let path = downloads_dir().ok_or("Could not find home directory")?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    open::that(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Hide the main window and pause all media playback.
/// Used by: close button, "hide" tray menu, Ctrl+Shift+M.
fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        // ★ v1.1.1: Pause all video/audio BEFORE hiding the window
        pause_all_media(&window);
        let _ = window.hide();
    }
}

/// Show the main window and focus it.
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Open a new Meggy window pointing to the educa.eu.org platform.
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

/// Entry point for the Meggy desktop application.
///
/// v1.1.1 FIX: When the window is hidden (close-to-tray or Ctrl+Shift+M),
/// all video/audio playback is PAUSED via JavaScript injection. This prevents
/// the "audio keeps playing after closing" bug.
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
                                // ★ v1.1.1: Use hide_main_window which pauses media
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
                MenuItem::with_id(app, "hide", "Ocultar para bandeja", true, None::<&str>)?;
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
                        // ★ v1.1.1: Pause media before hiding
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
            // ★ v1.1.1: When closing the main window, PAUSE ALL MEDIA before hiding.
            // This prevents the "audio keeps playing after closing" bug.
            // Only the *main* window is sent to the tray; extra windows close normally.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    // Get the WebviewWindow from the Window (needed for eval())
                    let app = window.app_handle();
                    if let Some(webview_window) = app.get_webview_window("main") {
                        pause_all_media(&webview_window);
                    }
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
