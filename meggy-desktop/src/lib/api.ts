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
