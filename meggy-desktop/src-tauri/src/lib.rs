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

/// Open the Meggy Downloads folder (`~/Meggy/Downloads/`) in the system
/// file manager. Creates the folder if it does not yet exist.
///
/// This is the user-facing entry point for the "downloads offline" feature:
/// the web app downloads files via its normal browser mechanism, and the
/// user can find them later via the tray menu or the `Ctrl+Shift+D` shortcut.
#[tauri::command]
fn open_downloads_folder() -> Result<String, String> {
    let path = downloads_dir().ok_or("Could not find home directory")?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    open::that(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Open a new Meggy window pointing to the educa.eu.org platform.
///
/// Each window gets a unique label (`window-1`, `window-2`, …) so the user
/// can keep a video player open in one window and notes / forum in another.
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

/// Tauri command wrapper for `open_new_window_internal`. Exposed to JS as
/// `window.__TAURI__.core.invoke('open_new_window')`.
#[tauri::command]
fn open_new_window(app: AppHandle) -> Result<(), String> {
    open_new_window_internal(&app).map_err(|e| e.to_string())
}

/// Toggle the main window visibility (show / hide). Exposed to JS as
/// `window.__TAURI__.core.invoke('toggle_main_window')`.
#[tauri::command]
fn toggle_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
    Ok(())
}

/// Entry point for the Meggy desktop application.
///
/// Features:
///  - Opens https://educa.eu.org in a native window (no browser chrome).
///  - System tray with "Mostrar / Ocultar / Nova Janela / Downloads / Sair".
///  - Close button minimizes to tray (app stays running).
///  - Multi-window: open additional windows via tray or `Ctrl+Shift+N`.
///  - Global shortcuts:
///      `Ctrl+Shift+M` — toggle main window visibility
///      `Ctrl+Shift+N` — open a new window
///      `Ctrl+Shift+D` — open the downloads folder
///  - Plugins: shell, notification, autostart, global-shortcut.
///
/// v1.1.0: re-added tauri_plugin_global_shortcut using the Tauri 2.0
/// Builder API (`Builder::new().with_handler(...).build()`) instead of the
/// removed `init()` function. Shortcuts are registered in `setup()` via
/// `GlobalShortcutExt::global_shortcut().register(...)`.
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
                    // Only react on key-press (ignore key-release).
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    let mods = shortcut.mods;
                    let ctrl_shift =
                        mods.contains(Modifiers::CONTROL) && mods.contains(Modifiers::SHIFT);
                    if ctrl_shift {
                        match shortcut.key {
                            // Ctrl+Shift+N — open a new window
                            Code::KeyN => {
                                let _ = open_new_window_internal(app);
                            }
                            // Ctrl+Shift+M — toggle main window visibility
                            Code::KeyM => {
                                if let Some(window) = app.get_webview_window("main") {
                                    if window.is_visible().unwrap_or(false) {
                                        let _ = window.hide();
                                    } else {
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                }
                            }
                            // Ctrl+Shift+D — open the downloads folder
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
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
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
            // The handler is set in the plugin Builder above; here we just
            // register which key combinations should trigger it.
            app.global_shortcut().register("Ctrl+Shift+N")?;
            app.global_shortcut().register("Ctrl+Shift+M")?;
            app.global_shortcut().register("Ctrl+Shift+D")?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Minimize to tray instead of closing — the app stays running
            // in the background so the user can quickly resume studying.
            // Only the *main* window is sent to the tray; extra windows
            // (window-1, window-2, …) close normally.
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
