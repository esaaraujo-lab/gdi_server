// ═══════════════════════════════════════════════════════════════
// Meggy Desktop — API Client (Rust → worker.js)
// ═══════════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

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

    // ★ v1.9.10 (auditoria de rotas): o worker devolve 429 JSON quando o
    // login bate no rate-limit (10 falhas/15min por user+IP) — não é
    // "senha inválida"; diz para aguardar.
    if status == 429 {
        return Ok(LoginResult {
            ok: false,
            error: Some("Muitas tentativas falhadas. Aguarde alguns minutos e tente novamente.".to_string()),
        });
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

    // ★ v1.9.10 (auditoria de rotas): o gate .93 devolve 401 JSON em POST
    // com sessão expirada — o frontend volta p/ o login (isAuthError).
    if resp.status().as_u16() == 401 {
        return Err("AUTH:401".to_string());
    }
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
    // ★ v1.9.10: 401 = sessão expirada — o chamador volta p/ o login
    // (antes, qualquer falha devolvia false e o app seguia cego).
    if status.as_u16() == 401 {
        return Err("AUTH:401".to_string());
    }
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

    // ★ v1.9.10: 401 = sessão expirada (nunca devolver {} como se o aluno
    // nunca tivesse visto nada); outro erro também rejeita — o frontend
    // mantém o estado anterior em vez de apagar a seção.
    if status.as_u16() == 401 {
        return Err("AUTH:401".to_string());
    }
    if !status.is_success() {
        return Err(format!("HTTP:{}", status.as_u16()));
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
                if r.status().as_u16() == 401 {
                    // ★ v1.9.10: sessão expirada — não adianta retentar 3x
                    return Err("AUTH:401".to_string());
                }
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

// ─────────────────────────────────────────────────────────────────
// v1.9.12 — Simulados: GET autenticado p/ as rotas do banco
// ─────────────────────────────────────────────────────────────────

/// GET autenticado p/ as rotas do banco de questões do worker
/// (/api/ai/question-bank/lists, /api/ai/question-topics,
/// /api/ai/shared-flashcards). O fetch_text NÃO manda o cookie de
/// sessão, por isso estas rotas devolviam sempre 401 — este comando
/// segue o molde do get_user_state (cookie + redirects + AUTH:401).
/// Só aceita os 3 prefixos do banco — nunca um URL arbitrário com o
/// cookie da sessão.
#[tauri::command]
pub async fn bank_get(state: State<'_, AppState>, path: String) -> Result<serde_json::Value, String> {
    const ALLOWED: [&str; 3] = [
        "/api/ai/question-bank/",
        "/api/ai/question-topics",
        "/api/ai/shared-flashcards",
    ];
    if !ALLOWED.iter().any(|p| path.starts_with(p)) {
        return Err("bank_get: caminho não permitido".to_string());
    }
    let cookie = state.cookie.lock().unwrap().clone();
    let cookie = cookie.ok_or("Not logged in")?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(format!("{}{}", BASE_URL, path))
        .header("Cookie", &cookie)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    eprintln!("[bank_get] {} HTTP {}", path, status);
    // ★ v1.9.10: 401 = sessão expirada — o chamador volta p/ o login.
    if status.as_u16() == 401 {
        return Err("AUTH:401".to_string());
    }
    if !status.is_success() {
        return Err(format!("HTTP:{}", status.as_u16()));
    }
    let text = resp.text().await.map_err(|e| e.to_string())?;
    Ok(serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({})))
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

// ─────────────────────────────────────────────────────────────────
// ★ v1.9.11 — Download offline de aulas (desenho PROGRESSO_AULAS §3.1)
// ─────────────────────────────────────────────────────────────────

/// ★ v1.9.11: downloads em curso — um flag de cancelamento por lesson_path.
pub struct DownloadManager {
    pub active: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl Default for DownloadManager {
    fn default() -> Self {
        Self {
            active: Mutex::new(HashMap::new()),
        }
    }
}

/// ★ v1.9.11: tecto do download offline — 2 GB com evicção LRU (§3.3).
const DOWNLOAD_MAX_BYTES: u64 = 2 * 1024 * 1024 * 1024;
/// ★ v1.9.11: chave da regra "só no Wi-Fi" na tabela user_state ("1" = ligada).
const DOWNLOAD_WIFI_ONLY_KEY: &str = "download_wifi_only";

fn downloads_dir(app: &AppHandle) -> std::path::PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| dirs::data_dir().unwrap_or_default().join("Meggy"));
    dir.join("downloads")
}

fn lesson_download_dir(app: &AppHandle, lesson_path: &str) -> std::path::PathBuf {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    lesson_path.hash(&mut hasher);
    downloads_dir(app).join(format!("{:016x}", hasher.finish()))
}

/// ★ v1.9.11: "só no Wi-Fi" por defeito — bloqueia SÓ quando detecta
/// positivamente uma ligação de dados móveis; Wi-Fi e cabo (Ethernet)
/// passam sempre; quando não dá para determinar, permite (fail-open —
/// um bloqueio errado deixaria o desktop sem downloads).
fn wifi_only_ok() -> bool {
    // Windows: netsh wlan diz se há Wi-Fi ligado; sem placa Wi-Fi é
    // desktop com cabo (permitir). A saída pode ser pt-BR ou en — procurar
    // "conectado"/"connected" sem depender do idioma.
    #[cfg(target_os = "windows")]
    {
        let out = std::process::Command::new("netsh")
            .args(["wlan", "show", "interfaces"])
            .output();
        if let Ok(o) = out {
            let txt = String::from_utf8_lossy(&o.stdout).to_lowercase();
            if txt.contains("não há nenhuma interface")
                || txt.contains("there is no wireless interface")
            {
                return true; // sem placa Wi-Fi = cabo
            }
            if txt.contains("conectado") || txt.contains("connected") {
                return true; // Wi-Fi ligado
            }
            // Há placa Wi-Fi mas desligada — ver se há Ethernet ligada;
            // só bloqueia se a única ligação for de dados móveis.
            if let Ok(o2) = std::process::Command::new("netsh")
                .args(["interface", "show", "interface"])
                .output()
            {
                let t2 = String::from_utf8_lossy(&o2.stdout).to_lowercase();
                let mut cellular_only = false;
                for line in t2.lines() {
                    if !(line.contains("conectado") || line.contains("connected")) {
                        continue;
                    }
                    if line.contains("ethernet") || line.contains("wi-fi") || line.contains("wifi") {
                        return true;
                    }
                    if line.contains("celular") || line.contains("cellular") || line.contains("mobile") {
                        cellular_only = true;
                    }
                }
                if cellular_only {
                    return false;
                }
            }
        }
        return true; // indeterminado — permitir
    }
    // Linux: nmcli lista o tipo de cada ligação activa.
    #[cfg(target_os = "linux")]
    {
        if let Ok(o) = std::process::Command::new("nmcli")
            .args(["-t", "-f", "TYPE,STATE", "device", "status"])
            .output()
        {
            let txt = String::from_utf8_lossy(&o.stdout);
            let mut cellular_only = false;
            for line in txt.lines() {
                let (ty, st) = line.split_once(':').unwrap_or(("", ""));
                if st.trim() != "connected" {
                    continue;
                }
                match ty.trim() {
                    "wifi" | "ethernet" => return true,
                    "gsm" | "cdma" => cellular_only = true,
                    _ => {}
                }
            }
            if cellular_only {
                return false;
            }
        }
        return true; // sem nmcli / indeterminado — permitir
    }
    // macOS e outros: sem detecção fiável de dados móveis — permitir.
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        true
    }
}

