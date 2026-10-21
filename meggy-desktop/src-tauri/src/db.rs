// ═══════════════════════════════════════════════════════════════
// Meggy Desktop — SQLite Local Database
// Cache offline de lessons, summaries, flashcards, user_state
// ═══════════════════════════════════════════════════════════════

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::Path;

pub fn init_db(db_path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let conn = Connection::open(db_path)?;
    
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS lessons (
            id TEXT PRIMARY KEY,
            course_path TEXT NOT NULL,
            lesson_path TEXT NOT NULL,
            lesson_name TEXT NOT NULL,
            lesson_type TEXT,
            scanned_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_path);
        
        CREATE TABLE IF NOT EXISTS summaries (
            id TEXT PRIMARY KEY,
            lesson_name TEXT NOT NULL,
            summary TEXT,
            questions TEXT,
            mindmap TEXT,
            created_at INTEGER
        );
        
        CREATE TABLE IF NOT EXISTS flashcards (
            id TEXT PRIMARY KEY,
            subject TEXT,
            front TEXT NOT NULL,
            back TEXT NOT NULL,
            created_at INTEGER
        );
        
        CREATE TABLE IF NOT EXISTS user_state (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        
        CREATE TABLE IF NOT EXISTS download_cache (
            url TEXT PRIMARY KEY,
            local_path TEXT NOT NULL,
            size INTEGER,
            downloaded_at INTEGER
        );
    ")?;
    
    Ok(())
}

#[derive(Serialize, Deserialize)]
pub struct Lesson {
    pub lesson_name: String,
    pub lesson_path: String,
    pub course_path: String,
    pub lesson_type: Option<String>,
}

#[tauri::command]
pub async fn search_lessons(
    app: tauri::AppHandle,
    query: String,
) -> Result<Vec<Lesson>, String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    let pattern = format!("%{}%", query);
    let mut stmt = conn
        .prepare("SELECT lesson_name, lesson_path, course_path, lesson_type FROM lessons WHERE lesson_name LIKE ?1 ORDER BY lesson_name LIMIT 50")
        .map_err(|e| e.to_string())?;
    
    let lessons = stmt.query_map([&pattern], |row| {
        Ok(Lesson {
            lesson_name: row.get(0)?,
            lesson_path: row.get(1)?,
            course_path: row.get(2)?,
            lesson_type: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    
    Ok(lessons)
}

#[tauri::command]
pub async fn get_cached_summary(
    app: tauri::AppHandle,
    lesson_name: String,
) -> Result<Option<serde_json::Value>, String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare("SELECT summary, questions, mindmap FROM summaries WHERE lesson_name = ?1 LIMIT 1")
        .map_err(|e| e.to_string())?;
    
    let result = stmt.query_row([&lesson_name], |row| {
        Ok(serde_json::json!({
            "summary": row.get::<_, Option<String>>(0)?,
            "questions": row.get::<_, Option<String>>(1)?,
            "mindmap": row.get::<_, Option<String>>(2)?,
        }))
    });
    
    match result {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn save_summary(
    app: tauri::AppHandle,
    lesson_name: String,
    summary: String,
    questions: Option<String>,
    mindmap: Option<String>,
) -> Result<bool, String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT OR REPLACE INTO summaries (id, lesson_name, summary, questions, mindmap, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            &lesson_name,
            &lesson_name,
            &summary,
            &questions,
            &mindmap,
            chrono::Utc::now().timestamp()
        ],
    ).map_err(|e| e.to_string())?;
    
    Ok(true)
}

#[tauri::command]
pub async fn get_cached_flashcards(
    app: tauri::AppHandle,
    subject: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = if subject.is_some() {
        conn.prepare("SELECT id, subject, front, back FROM flashcards WHERE subject = ?1 ORDER BY created_at DESC LIMIT 100")
            .map_err(|e| e.to_string())?
    } else {
        conn.prepare("SELECT id, subject, front, back FROM flashcards ORDER BY created_at DESC LIMIT 100")
            .map_err(|e| e.to_string())?
    };
    
    let cards = if subject.is_some() {
        stmt.query_map([&subject], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "subject": row.get::<_, Option<String>>(1)?,
                "front": row.get::<_, String>(2)?,
                "back": row.get::<_, String>(3)?,
            }))
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect()
    } else {
        stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "subject": row.get::<_, Option<String>>(1)?,
                "front": row.get::<_, String>(2)?,
                "back": row.get::<_, String>(3)?,
            }))
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect()
    };
    
    Ok(cards)
}

#[tauri::command]
pub async fn save_flashcards(
    app: tauri::AppHandle,
    cards: Vec<serde_json::Value>,
) -> Result<bool, String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    for card in cards {
        let id = card["id"].as_str().unwrap_or(&uuid()).to_string();
        let subject = card["subject"].as_str().map(|s| s.to_string());
        let front = card["front"].as_str().unwrap_or("").to_string();
        let back = card["back"].as_str().unwrap_or("").to_string();
        
        conn.execute(
            "INSERT OR REPLACE INTO flashcards (id, subject, front, back, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![&id, &subject, &front, &back, chrono::Utc::now().timestamp()],
        ).map_err(|e| e.to_string())?;
    }
    
    Ok(true)
}

fn get_db_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| {
        dirs::data_dir().unwrap_or_default().join("Meggy")
    });
    std::fs::create_dir_all(&dir).ok();
    dir.join("meggy.db")
}

fn uuid() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    format!("card_{}", ts)
}
