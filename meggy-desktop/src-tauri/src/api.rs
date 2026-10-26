// ═══════════════════════════════════════════════════════════════
// Meggy Desktop — API Client (Rust → worker.js)
// ═══════════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

const BASE_URL: &str = "https://educa.eu.org";

pub struct AppState {
    pub client: reqwest::Client,
    pub cookie: Mutex<Option<String>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .unwrap(),
            cookie: Mutex::new(None),
        }
    }
}

// ─── Tauri Commands ───

#[derive(Serialize)]
pub struct LoginResult {
    pub ok: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn login(
    state: State<'_, AppState>,
    username: String,
    password: String,
) -> Result<LoginResult, String> {
    let resp = state
        .client
        .post(format!("{}/login", BASE_URL))
        .form(&[("username", &username), ("password", &password)])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status().as_u16();

    if status == 200 || status == 302 {
        let cookies = resp.headers().get_all("set-cookie");
        for cookie in cookies {
            if let Ok(val) = cookie.to_str() {
                if val.starts_with("session=") {
                    let session = val.split(';').next().unwrap_or("");
                    *state.cookie.lock().unwrap() = Some(session.to_string());
                    return Ok(LoginResult { ok: true, error: None });
                }
            }
        }
    }

    Ok(LoginResult {
        ok: false,
        error: Some("Usuário ou senha inválidos".to_string()),
    })
}

#[derive(Serialize)]
pub struct Drive {
    pub index: i32,
    pub name: String,
}

#[tauri::command]
pub async fn get_drives() -> Result<Vec<Drive>, String> {
    // Hardcoded drives (same as app.min.js)
    Ok(vec![
        Drive { index: 0, name: "RETA FINAL TRTs".into() },
        Drive { index: 1, name: "CURSOS - PLATAFORMAS COMPLETAS".into() },
        Drive { index: 2, name: "VESTIBULARES PLATAFORMAS".into() },
        Drive { index: 3, name: "VESTIBULARES ISOLADAS".into() },
        Drive { index: 4, name: "MUSICA E CANTO".into() },
        Drive { index: 5, name: "CARREIRAS EDUCACIONAIS".into() },
        Drive { index: 6, name: "CLUBE FIT".into() },
        Drive { index: 7, name: "HIPOPRESSIVOS".into() },
        Drive { index: 8, name: "SAÚDE E MEDICINA".into() },
        Drive { index: 9, name: "TUDO DE TRIBUNAIS".into() },
        Drive { index: 10, name: "ALFACON 2026".into() },
        Drive { index: 11, name: "PREPARATÓRIO OAB".into() },
    ])
}

#[derive(Serialize, Deserialize)]
pub struct FileItem {
    pub name: String,
    pub mime_type: String,
    pub id: String,
    pub link: Option<String>,
    pub size: i64,
}

#[tauri::command]
pub async fn list_folder(
    state: State<'_, AppState>,
    drive_index: i32,
    path: Option<String>,
) -> Result<Vec<FileItem>, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    let cookie = cookie.ok_or("Not logged in")?;

    // Build URL: if a path is provided (e.g. "/0:/CURSO X/"), POST to it;
    // otherwise POST to the drive root "/{drive_index}://".
    // The worker.js apiRequest handler uses the URL path (not the body id)
    // to determine which folder to list.
    let url = match &path {
        Some(p) if !p.is_empty() => {
            // Ensure leading "/" and trailing "/"
            let p = if p.starts_with('/') { p.clone() } else { format!("/{}", p) };
            let p = if p.ends_with('/') { p } else { format!("{}/", p) };
            format!("{}{}", BASE_URL, p)
        }
        _ => format!("{}/{}:/", BASE_URL, drive_index),
    };

    let body = serde_json::json!({
        "page_token": null,
        "page_index": 0
    });

    let resp = state
        .client
        .post(&url)
        .header("Cookie", &cookie)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let files = json["data"]["files"]
        .as_array()
        .ok_or("Invalid response")?;

    let items: Vec<FileItem> = files
        .iter()
        .map(|f| FileItem {
            name: f["name"].as_str().unwrap_or("").to_string(),
            mime_type: f["mimeType"].as_str().unwrap_or("").to_string(),
            id: f["id"].as_str().unwrap_or("").to_string(),
            link: f["link"].as_str().map(|s| s.to_string()),
            size: f["size"].as_i64().unwrap_or(0),
        })
        .collect();

    Ok(items)
}

#[tauri::command]
pub async fn get_course_lessons(
    state: State<'_, AppState>,
    course_path: String,
) -> Result<serde_json::Value, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    let cookie = cookie.ok_or("Not logged in")?;

    let resp = state
        .client
        .post(format!("{}/api/courses/scan-progress", BASE_URL))
        .header("Cookie", &cookie)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "coursePath": course_path }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_courses_list(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    let cookie = cookie.ok_or("Not logged in")?;

    let resp = state
        .client
        .get(format!("{}/api/courses/list", BASE_URL))
        .header("Cookie", &cookie)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_chat(
    state: State<'_, AppState>,
    message: String,
) -> Result<String, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    let cookie = cookie.ok_or("Not logged in")?;

    let resp = state
        .client
        .post(format!("{}/api/ai", BASE_URL))
        .header("Cookie", &cookie)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "message": message, "messages": [] }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json["response"].as_str().unwrap_or("Sem resposta").to_string())
}

