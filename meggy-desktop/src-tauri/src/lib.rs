use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WindowEvent, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, ShortcutState};
use std::path::PathBuf;

// ============================================================
// v1.3.0 — Auto-Update + Keyboard Shortcuts + Downloads + About
// ============================================================
//
// NEW in v1.3.0:
//   • check_for_updates() — fetches GitHub releases API, compares
//     versions, opens browser to download page if newer exists.
//   • download_video() — downloads a video file to ~/Meggy/Downloads/{course}/.
//   • show_about_dialog() — native alert() with app info.
//   • Keyboard shortcuts injected via on_page_load into every webview
//     (Space, ←/→, ↑/↓, F, M, 0-9) — works on educa.eu.org Plyr player.
//   • JS bridge `window.meggyDesktop.*` injected into every webview.
//   • Silent auto-update check on startup → desktop notification if available.
//
// KEPT from v1.2.0:
//   • Single Instance Lock (FIRST plugin in chain).
//   • Native Menu Bar (Arquivo / Editar / Ajuda).
//   • Tray menu (Mostrar / Ocultar / Nova Janela / Downloads / Sair).
//   • Global shortcuts (Ctrl+Shift+N / M / D).
//
// KEPT from v1.1.3:
//   • on_window_event stays SIMPLE — just `window.hide()` + `api.prevent_close()`.
//     NO `app_handle()` call (caused crash on startup in v1.1.2).
//   • pause_all_media() only called from tray menu, Ctrl+Shift+M, and
//     hide_main_window() — NOT from close event.

const APP_VERSION: &str = "1.3.1";
const GITHUB_RELEASES_URL: &str =
    "https://api.github.com/repos/esaaraujo-lab/gdi_server/releases/latest";

/// JavaScript injected into every webview on page load (Started event).
/// Registers keyboard shortcuts for the video player AND exposes the
/// `window.meggyDesktop.*` JS bridge. Guarded with `window.__meggyKB`
/// so re-injection on subsequent navigations is a no-op.
const WEBVIEW_INIT_JS: &str = r#"(function() {
    // ─── JS bridge (always (re)bind, cheap) ───
    if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke && !window.meggyDesktop) {
        window.meggyDesktop = {
            version: '1.3.1',
            isDesktop: true,
            downloadVideo: async function(url, filename, course) {
                return await window.__TAURI__.core.invoke('download_video', { url: url, filename: filename, course: course });
            },
            checkUpdates: async function() {
                return await window.__TAURI__.core.invoke('check_for_updates');
            },
            openUpdateUrl: async function() {
                return await window.__TAURI__.core.invoke('open_update_url');
            },
            showAbout: async function() {
                return await window.__TAURI__.core.invoke('show_about_dialog');
            },
            openDownloads: async function() {
                return await window.__TAURI__.core.invoke('open_downloads_folder');
            },
            openNewWindow: async function() {
                return await window.__TAURI__.core.invoke('open_new_window');
            },
            toggleWindow: async function() {
                return await window.__TAURI__.core.invoke('toggle_main_window');
            }
        };
    }

    // ─── Keyboard shortcuts (register once per document) ───
    if (window.__meggyKB) return;
    window.__meggyKB = true;

    document.addEventListener('keydown', function(e) {
        // Skip if user is typing in an input/textarea/contenteditable
        const t = e.target;
        if (!t) return;
        const tag = t.tagName || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;

        // Find a player (Plyr or raw <video>)
        let player = null;
        try {
            if (window.player) player = window.player;
            else if (window.Plyr) {
                const el = document.querySelector('.plyr');
                if (el && el.plyr) player = el.plyr;
            }
            if (!player) {
                const v = document.querySelector('video');
                if (v) {
                    player = v.plyr || v;
                }
            }
        } catch (_) {}
        if (!player) return;

        let handled = false;
        try {
            switch (e.key) {
                case ' ':
                    if (typeof player.togglePlay === 'function') player.togglePlay();
                    else if (player.playing) player.pause();
                    else if (typeof player.play === 'function') player.play();
                    handled = true;
                    break;
                case 'ArrowLeft':
                    if (typeof player.rewind === 'function') player.rewind(10);
                    else player.currentTime = Math.max(0, (player.currentTime || 0) - 10);
                    handled = true;
                    break;
                case 'ArrowRight':
                    if (typeof player.forward === 'function') player.forward(10);
                    else player.currentTime = (player.currentTime || 0) + 10;
                    handled = true;
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    player.volume = Math.min(1, (player.volume == null ? 1 : player.volume) + 0.1);
                    handled = true;
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    player.volume = Math.max(0, (player.volume == null ? 1 : player.volume) - 0.1);
                    handled = true;
                    break;
                case 'f': case 'F':
                    if (player.fullscreen && typeof player.fullscreen.toggle === 'function') {
                        player.fullscreen.toggle();
                    }
                    handled = true;
                    break;
                case 'm': case 'M':
                    player.muted = !player.muted;
                    handled = true;
                    break;
                case '0': case '1': case '2': case '3': case '4':
                case '5': case '6': case '7': case '8': case '9':
                    if (typeof player.duration === 'number' && player.duration > 0) {
                        player.currentTime = player.duration * (parseInt(e.key, 10) / 10);
                        handled = true;
                    }
                    break;
            }
        } catch (_) {}
        if (handled) e.preventDefault();
    });
})();
"#;

