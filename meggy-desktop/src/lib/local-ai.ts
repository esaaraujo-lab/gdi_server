// ═══════════════════════════════════════════════════════════════
// local-ai.ts — WebLLM wrapper (v1.5.0)
// Runs LLM models locally via WebGPU in the WebView2.
// No login, no API keys, works offline after first download.
// ═══════════════════════════════════════════════════════════════

// ★ Dynamically import webllm to avoid loading the heavy library unless needed.

export interface LocalAIModel {
  id: string;
  label: string;
  sizeMb: number;
  description: string;
  emoji: string;
}

// Available WebLLM models — these are well-supported on WebView2 with WebGPU.
export const LOCAL_AI_MODELS: LocalAIModel[] = [
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 — 0.5B",
    sizeMb: 500,
    description: "Mais rápido (~500MB). Respostas em segundos. Boa para resumos curtos.",
    emoji: "⚡",
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 — 1B",
    sizeMb: 1000,
    description: "Equilíbrio (~1GB). Boa qualidade, velocidade razoável.",
    emoji: "⚖️",
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    label: "Phi 3.5 — mini",
    sizeMb: 2000,
    description: "Melhor qualidade (~2GB). Mais lento, mas respostas mais profundas.",
    emoji: "🎓",
  },
];

const STORAGE_KEY_MODEL = "meggy-local-ai-model";
const STORAGE_KEY_DISMISSED = "meggy-local-ai-dismissed";

// System prompt for the local Meggy AI.
export const MEGGY_LOCAL_SYSTEM_PROMPT =
  "Você é a Meggy — uma poodle tutora de estudos brasileira. 🐩 Responda em português, clara e objetiva. Use Markdown.";

// ─── Internal state ───
// We keep the engine instance in a module-level variable so it persists across calls.
// Using `any` here because the webllm types are complex and we only use the OpenAI-like API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let engineInstance: any = null;
let currentLoadedModelId: string | null = null;

// ─── WebGPU detection ───
// Basic check: does navigator.gpu exist?
export function checkWebGPU(): boolean {
  if (typeof navigator === "undefined") return false;
  return "gpu" in navigator;
}

// ★ v1.6.9: Lenient check — only verify basic WebGPU + compute pipeline creation.
// The v1.6.7 strict check (complex shader with uniforms/storage buffers) was TOO strict
// and rejected GPUs like the RX470 that CAN actually run WebLLM (just slower).
// Now we use a simple shader and let WebLLM try — if it fails, we show a helpful error
// but still let the user attempt to use local AI.
export async function checkWebGPUCompute(): Promise<{ ok: boolean; error?: string }> {
  if (!checkWebGPU()) {
    return { ok: false, error: "WebGPU não disponível neste navegador." };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gpu = (navigator as any).gpu;
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return { ok: false, error: "Nenhuma GPU compatível encontrada. Verifique seus drivers." };
    }
    const device = await adapter.requestDevice();
    if (!device) {
      return { ok: false, error: "Não foi possível criar dispositivo WebGPU." };
    }
    // ★ v1.6.9: Simple shader — just verify compute pipeline creation works at all.
    // Don't try to match WebLLM's exact shader — that was too strict for older GPUs.
    const shaderCode = `
      @compute @workgroup_size(1)
      fn main(@builtin(global_invocation_id) id: vec3<u32>) {}
    `;
    const shaderModule = device.createShaderModule({ code: shaderCode });
    let pipeline: unknown = null;
    try {
      pipeline = device.createComputePipeline({
        layout: "auto",
        compute: { module: shaderModule, entryPoint: "main" },
      });
    } catch (pipelineErr: unknown) {
      const msg = pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr);
      device.destroy();
      return { ok: false, error: `GPU não suporta compute shaders: ${msg}` };
    }
    if (!pipeline) {
      device.destroy();
      return { ok: false, error: "GPU não suporta compute shaders necessários para IA local." };
    }
    device.destroy();
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `WebGPU compute falhou: ${msg}` };
  }
}

// ─── LocalStorage helpers ───
export function getSelectedModel(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_MODEL);
  } catch (_) {
    return null;
  }
}