/// ★ v1.9.11: evicção LRU — soma os downloads concluídos e apaga as
/// pastas mais antigas (por mtime) até `needed` caber dentro do tecto.
/// Nunca toca na pasta `keep_dir` (a aula que está a baixar agora).
fn enforce_download_cap(app: &AppHandle, keep_dir: &std::path::Path, needed: u64) {
    let base = downloads_dir(app);
    let mut entries: Vec<(u64, std::time::SystemTime, std::path::PathBuf)> = Vec::new();
    let mut total: u64 = 0;
    if let Ok(rd) = std::fs::read_dir(&base) {
        for e in rd.flatten() {
            let p = e.path();
            if !p.is_dir() || p == keep_dir {
                continue;
            }
            // Soma só os ficheiros finais (o .part não conta — é retomável).
            let mut dir_size = 0u64;
            let mut newest = std::time::SystemTime::UNIX_EPOCH;
            if let Ok(rd2) = std::fs::read_dir(&p) {
                for f in rd2.flatten() {
                    let fp = f.path();
                    if fp.extension().and_then(|x| x.to_str()) == Some("part") {
                        continue;
                    }
                    if let Ok(m) = f.metadata() {
                        dir_size += m.len();
                        if let Ok(mt) = m.modified() {
                            if mt > newest {
                                newest = mt;
                            }
                        }
                    }
                }
            }
            total += dir_size;
            entries.push((dir_size, newest, p));
        }
    }
    if total + needed <= DOWNLOAD_MAX_BYTES {
        return;
    }
    entries.sort_by_key(|(_, mt, _)| *mt); // mais antigos primeiro
    let mut freed = 0u64;
    for (size, _, dir) in entries {
        if total + needed - freed <= DOWNLOAD_MAX_BYTES {
            break;
        }
        if std::fs::remove_dir_all(&dir).is_ok() {
            freed += size;
            let _ = crate::db::download_cache_delete_dir(app, &dir);
            eprintln!("[download] LRU evicted {} ({} bytes)", dir.display(), size);
        }
    }
}