fn downloads_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join("Meggy").join("Downloads"))
}

/// v1.1.3: Pause all video/audio playback in the main webview.
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

// ============================================================
// v1.3.0 — Auto-Update
// ============================================================

/// Parse a version tag like "desktop-v1.3.0" or "v1.3.0" or "1.3.0"
/// into a comparable (major, minor, patch) tuple. Returns None on failure.
fn parse_version(s: &str) -> Option<(u32, u32, u32)> {
    let s = s.trim();
    let s = s.trim_start_matches("desktop-");
    let s = s.trim_start_matches('v');
    let s = s.trim_start_matches('V');
    let parts: Vec<&str> = s.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    Some((
        parts[0].parse().ok()?,
        parts[1].parse().ok()?,
        parts[2].parse().ok()?,
    ))
}

#[derive(serde::Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
}

#[derive(serde::Serialize, Clone)]
struct UpdateInfo {
    current_version: String,
    latest_version: String,
    has_update: bool,
    download_url: String,
}

/// v1.3.0: Fetch GitHub's latest release. Compares the tag's version with
/// the current app version. Returns info that the web app (or Rust menu
/// handler) can use to prompt the user.
#[tauri::command]
async fn check_for_updates() -> Result<UpdateInfo, String> {
    let client = reqwest::Client::builder()
        .user_agent(format!("Meggy-Desktop/{}", APP_VERSION))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(GITHUB_RELEASES_URL)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let release: GithubRelease = resp.json().await.map_err(|e| e.to_string())?;
    let current = parse_version(APP_VERSION).unwrap_or((0, 0, 0));
    let latest = parse_version(&release.tag_name).unwrap_or((0, 0, 0));
    let has_update = latest > current;
    let latest_clean = release
        .tag_name
        .trim_start_matches("desktop-")
        .trim_start_matches('v')
        .to_string();
    Ok(UpdateInfo {
        current_version: APP_VERSION.to_string(),
        latest_version: latest_clean,
        has_update,
        download_url: release.html_url,
    })
}

/// v1.3.0: Open the GitHub releases page in the user's default browser.
#[tauri::command]
fn open_update_url() -> Result<(), String> {
    open::that("https://github.com/esaaraujo-lab/gdi_server/releases/latest")
        .map_err(|e| e.to_string())
}

/// v1.3.0: Show an "About Meggy" dialog via the webview's alert().
fn show_about_dialog_internal(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let js = format!(
            r#"alert('🐩 Meggy Desktop v{}\nPlataforma de Estudos\n\nTecnologias: Tauri 2.0 + Rust\nSite: educa.eu.org\n\n© 2026 Meggy');"#,
            APP_VERSION
        );
        let _ = window.eval(&js);
    }
}

#[tauri::command]
fn show_about_dialog(app: AppHandle) -> Result<(), String> {
    show_about_dialog_internal(&app);
    Ok(())
}

/// v1.3.0: Show a dialog with the result of an update check.
/// If an update is available, ask "open browser?" — if yes, open the
/// releases page in the default browser.
fn show_update_result_dialog(app: &AppHandle, info: UpdateInfo) {
    if let Some(window) = app.get_webview_window("main") {
        if info.has_update {
            // Ask the user, then open the browser via the open_update_url command.
            let js = format!(
                r#"if(confirm('🆕 Nova versão {} disponível!\n\nVersão atual: v{}\n\nDeseja abrir a página de download no navegador?')){{try{{window.__TAURI__.core.invoke('open_update_url');}}catch(e){{window.open('{}','_blank');}}}}"#,
                info.latest_version, info.current_version, info.download_url
            );
            let _ = window.eval(&js);
        } else {
            let js = format!(
                r#"alert('✅ Meggy está atualizado!\n\nVersão atual: v{}');"#,
                info.current_version
            );
            let _ = window.eval(&js);
        }
    }
}

/// v1.3.0: Background task — silently check for updates on startup.
/// If a newer version exists, emit a `update-available` event (web app
/// can listen) AND show a desktop notification.
fn spawn_startup_update_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        match check_for_updates().await {
            Ok(info) => {
                if info.has_update {
                    // Emit to webview (web app may show a banner)
                    let _ = app.emit("update-available", info.clone());
                    // Show a desktop notification
                    use tauri_plugin_notification::NotificationExt;
                    let _ = app
                        .notification()
                        .builder()
                        .title("Meggy — Atualização disponível")
                        .body(format!(
                            "Versão {} disponível. Clique em Ajuda → Verificar Atualizações.",
                            info.latest_version
                        ))
                        .show();
                }
            }
            Err(_) => {
                // Silent fail — no internet, GitHub down, etc.
            }
        }
    });
}

// ============================================================
// v1.3.0 — Downloads Offline
// ============================================================