export function setSelectedModel(modelId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_MODEL, modelId);
  } catch (_) { /* ignore */ }
}

export function clearSelectedModel(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_MODEL);
  } catch (_) { /* ignore */ }
}

export function isPopupDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_DISMISSED) === "1";
  } catch (_) {
    return false;
  }
}

export function dismissPopup(): void {
  try {
    localStorage.setItem(STORAGE_KEY_DISMISSED, "1");
  } catch (_) { /* ignore */ }
}

export function undismissPopup(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_DISMISSED);
  } catch (_) { /* ignore */ }
}

/** True if a model has been chosen in localStorage (does NOT mean it's loaded in memory). */
export function hasLocalAIConfigured(): boolean {
  return !!getSelectedModel();
}

// ─── Engine loading ───
export interface LoadProgress {
  progress: number; // 0..1
  text: string;
  timeElapsed?: number;
}

/**
 * Load a model into memory. Subsequent calls reuse the same engine if the model is the same.
 * @param modelId WebLLM model id (e.g. "Qwen2.5-0.5B-Instruct-q4f16_1-MLC")
 * @param onProgress Optional progress callback (called multiple times during download/init).
 */
export async function loadModel(
  modelId: string,
  onProgress?: (p: LoadProgress) => void,
): Promise<void> {
  // If already loaded with the same model, nothing to do.
  if (engineInstance && currentLoadedModelId === modelId) return;

  // If a different model is loaded, unload first.
  if (engineInstance && currentLoadedModelId !== modelId) {
    await unloadModel();
  }

  if (!checkWebGPU()) {
    throw new Error("WebGPU não disponível neste navegador/computador.");
  }

  // ★ v1.5.3: Validate compute shaders actually work (not just navigator.gpu exists)
  const computeCheck = await checkWebGPUCompute();
  if (!computeCheck.ok) {
    throw new Error(computeCheck.error || "WebGPU compute não suportado. IA Local não funcionará.");
  }

  // Dynamic import — avoids bundling webllm when not used.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webllm: any = await import("@mlc-ai/web-llm");

  onProgress?.({ progress: 0, text: "Iniciando download do modelo…" });

  engineInstance = await webllm.CreateMLCEngine(modelId, {
    initProgressCallback: (info: { progress: number; text: string; timeElapsed?: number }) => {
      onProgress?.({
        progress: typeof info.progress === "number" ? info.progress : 0,
        text: info.text || "",
        timeElapsed: info.timeElapsed,
      });
    },
  });
  currentLoadedModelId = modelId;
}

/**
 * Check if a model is already cached in the browser (Cache API).
 * This is fast — it does NOT download anything.
 */
export async function isModelCached(modelId: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webllm: any = await import("@mlc-ai/web-llm");
    if (typeof webllm.hasModelInCache === "function") {
      return await webllm.hasModelInCache(modelId);
    }
    return false;
  } catch (_) {
    return false;
  }
}

/**
 * Returns the list of model IDs that are currently cached in the browser.
 */
export async function getInstalledModels(): Promise<string[]> {
  const installed: string[] = [];
  for (const m of LOCAL_AI_MODELS) {
    if (await isModelCached(m.id)) installed.push(m.id);
  }
  return installed;
}

// ─── Chat ───
export interface LocalChatOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface LocalChatResult {
  text: string;
  ok: boolean;
  error?: string;
}

/**
 * Generate a chat response using the loaded local model.
 * Throws if no model is loaded. Catch and fall back to cloud.
 */
export async function localChat(
  message: string,
  options: LocalChatOptions = {},
): Promise<LocalChatResult> {
  if (!engineInstance) {
    return { text: "", ok: false, error: "Nenhum modelo carregado." };
  }
  try {
    const messages = [
      { role: "system" as const, content: options.systemPrompt ?? MEGGY_LOCAL_SYSTEM_PROMPT },
      { role: "user" as const, content: message },
    ];
    const reply = await engineInstance.chat.completions.create({
      messages,
      temperature: options.temperature ?? 0.6,
      max_tokens: options.maxTokens ?? 2048,
    });
    // OpenAI-compatible shape: reply.choices[0].message.content
    const text = reply?.choices?.[0]?.message?.content ?? "";
    return { text: typeof text === "string" ? text : String(text), ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: "", ok: false, error: msg };
  }
}