/// ★ v1.9.11: arranca o download de uma aula em 2.º plano e devolve logo
/// (`true`) — nada bloqueia a UI; o progresso vai por eventos
/// `download-progress` ({lesson_path, received, total, done, path}).
/// Destino: <app_data>/downloads/<hash-do-path>/<file_name>; retoma com
/// `Range` se existir ficheiro parcial; grava em `.part` e renomeia no fim.
#[tauri::command]
pub async fn download_lesson(
    app: AppHandle,
    state: State<'_, AppState>,
    downloads: State<'_, DownloadManager>,
    url: String,
    lesson_path: String,
    file_name: String,
) -> Result<bool, String> {
    // "Só no Wi-Fi" por defeito (valor "1" quando a chave não existe).
    let wifi_only = crate::db::db_setting(&app, DOWNLOAD_WIFI_ONLY_KEY)
        .unwrap_or_else(|| "1".to_string())
        == "1";
    if wifi_only && !wifi_only_ok() {
        return Err(
            "Download só no Wi-Fi — liga o Wi-Fi (ou o cabo) ou desactiva a regra nas definições."
                .to_string(),
        );
    }

    let dir = lesson_download_dir(&app, &lesson_path);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let final_path = dir.join(&file_name);
    let part_path = dir.join(format!("{}.part", file_name));

    // Já baixado? Devolve logo + evento done (o frontend marca ✓ sem rede).
    if let Ok(meta) = std::fs::metadata(&final_path) {
        if meta.len() > 0 {
            let _ = app.emit(
                "download-progress",
                serde_json::json!({
                    "lesson_path": lesson_path,
                    "received": meta.len(),
                    "total": meta.len(),
                    "done": true,
                    "path": final_path.to_string_lossy().to_string(),
                }),
            );
            return Ok(true);
        }
    }

    // Tecto 2 GB com evicção LRU antes de arrancar.
    enforce_download_cap(&app, &dir, 0);

    // Um download por aula — o 2.º toque devolve erro em vez de duplicar.
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut active = downloads.active.lock().unwrap();
        if active.contains_key(&lesson_path) {
            return Err("Download já em curso para esta aula".to_string());
        }
        active.insert(lesson_path.clone(), cancel.clone());
    }

    let _ = crate::db::download_cache_upsert(
        &app,
        &url,
        &final_path.to_string_lossy(),
        0,
        &lesson_path,
        0,
        "downloading",
    );

    let cookie = state.cookie.lock().unwrap().clone();
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = download_task(
            app2.clone(),
            url.clone(),
            lesson_path.clone(),
            dir.clone(),
            final_path.clone(),
            part_path.clone(),
            cookie,
            cancel,
        )
        .await;
        match result {
            Ok((received, total)) => {
                let _ = crate::db::download_cache_upsert(
                    &app2,
                    &url,
                    &final_path.to_string_lossy(),
                    received,
                    &lesson_path,
                    total,
                    "done",
                );
                let _ = app2.emit(
                    "download-progress",
                    serde_json::json!({
                        "lesson_path": lesson_path,
                        "received": received,
                        "total": total,
                        "done": true,
                        "path": final_path.to_string_lossy().to_string(),
                    }),
                );
            }
            Err(e) if e == "cancelled" => {
                let _ = crate::db::download_cache_upsert(
                    &app2,
                    &url,
                    &final_path.to_string_lossy(),
                    0,
                    &lesson_path,
                    0,
                    "cancelled",
                );
                let _ = app2.emit(
                    "download-progress",
                    serde_json::json!({
                        "lesson_path": lesson_path,
                        "received": 0,
                        "total": 0,
                        "done": false,
                        "path": null,
                        "cancelled": true,
                    }),
                );
            }
            Err(e) => {
                eprintln!("[download_lesson] {} ERRO: {}", lesson_path, e);
                let _ = crate::db::download_cache_upsert(
                    &app2,
                    &url,
                    &final_path.to_string_lossy(),
                    0,
                    &lesson_path,
                    0,
                    "error",
                );
            }
        }
        app2
            .state::<DownloadManager>()
            .active
            .lock()
            .unwrap()
            .remove(&lesson_path);
    });

    Ok(true)
}

