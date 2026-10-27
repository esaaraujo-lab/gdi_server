// ═══════════════════════════════════════════════════════════════
// API wrapper — Tauri invoke helpers
// ═══════════════════════════════════════════════════════════════

import { invoke } from "@tauri-apps/api/core";

export async function login(username: string, password: string) {
  return invoke<{ ok: boolean; error: string | null }>("login", { username, password });
}

export async function getDrives() {
  return invoke<{ index: number; name: string }[]>("get_drives");
}

export async function listFolder(driveIndex: number, path?: string) {
  return invoke<{
    name: string; mime_type: string; id: string; link: string | null; size: number;
  }[]>("list_folder", { driveIndex, path: path ?? null });
}

export async function getCourseLessons(coursePath: string) {
  return invoke<any>("get_course_lessons", { coursePath });
}

export async function getCoursesList() {
  return invoke<any>("get_courses_list");
}

export async function aiChat(message: string) {
  return invoke<string>("ai_chat", { message });
}

export async function aiCoach() {
  return invoke<any>("ai_coach");
}

export async function aiStatus() {
  return invoke<any>("ai_status");
}

export async function getD1Status() {
  return invoke<any>("get_d1_status");
}

export async function scanCourse(coursePath: string) {
  return invoke<any>("scan_course", { coursePath });
}

export async function checkSession() {
  return invoke<{ logged_in: boolean }>("check_session");
}

export async function logout() {
  return invoke<boolean>("logout");
}

// ─────────────────────────────────────────────────────────────────
// v1.4.4 — Inline player support (ISA generation, material fetch)
// ─────────────────────────────────────────────────────────────────

export interface IsaCache {
  cached: {
    summary?: string | null;
    questions?: any[] | null;
    mindmap?: string | null;
    lessonName?: string | null;
  } | null;
}

/** GET /api/ai/cache?key=... — returns cached ISA payload (or null on miss). */
export async function aiCacheGet(key: string) {
  return invoke<IsaCache>("ai_cache_get", { key });
}

/** POST /api/ai/cache — fire-and-forget save. */
export async function aiCacheSave(
  key: string,
  data: {
    summary?: string | null;
    questions?: any[] | null;
    mindmap?: string | null;
    lessonName?: string;
  },
) {
  return invoke<boolean>("ai_cache_save", {
    key,
    summary: data.summary ?? null,
    questions: data.questions ?? null,
    mindmap: data.mindmap ?? null,
    lessonName: data.lessonName ?? null,
  });
}

/** POST /api/ai — generate ISA content with optional `kind` hint. */
export async function aiGenerate(message: string, kind?: string) {
  return invoke<string>("ai_generate", { message, kind: kind ?? null });
}

/** Fetch text content of a remote URL (MD/TXT/HTML materials). */
export async function fetchText(url: string) {
  return invoke<string>("fetch_text", { url });
}

/** ★ v1.4.5: Extract text from a PDF URL using pdf-extract (Rust crate). */
export async function extractPdfText(url: string) {
  return invoke<string>("extract_pdf_text", { url });
}

/** ★ v1.5.2: Download a file (PDF) with session cookie + redirects, save to temp, return path. */
export async function downloadToTemp(url: string) {
  return invoke<string>("download_to_temp", { url });
}

/** ★ v1.5.5: Save user state (watched, resume, history) to worker. */
export async function saveUserState(data: Record<string, unknown>) {
  return invoke<boolean>("save_user_state", { data });
}

/** ★ v1.5.5: Get user state from worker. */
export async function getUserState() {
  return invoke<Record<string, unknown>>("get_user_state");
}