/// v1.3.0: Download a video file to ~/Meggy/Downloads/{course}/{filename}.
/// Creates the course subfolder if it doesn't exist. Returns the absolute
/// path of the saved file.
#[tauri::command]
async fn download_video(url: String, filename: String, course: String) -> Result<String, String> {
    let base = downloads_dir().ok_or("Could not find home directory")?;
    // Sanitize the course name (replace path separators / illegal chars)
    let safe_course: String = course
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();
    let course_dir = if safe_course.trim().is_empty() {
        base.clone()
    } else {
        base.join(&safe_course)
    };
    std::fs::create_dir_all(&course_dir).map_err(|e| e.to_string())?;

    // Sanitize filename too (no path separators)
    let safe_filename: String = filename
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();
    let filepath = course_dir.join(&safe_filename);

    let client = reqwest::Client::builder()
        .user_agent(format!("Meggy-Desktop/{}", APP_VERSION))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(&filepath, &bytes).map_err(|e| e.to_string())?;

    Ok(filepath.to_string_lossy().to_string())
}

// ============================================================
// v1.3.0 — Entry point
// ============================================================
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ★ v1.2.0: Single Instance Lock — MUST be first.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
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
        // ★ v1.3.0: Inject keyboard shortcuts + JS bridge into EVERY webview
        // on every navigation (incl. cross-origin to educa.eu.org).
        // We don't filter by PageLoadEvent::Started vs Finished because the
        // injected script is idempotent (guarded by window.__meggyKB /
        // !window.meggyDesktop). Running on both events is harmless.
        .on_page_load(|webview, _payload| {
            let _ = webview.eval(WEBVIEW_INIT_JS);
        })
        // ★ v1.2.0: Native Menu Bar event handler (Arquivo / Editar / Ajuda)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "m_new_window" => {
                let _ = open_new_window_internal(app);
            }
            "m_close" => {
                hide_main_window(app);
            }
            "m_quit" => {
                app.exit(0);
            }
            "m_about" => {
                // ★ v1.3.0: Show native about dialog directly
                show_about_dialog_internal(app);
            }
            "m_check_update" => {
                // ★ v1.3.0: Spawn async check, then show result dialog
                let app2 = app.clone();
                tauri::async_runtime::spawn(async move {
                    match check_for_updates().await {
                        Ok(info) => show_update_result_dialog(&app2, info),
                        Err(e) => {
                            if let Some(window) = app2.get_webview_window("main") {
                                let safe = e
                                    .replace('\\', "\\\\")
                                    .replace('\'', "\\'")
                                    .replace('\n', "\\n")
                                    .replace('\r', "");
                                let js = format!(
                                    r#"alert('❌ Erro ao verificar atualizações:\n\n{}');"#,
                                    safe
                                );
                                let _ = window.eval(&js);
                            }
                        }
                    }
                });
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            open_downloads_folder,
            open_new_window,
            toggle_main_window,
            check_for_updates,
            open_update_url,
            show_about_dialog,
            download_video,
        ])
        .setup(|app| {
            // ─── Native Menu Bar (v1.2.0) ───
            let new_window = MenuItem::with_id(
                app,
                "m_new_window",
                "Nova Janela",
                true,
                Some("Ctrl+Shift+N"),
            )?;
            let close = MenuItem::with_id(app, "m_close", "Fechar", true, Some("Ctrl+W"))?;
            let quit = MenuItem::with_id(app, "m_quit", "Sair", true, Some("Ctrl+Q"))?;
            let file_menu =
                Submenu::with_items(app, "Arquivo", true, &[&new_window, &close, &quit])?;

            let cut = PredefinedMenuItem::cut(app, None)?;
            let copy = PredefinedMenuItem::copy(app, None)?;
            let paste = PredefinedMenuItem::paste(app, None)?;
            let select_all = PredefinedMenuItem::select_all(app, None)?;
            let edit_menu = Submenu::with_items(
                app,
                "Editar",
                true,
                &[&cut, &copy, &paste, &select_all],
            )?;

            let about =
                MenuItem::with_id(app, "m_about", "Sobre Meggy", true, None::<&str>)?;
            let check_update = MenuItem::with_id(
                app,
                "m_check_update",
                "Verificar Atualizações",
                true,
                None::<&str>,
            )?;
            let help_menu = Submenu::with_items(app, "Ajuda", true, &[&about, &check_update])?;

            let menu = Menu::with_items(app, &[&file_menu, &edit_menu, &help_menu])?;
            app.set_menu(menu)?;

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
            let tray_menu = Menu::with_items(app, &[
                &show_item,
                &hide_item,
                &sep1,
                &new_window_item,
                &downloads_item,
                &sep2,
                &quit_item,
            ])?;

            TrayIconBuilder::new()
                .menu(&tray_menu)
                .show_menu_on_left_click(true)
                .tooltip("Meggy — Plataforma de Estudos")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        show_main_window(app);
                    }
                    "hide" => {
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

            // ─── v1.3.0: Silent auto-update check on startup ───
            // Fires 3s after launch (gives time for the webview to load)
            // and never blocks startup. Silent failure if offline.
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(3));
                spawn_startup_update_check(app_handle);
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // ★ v1.1.3: Simplified — just hide, NO app_handle() call.
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
