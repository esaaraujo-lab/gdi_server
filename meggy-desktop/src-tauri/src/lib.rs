// ═══════════════════════════════════════════════════════════════
// Meggy Desktop — Rust Backend (Tauri 2.0)
// App nativo para Windows/Linux/macOS
// ═══════════════════════════════════════════════════════════════

mod api;
mod auth;
mod db;
mod scanner;

use tauri::{Emitter, Manager};
use tauri_plugin_single_instance::init as init_single_instance;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(api::AppState::default())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    if event.state == ShortcutState::Pressed {
                        // Identifica qual atalho foi pressionado via string
                        let s = format!("{:?}", shortcut);
                        if s.contains("KeyP") {
                            app.emit("global-play-pause", ()).ok();
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Single instance — se já está rodando, foca a janela existente.
            // init() recebe um closure FnMut(&AppHandle, Vec<String> args, String cwd).
            let _ = app.handle().plugin(init_single_instance(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    window.show().ok();
                    window.set_focus().ok();
                }
            }));

            // Inicializa banco SQLite local
            let app_dir = app.handle().path().app_data_dir().unwrap_or_else(|_| {
                dirs::data_dir().unwrap_or_default().join("Meggy")
            });
            std::fs::create_dir_all(&app_dir).ok();
            let db_path = app_dir.join("meggy.db");
            db::init_db(&db_path).expect("Failed to init database");

            // Registra atalhos globais
            register_global_shortcuts(app.handle());

            // System tray
            setup_tray(app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            api::login,
            api::get_drives,
            api::list_folder,
            api::get_course_lessons,
            api::get_courses_list,
            api::ai_chat,
            api::ai_coach,
            api::ai_status,
            api::get_d1_status,
            api::scan_course,
            api::save_user_state,
            api::get_user_state,
            // v1.4.4 — inline player support
            api::ai_cache_get,
            api::ai_cache_save,
            api::ai_generate,
            api::fetch_text,
            api::extract_pdf_text,
            auth::check_session,
            auth::logout,
            db::search_lessons,
            db::get_cached_summary,
            db::save_summary,
            db::get_cached_flashcards,
            db::save_flashcards,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Meggy Desktop");
}

fn register_global_shortcuts(app: &tauri::AppHandle) {
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

    // Play/Pause global: Ctrl+Shift+P
    let play_pause = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyP);
    app.global_shortcut().register(play_pause).ok();
}

fn setup_tray(app: &tauri::AppHandle) {
    use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState};
    use tauri::menu::{Menu, MenuItem};

    let show = MenuItem::with_id(app, "show", "Mostrar Meggy", true, None::<&str>).unwrap();
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>).unwrap();
    let menu = Menu::with_items(app, &[&show, &quit]).unwrap();

    TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Meggy")
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        window.show().ok();
                        window.set_focus().ok();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        window.hide().ok();
                    } else {
                        window.show().ok();
                        window.set_focus().ok();
                    }
                }
            }
        })
        .build(app)
        .ok();
}
