// ═══════════════════════════════════════════════════════════════
// llama-bridge.ts — Tauri invoke wrappers for llama.cpp (v1.8.0)
// Manages llama-server subprocess: download binary, download models,
// start/stop server, chat with OpenAI-compatible API.
// ═══════════════════════════════════════════════════════════════

import { invoke } from "@tauri-apps/api/core";

export interface LlamaStatus {
  running: boolean;
  model: string | null;
  port: number;
  binary_path: string;
  models_dir: string;
}

export interface LlamaBinaryInfo {
  url: string;
  filename: string;
  extract_cmd: string;
  backend: string;
}

export interface GgufModel {
  id: string;
  label: string;
  size_mb: number;
  url: string;
  filename: string;
  description: string;
  emoji: string;
  recommended_gpu_layers: number;
}

export async function llamaStatus(): Promise<LlamaStatus> {
  return invoke<LlamaStatus>("llama_status");
}

export async function llamaBinaryInfo(): Promise<LlamaBinaryInfo> {
  return invoke<LlamaBinaryInfo>("llama_binary_info");
}

export async function llamaBinaryExists(): Promise<boolean> {
  return invoke<boolean>("llama_binary_exists");
}

export async function llamaDownloadBinary(): Promise<string> {
  return invoke<string>("llama_download_binary");
}

export async function llamaModels(): Promise<GgufModel[]> {
  return invoke<GgufModel[]>("llama_models");
}

export async function llamaDownloadModel(modelUrl: string, filename: string): Promise<string> {
  return invoke<string>("llama_download_model", { modelUrl, filename });
}

export async function llamaStart(modelPath: string, gpuLayers: number): Promise<string> {
  return invoke<string>("llama_start", { modelPath, gpuLayers });
}

export async function llamaStop(): Promise<boolean> {
  return invoke<boolean>("llama_stop");
}

export async function llamaChat(
  message: string,
  systemPrompt?: string,
  // ★ v1.9.11: limite de tokens (2048 por defeito no Rust). As questões em
  // JSON estrito precisam de ~4096, senão o JSON vem cortado.
  maxTokens?: number,
): Promise<{ text: string; ok: boolean; error?: string }> {
  return invoke<{ text: string; ok: boolean; error?: string }>("llama_chat", {
    req: { message, systemPrompt: systemPrompt ?? null, max_tokens: maxTokens ?? null },
  });
}

export async function llamaListModels(): Promise<string[]> {
  return invoke<string[]>("llama_list_models");
}

// ★ v1.9.11: modelo llama guardado — o arranque automático do servidor
// precisa de saber qual o modelo + quantas camadas na GPU. Guardado quando
// o servidor arranca com sucesso no gestor de IA (mesmo molde localStorage
// do resto do estado local).
const STORAGE_KEY_LLAMA_MODEL = "meggy-llama-model";
const STORAGE_KEY_LLAMA_GPU_LAYERS = "meggy-llama-gpu-layers";

export function getLlamaModel(): { filename: string; gpuLayers: number } | null {
  try {
    const filename = localStorage.getItem(STORAGE_KEY_LLAMA_MODEL);
    if (!filename) return null;
    const layers = parseInt(localStorage.getItem(STORAGE_KEY_LLAMA_GPU_LAYERS) || "10", 10);
    return { filename, gpuLayers: Number.isFinite(layers) ? layers : 10 };
  } catch (_) {
    return null;
  }
}

export function setLlamaModel(filename: string, gpuLayers: number): void {
  try {
    localStorage.setItem(STORAGE_KEY_LLAMA_MODEL, filename);
    localStorage.setItem(STORAGE_KEY_LLAMA_GPU_LAYERS, String(gpuLayers));
  } catch (_) { /* ignore */ }
}
