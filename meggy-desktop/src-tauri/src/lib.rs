use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};

/// Entry point for the Meggy desktop application.
///
/// Features:
///  - Opens https://educa.eu.org in a native window (no browser chrome).
///  - System tray with "Mostrar / Ocultar / Sair" menu.
///  - Close button minimizes to tray (app stays running).
///  - Plugins: autostart, notification, shell.
///
/// v1.0.3: Removed tauri_plugin_global_shortcut (API changed in Tauri 2.0 —
/// uses Builder instead of init()). Will re-add in v1.1.0 with proper setup.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .setup(|app| {
            // ─── System Tray ───
            let show_item = MenuItem::with_id(app, "show", "Mostrar Meggy", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "Ocultar para bandeja", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(true)
                .tooltip("Meggy — Plataforma de Estudos")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
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
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Minimize to tray instead of closing — the app stays running
            // in the background so the user can quickly resume studying.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