/// Corpo do download: stream com Range/retoma, .part + rename no fim.
/// Devolve (received, total). "cancelled" é erro de controlo — o .part
/// fica no disco para a próxima chamada retomar de onde parou.
async fn download_task(
    app: AppHandle,
    url: String,
    lesson_path: String,
    dir: std::path::PathBuf,
    final_path: std::path::PathBuf,
    part_path: std::path::PathBuf,
    cookie: Option<String>,
    cancel: Arc<AtomicBool>,
) -> Result<(u64, u64), String> {
    use tokio::io::AsyncWriteExt;

    let resumed = std::fs::metadata(&part_path).map(|m| m.len()).unwrap_or(0);

    // Cliente próprio sem timeout global — um download de GBs demora mais
    // que os 120 s do cliente principal; segue redirects (o host pode 302).
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client.get(&url);
    if let Some(c) = &cookie {
        req = req.header("Cookie", c);
    }
    if resumed > 0 {
        req = req.header("Range", format!("bytes={}-", resumed));
    }
    let mut resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    if status == 401 {
        return Err("AUTH:401".to_string());
    }
    if status != 200 && status != 206 {
        return Err(format!("HTTP {}", status));
    }

    // 206 = retoma aceite (anexar); 200 com .part = servidor ignorou o
    // Range — recomeçar do zero para não misturar bytes.
    let append = status == 206 && resumed > 0;
    let mut received: u64 = if append { resumed } else { 0 };
    let total: u64 = if let Some(cr) = resp
        .headers()
        .get("content-range")
        .and_then(|v| v.to_str().ok())
    {
        // "bytes 123-456/7890" → total = 7890
        cr.rsplit('/')
            .next()
            .and_then(|s| s.trim().parse::<u64>().ok())
            .unwrap_or(0)
    } else if let Some(cl) = resp
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
    {
        if append {
            received + cl
        } else {
            cl
        }
    } else {
        0
    };

    // Tecto 2 GB com o total já conhecido (a 1.ª passagem foi com 0).
    if total > 0 {
        enforce_download_cap(&app, &dir, total);
    }

    let mut file = if append {
        tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&part_path)
            .await
            .map_err(|e| e.to_string())?
    } else {
        tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&part_path)
            .await
            .map_err(|e| e.to_string())?
    };

    let mut last_emit = std::time::Instant::now();
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err("cancelled".to_string());
        }
        match resp.chunk().await {
            Ok(Some(chunk)) => {
                file.write_all(&chunk).await.map_err(|e| e.to_string())?;
                received += chunk.len() as u64;
                // Progresso por evento, no máximo ~4x/segundo.
                if last_emit.elapsed().as_millis() >= 250 {
                    last_emit = std::time::Instant::now();
                    let _ = app.emit(
                        "download-progress",
                        serde_json::json!({
                            "lesson_path": lesson_path,
                            "received": received,
                            "total": total,
                            "done": false,
                            "path": null,
                        }),
                    );
                }
            }
            Ok(None) => break,
            Err(e) => return Err(e.to_string()),
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    // Rename .part → final (no Windows, apagar o destino primeiro).
    let _ = tokio::fs::remove_file(&final_path).await;
    tokio::fs::rename(&part_path, &final_path)
        .await
        .map_err(|e| e.to_string())?;

    Ok((received, total))
}