// ─── Streaming chat (optional, for chat UIs) ───
/**
 * Async generator that yields chunks of the response as they are produced.
 * Falls back to a single-shot response if streaming isn't supported.
 */
export async function* localChatStream(
  message: string,
  options: LocalChatOptions = {},
): AsyncGenerator<string, void, void> {
  if (!engineInstance) {
    yield "";
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webllm: any = await import("@mlc-ai/web-llm");
    const messages = [
      { role: "system", content: options.systemPrompt ?? MEGGY_LOCAL_SYSTEM_PROMPT },
      { role: "user", content: message },
    ];
    // CreateMLCEngine supports .chat.completions.create with stream:true returning an async iterable.
    const stream = await engineInstance.chat.completions.create({
      messages,
      temperature: options.temperature ?? 0.6,
      max_tokens: options.maxTokens ?? 2048,
      stream: true,
    });
    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) yield delta;
    }
  } catch (e) {
    // Fallback to non-streaming
    const r = await localChat(message, options);
    if (r.ok && r.text) yield r.text;
  }
}

// ─── Unload ───
/**
 * Unload the model from memory and free GPU resources.
 */
export async function unloadModel(): Promise<void> {
  if (!engineInstance) return;
  try {
    if (typeof engineInstance.unload === "function") {
      await engineInstance.unload();
    } else if (typeof engineInstance.purgeWorker === "function") {
      await engineInstance.purgeWorker();
    }
  } catch (_) { /* ignore */ }
  engineInstance = null;
  currentLoadedModelId = null;
}

/** Returns whether a model is currently loaded in memory. */
export function isModelLoaded(): boolean {
  return engineInstance !== null;
}

/** Returns the model id currently loaded in memory (or null). */
export function getLoadedModelId(): string | null {
  return currentLoadedModelId;
}

// ─── Convenience: ensure a model is loaded ───
/**
 * If a model is configured in localStorage but not yet loaded into memory, load it.
 * Returns true if a model is ready to use after this call.
 */
export async function ensureModelLoaded(
  onProgress?: (p: LoadProgress) => void,
): Promise<boolean> {
  const modelId = getSelectedModel();
  if (!modelId) return false;
  if (engineInstance && currentLoadedModelId === modelId) return true;
  try {
    await loadModel(modelId, onProgress);
    return true;
  } catch (e) {
    console.warn("ensureModelLoaded failed", e);
    return false;
  }
}

// ─── Convenience: try local AI first, fall back to cloud ───
/**
 * Try local AI first; if it fails or returns too-short response, run the cloud fallback.
 * Returns the response text and which source was used.
 */
export async function tryLocalThenCloud(
  message: string,
  cloudFn: (message: string) => Promise<string>,
  options: {
    minChars?: number;
    onLocalStart?: () => void;
    onLocalDone?: (text: string) => void;
    onCloudStart?: () => void;
  } = {},
): Promise<{ text: string; source: "local" | "cloud"; error?: string }> {
  const minChars = options.minChars ?? 100;

  // Only attempt local if a model is configured AND WebGPU compute works.
  if (hasLocalAIConfigured()) {
    const computeOk = await checkWebGPUCompute();
    if (!computeOk.ok) {
      console.warn("WebGPU compute not available, using cloud:", computeOk.error);
    } else {
      try {
        options.onLocalStart?.();
        const loaded = await ensureModelLoaded();
        if (loaded) {
          const r = await localChat(message, { maxTokens: 2048, temperature: 0.6 });
          if (r.ok && r.text && r.text.length >= minChars) {
            options.onLocalDone?.(r.text);
            return { text: r.text, source: "local" };
          }
        }
      } catch (e) {
        console.warn("local AI failed, falling back to cloud:", e);
      }
    }
  }

  // Cloud fallback
  options.onCloudStart?.();
  try {
    const text = await cloudFn(message);
    return { text, source: "cloud" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: "", source: "cloud", error: msg };
  }
}