#[tauri::command]
pub async fn ai_coach(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    let cookie = cookie.ok_or("Not logged in")?;

    let resp = state
        .client
        .post(format!("{}/api/ai/coach", BASE_URL))
        .header("Cookie", &cookie)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "action": "analyze" }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    let cookie = cookie.unwrap_or_default();

    let resp = state
        .client
        .get(format!("{}/api/ai/status", BASE_URL))
        .header("Cookie", &cookie)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_d1_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    let cookie = cookie.ok_or("Not logged in")?;

    let resp = state
        .client
        .get(format!("{}/api/d1/status", BASE_URL))
        .header("Cookie", &cookie)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn scan_course(
    state: State<'_, AppState>,
    course_path: String,
) -> Result<serde_json::Value, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    let cookie = cookie.ok_or("Not logged in")?;

    let resp = state
        .client
        .post(format!("{}/api/courses/scan-and-save", BASE_URL))
        .header("Cookie", &cookie)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "coursePath": course_path }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_user_state(
    state: State<'_, AppState>,
    data: serde_json::Value,
) -> Result<bool, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    let cookie = cookie.ok_or("Not logged in")?;

    let resp = state
        .client
        .post(format!("{}/userstate/save", BASE_URL))
        .header("Cookie", &cookie)
        .header("Content-Type", "application/json")
        .json(&data)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(resp.status().is_success())
}

#[tauri::command]
pub async fn get_user_state(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    let cookie = cookie.ok_or("Not logged in")?;

    let resp = state
        .client
        .get(format!("{}/userstate/get", BASE_URL))
        .header("Cookie", &cookie)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    resp.json().await.map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────
// v1.4.4 — Inline player support (AI cache, AI generate, fetch text)
// ─────────────────────────────────────────────────────────────────

/// GET /api/ai/cache?key=<key>
/// Returns the cached ISA payload (or { cached: null } on miss).
#[tauri::command]
pub async fn ai_cache_get(
    state: State<'_, AppState>,
    key: String,
) -> Result<serde_json::Value, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    let cookie = cookie.unwrap_or_default();

    let resp = state
        .client
        .get(format!("{}/api/ai/cache", BASE_URL))
        .header("Cookie", &cookie)
        .header("Accept", "application/json")
        .query(&[("key", key.as_str())])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    // 404 / 401 etc. → return empty cached object (cache miss)
    if !resp.status().is_success() {
        return Ok(serde_json::json!({ "cached": null }));
    }
    resp.json().await.map_err(|e| e.to_string())
}

/// POST /api/ai/cache — fire-and-forget save (summary / questions / mindmap).
#[tauri::command]
pub async fn ai_cache_save(
    state: State<'_, AppState>,
    key: String,
    summary: Option<String>,
    questions: Option<serde_json::Value>,
    mindmap: Option<String>,
    lesson_name: Option<String>,
) -> Result<bool, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    let cookie = cookie.ok_or("Not logged in")?;

    let body = serde_json::json!({
        "key": key,
        "summary": summary,
        "questions": questions,
        "mindmap": mindmap,
        "lessonName": lesson_name.unwrap_or_default()
    });

    let resp = state
        .client
        .post(format!("{}/api/ai/cache", BASE_URL))
        .header("Cookie", &cookie)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(resp.status().is_success())
}

/// POST /api/ai — generate ISA content (summary / questions / mindmap).
/// `kind` is forwarded so the worker can route to the right provider.
#[tauri::command]
pub async fn ai_generate(
    state: State<'_, AppState>,
    message: String,
    kind: Option<String>,
) -> Result<String, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    let cookie = cookie.ok_or("Not logged in")?;

    let body = serde_json::json!({
        "message": message,
        "messages": [],
        "kind": kind
    });

    let resp = state
        .client
        .post(format!("{}/api/ai", BASE_URL))
        .header("Cookie", &cookie)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json["response"]
        .as_str()
        .or_else(|| json["markdown"].as_str())
        .or_else(|| json["summary"].as_str())
        .unwrap_or("Sem resposta")
        .to_string())
}

/// Fetch arbitrary text content from a URL (for MD/TXT/HTML material files).
/// The download links produced by worker.js are self-contained (encrypted id +
/// expiry + MAC) and don't require the session cookie, but we still send it to
/// be safe.  We follow redirects here since the file host may 302.
#[tauri::command]
pub async fn fetch_text(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
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
    resp.text().await.map_err(|e| e.to_string())
}

/// ★ v1.4.5: Extract text from a PDF URL using pdf-extract crate.
/// Downloads the PDF to a temp file, extracts text (cap 50K chars), returns it.
/// Used by ISA generation when no transcription exists — falls back to PDF material.
#[tauri::command]
pub async fn extract_pdf_text(url: String) -> Result<String, String> {
    // Download PDF to temp file
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
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

    // Write to temp file
    let mut tmp = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
    std::fs::write(tmp.path(), &bytes).map_err(|e| e.to_string())?;

    // Extract text using pdf-extract (runs in blocking thread)
    let path = tmp.path().to_path_buf();
    let text = tokio::task::spawn_blocking(move || {
        pdf_extract::extract_text(&path)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    // Cap at 50K chars
    let truncated = if text.len() > 50000 {
        text[..50000].to_string()
    } else {
        text
    };

    Ok(truncated)
}
