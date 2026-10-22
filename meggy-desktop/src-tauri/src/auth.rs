// ═══════════════════════════════════════════════════════════════
// Meggy Desktop — Auth (cookie + session)
// ═══════════════════════════════════════════════════════════════

use serde::Serialize;
use tauri::State;
use crate::api::AppState;

#[derive(Serialize)]
pub struct SessionInfo {
    pub logged_in: bool,
    pub username: Option<String>,
}

#[tauri::command]
pub async fn check_session(state: State<'_, AppState>) -> Result<SessionInfo, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    Ok(SessionInfo {
        logged_in: cookie.is_some(),
        username: None, // TODO: extract from cookie
    })
}

#[tauri::command]
pub async fn logout(state: State<'_, AppState>) -> Result<bool, String> {
    *state.cookie.lock().unwrap() = None;
    Ok(true)
}
