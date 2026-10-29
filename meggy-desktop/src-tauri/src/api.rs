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
                .timeout(std::time::Duration::from_secs(120))
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
    // ★ v1.5.8: URL-encode each path segment to fix HTTP 400 with spaces/special chars
    let url = match &path {
        Some(p) if !p.is_empty() => {
            let p = if p.starts_with('/') { p.clone() } else { format!("/{}", p) };
            let p = if p.ends_with('/') { p } else { format!("{}/", p) };
            // Split by / and percent-encode each segment (keep drive index like "0:" as-is)
            let segments: Vec<&str> = p.split('/').filter(|s| !s.is_empty()).collect();
            let encoded: Vec<String> = segments.iter().map(|s| {
                // Don't encode drive index (e.g. "0:") — worker expects it raw
                if s.chars().filter(|c| *c == ':').count() == 1 && s.ends_with(':') {
                    s.to_string()
                } else {
                    // Check if already percent-encoded (has %xx patterns)
                    if s.contains('%') && s.contains("20") {
                        s.to_string() // Already encoded, keep as-is
                    } else {
                        // Percent-encode: spaces → %20, etc.
                        let mut result = String::new();
                        for byte in s.bytes() {
                            match byte {
                                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b':' => {
                                    result.push(byte as char);
                                }
                                _ => {
                                    result.push_str(&format!("%{:02X}", byte));
                                }
                            }
                        }
                        result
                    }
                }
            }).collect();
            format!("{}/{}/", BASE_URL, encoded.join("/"))
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

    let body = serde_json::to_string(&data).unwrap_or_default();

    // ★ v1.9.8: Use a SEPARATE client that FOLLOWS REDIRECTS for /userstate/save
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(format!("{}/userstate/save", BASE_URL))
        .header("Cookie", &cookie)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    eprintln!("[save_user_state] HTTP {}", status);
    Ok(status.is_success())
}

#[tauri::command]
pub async fn get_user_state(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    let cookie = cookie.ok_or("Not logged in")?;

    // ★ v1.9.8: Use a SEPARATE client that FOLLOWS REDIRECTS for /userstate
    // The main AppState client has Policy::none() which breaks /userstate (returns 302)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(format!("{}/userstate", BASE_URL))
        .header("Cookie", &cookie)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;

    eprintln!("[get_user_state] HTTP {} | body len: {}", status, text.len());

    if !status.is_success() {
        return Ok(serde_json::json!({})); // Return empty object instead of error
    }

    if text.is_empty() {
        return Ok(serde_json::json!({}));
    }

    Ok(serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({})))
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
/// ★ v1.4.8: Don't send kind=questoes (routes to heavy models that timeout).
/// Use kind=resumo for all — the prompt itself tells the AI what to generate.
/// ★ v1.4.8: Retry up to 3 times (backends can be intermittent).
#[tauri::command]
pub async fn ai_generate(
    state: State<'_, AppState>,
    message: String,
    kind: Option<String>,
) -> Result<String, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    let cookie = cookie.ok_or("Not logged in")?;

    let effective_kind = if kind.as_deref() == Some("questoes") {
        Some("resumo".to_string())
    } else {
        kind
    };

    let body = serde_json::json!({
        "message": message,
        "messages": [],
        "kind": effective_kind
    });

    let mut last_err = String::new();
    for attempt in 1..=3u32 {
        let resp = state
            .client
            .post(format!("{}/api/ai", BASE_URL))
            .header("Cookie", &cookie)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await;

        match resp {
            Ok(r) => {
                if !r.status().is_success() {
                    last_err = format!("HTTP {}", r.status());
                    if attempt < 3 {
                        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                        continue;
                    }
                    return Err(last_err);
                }
                let json: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
                let response = json["response"]
                    .as_str()
                    .or_else(|| json["markdown"].as_str())
                    .or_else(|| json["summary"].as_str())
                    .unwrap_or("")
                    .to_string();
                if !response.is_empty() {
                    return Ok(response);
                }
                last_err = "Resposta vazia da IA".to_string();
            }
            Err(e) => {
                last_err = e.to_string();
            }
        }
        if attempt < 3 {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
    }
    Err(last_err)
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

/// ★ v1.4.7: Extract text from a PDF URL using pdf-extract crate.
/// Downloads the PDF to a temp file, extracts text (cap 50K chars), returns it.
/// Used by ISA generation when no transcription exists — falls back to PDF material.
/// v1.4.7 fixes: (1) follows redirects, (2) catches panics with catch_unwind,
/// (3) validates content-type is PDF before extracting.
#[tauri::command]
pub async fn extract_pdf_text(url: String, state: State<'_, AppState>) -> Result<String, String> {
    // Download PDF — follow redirects (download.aspx may 302 to Google Drive)
    // Also send session cookie in case the worker requires auth
    let cookie = state.cookie.lock().unwrap().clone();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client.get(&url);
    if let Some(c) = &cookie {
        req = req.header("Cookie", c);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    // Validate content-type is actually PDF (not HTML login redirect)
    let ct = resp.headers().get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !ct.contains("pdf") && !ct.contains("octet-stream") {
        // Got HTML or something else — probably auth redirect
        return Err("Não é um PDF (possível redirect de login)".to_string());
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

    // Validate it starts with %PDF magic bytes
    if bytes.len() < 5 || &bytes[..5] != b"%PDF-" {
        return Err("Arquivo não é um PDF válido".to_string());
    }

    // Write to temp file
    let mut tmp = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
    std::fs::write(tmp.path(), &bytes).map_err(|e| e.to_string())?;

    // Extract text using pdf-extract — catch panics (some PDFs cause panics)
    let path = tmp.path().to_path_buf();
    let text_result = tokio::task::spawn_blocking(move || {
        std::panic::catch_unwind(|| {
            pdf_extract::extract_text(&path)
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    match text_result {
        Ok(Ok(text)) => {
            let truncated = if text.len() > 50000 {
                text[..50000].to_string()
            } else {
                text
            };
            Ok(truncated)
        }
        Ok(Err(e)) => Err(format!("PDF extract error: {}", e)),
        Err(_) => Err("PDF extract panicked (possible scanned/image PDF)".to_string()),
    }
}

/// ★ v1.5.2: Download a file (PDF) with session cookie + redirects, save to temp, return path.
/// Used by MaterialViewer iframe — the iframe can't send cookies, so we download in Rust
/// and return a local file path that the frontend converts to a viewable URL via convertFileSrc.
/// ★ v1.6.9: Cache by URL hash — if the same URL was downloaded before, reuse the file.
/// Also cleans up old meggy_pdf_*.pdf files (>24h old) to prevent temp dir bloat.
#[tauri::command]
pub async fn download_to_temp(url: String, state: State<'_, AppState>) -> Result<String, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;

    // ★ v1.6.9: Stable filename based on URL hash — same URL = same file (cache hit)
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    url.hash(&mut hasher);
    let url_hash = hasher.finish();
    let tmp_dir = std::env::temp_dir();
    let filename = format!("meggy_pdf_{}.pdf", url_hash);
    let filepath = tmp_dir.join(&filename);

    // ★ Cache hit: if file exists and is < 24h old, return it without re-downloading
    if let Ok(meta) = std::fs::metadata(&filepath) {
        if let Ok(modified) = meta.modified() {
            if let Ok(elapsed) = modified.elapsed() {
                if elapsed.as_secs() < 86400 {
                    // File exists and is fresh — return cached path
                    return Ok(filepath.to_string_lossy().to_string());
                }
            }
        }
    }

    let mut req = client.get(&url);
    if let Some(c) = &cookie {
        req = req.header("Cookie", c);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

    // Save to temp file (overwrite if exists — same hash = same content)
    std::fs::write(&filepath, &bytes).map_err(|e| e.to_string())?;

    // ★ v1.6.9: Cleanup old meggy_pdf_*.pdf files (>24h old) — fire and forget
    if let Ok(entries) = std::fs::read_dir(&tmp_dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if name.starts_with("meggy_pdf_") && name.ends_with(".pdf") && name != &filename {
                    if let Ok(meta) = entry.metadata() {
                        if let Ok(modified) = meta.modified() {
                            if let Ok(elapsed) = modified.elapsed() {
                                if elapsed.as_secs() > 86400 {
                                    let _ = std::fs::remove_file(entry.path());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(filepath.to_string_lossy().to_string())
}