#[derive(Serialize)]
pub struct DownloadStatus {
    pub downloaded: bool,
    pub path: Option<String>,
    pub size: u64,
}

/// ★ v1.9.11: estado do download de uma aula — lê o disco, sem rede.
/// Procura o ficheiro final na pasta da aula (qualquer ficheiro que não
/// seja .part); sem ficheiro final, downloaded=false (mesmo com .part).
#[tauri::command]
pub async fn download_status(
    app: AppHandle,
    lesson_path: String,
) -> Result<DownloadStatus, String> {
    let dir = lesson_download_dir(&app, &lesson_path);
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            let fp = e.path();
            if !fp.is_file() {
                continue;
            }
            if fp.extension().and_then(|x| x.to_str()) == Some("part") {
                continue;
            }
            if let Ok(meta) = e.metadata() {
                return Ok(DownloadStatus {
                    downloaded: true,
                    path: Some(fp.to_string_lossy().to_string()),
                    size: meta.len(),
                });
            }
        }
    }
    Ok(DownloadStatus {
        downloaded: false,
        path: None,
        size: 0,
    })
}

/// ★ v1.9.11: pede o cancelamento do download em curso (o .part fica
/// para retomar depois). Devolve false se não havia download activo.
#[tauri::command]
pub async fn cancel_download(
    downloads: State<'_, DownloadManager>,
    lesson_path: String,
) -> Result<bool, String> {
    let active = downloads.active.lock().unwrap();
    if let Some(flag) = active.get(&lesson_path) {
        flag.store(true, Ordering::SeqCst);
        Ok(true)
    } else {
        Ok(false)
    }
}

/// ★ v1.9.11: apaga o ficheiro baixado (e o .part) da aula + o registo
/// da cache. Devolve false se não havia nada no disco.
#[tauri::command]
pub async fn delete_download(app: AppHandle, lesson_path: String) -> Result<bool, String> {
    let dir = lesson_download_dir(&app, &lesson_path);
    if !dir.exists() {
        return Ok(false);
    }
    std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    let _ = crate::db::download_cache_delete_dir(&app, &dir);
    Ok(true)
}

/// ★ v1.9.11: lê a regra "só no Wi-Fi" (por defeito ligada).
#[tauri::command]
pub async fn get_download_wifi_only(app: AppHandle) -> Result<bool, String> {
    Ok(crate::db::db_setting(&app, DOWNLOAD_WIFI_ONLY_KEY)
        .unwrap_or_else(|| "1".to_string())
        == "1")
}

/// ★ v1.9.11: grava a regra "só no Wi-Fi" (a UI de definições usa estes
/// dois comandos; sem UI nesta ronda, o valor por defeito é "ligada").
#[tauri::command]
pub async fn set_download_wifi_only(app: AppHandle, value: bool) -> Result<bool, String> {
    crate::db::db_set_setting(&app, DOWNLOAD_WIFI_ONLY_KEY, if value { "1" } else { "0" })?;
    Ok(true)
}
