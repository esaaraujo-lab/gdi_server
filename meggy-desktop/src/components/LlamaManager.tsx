// ═══════════════════════════════════════════════════════════════
// LlamaManager.tsx — UI for llama.cpp integration (v1.8.0)
// Download binary, download models, configure GPU offload, start/stop server.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import {
  llamaStatus,
  llamaBinaryInfo,
  llamaBinaryExists,
  llamaDownloadBinary,
  llamaModels,
  llamaDownloadModel,
  llamaStart,
  llamaStop,
  llamaChat,
  llamaListModels,
  type LlamaStatus as LlamaStatusT,
  type LlamaBinaryInfo as BinaryInfoT,
  type GgufModel,
} from "../lib/llama-bridge";

interface LlamaManagerProps {
  onClose: () => void;
  onReady: (modelLabel: string) => void;
}

export default function LlamaManager({ onClose, onReady }: LlamaManagerProps) {
  const [status, setStatus] = useState<LlamaStatusT | null>(null);
  const [binaryInfo, setBinaryInfo] = useState<BinaryInfoT | null>(null);
  const [binaryExists, setBinaryExists] = useState(false);
  const [models, setModels] = useState<GgufModel[]>([]);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [gpuLayers, setGpuLayers] = useState(10);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testResp, setTestResp] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, bi, exists, mods, dl] = await Promise.all([
        llamaStatus(),
        llamaBinaryInfo(),
        llamaBinaryExists(),
        llamaModels(),
        llamaListModels(),
      ]);
      setStatus(s);
      setBinaryInfo(bi);
      setBinaryExists(exists);
      setModels(mods);
      setDownloadedModels(dl);
      // Auto-select first downloaded model
      if (dl.length > 0 && !selectedModel) {
        const match = mods.find((m) => dl.includes(m.filename));
        if (match) {
          setSelectedModel(match.filename);
          setGpuLayers(match.recommended_gpu_layers);
        }
      }
    } catch (e: unknown) {
      setError(String(e));
    }
  }, [selectedModel]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDownloadBinary() {
    setBusy("Baixando llama-server...");
    setError(null);
    try {
      await llamaDownloadBinary();
      setBinaryExists(true);
      setBusy(null);
    } catch (e: unknown) {
      setError(String(e));
      setBusy(null);
    }
  }

  async function handleDownloadModel(m: GgufModel) {
    setBusy(`Baixando ${m.label} (${(m.size_mb / 1000).toFixed(1)} GB)...`);
    setError(null);
    try {
      const path = await llamaDownloadModel(m.url, m.filename);
      setSelectedModel(m.filename);
      setGpuLayers(m.recommended_gpu_layers);
      setBusy(null);
      await refresh();
      console.log("Model downloaded to:", path);
    } catch (e: unknown) {
      setError(String(e));
      setBusy(null);
    }
  }

  async function handleStart() {
    if (!selectedModel) return;
    setBusy("Iniciando llama-server (pode levar 10-30s)...");
    setError(null);
    try {
      const modelsDir = status?.models_dir || "";
      const modelPath = `${modelsDir}/${selectedModel}`;
      const msg = await llamaStart(modelPath, gpuLayers);
      console.log(msg);
      setBusy(null);
      await refresh();
    } catch (e: unknown) {
      setError(String(e));
      setBusy(null);
    }
  }

  async function handleStop() {
    setBusy("Parando llama-server...");
    try {
      await llamaStop();
      setBusy(null);
      await refresh();
    } catch (e: unknown) {
      setError(String(e));
      setBusy(null);
    }
  }

  async function handleTest() {
    if (!status?.running) return;
    setBusy("Testando chat...");
    setTestResp(null);
    setTestMsg("Oi! Sou a Meggy 🐩. Apresente-se em 2 frases curtas.");
    try {
      const r = await llamaChat("Oi! Sou a Meggy 🐩. Apresente-se em 2 frases curtas.");
      if (r.ok && r.text) {
        setTestResp(r.text);
      } else {
        setError(r.error || "Resposta vazia");
      }
    } catch (e: unknown) {
      setError(String(e));
    }
    setBusy(null);
  }

  function fmtSize(mb: number): string {
    if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
    return `${mb} MB`;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "18px",
          width: "100%",
          maxWidth: "680px",
          maxHeight: "90vh",
          overflow: "auto",
          padding: "28px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div style={{ fontSize: "40px", marginBottom: "8px" }}>🦙</div>
          <h2 style={{ color: "var(--pink)", fontSize: "22px", fontWeight: 700, marginBottom: "6px" }}>
            IA Local — llama.cpp (Offload CPU/GPU)
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: 1.5, maxWidth: "520px", margin: "0 auto" }}>
            Roda modelos gigantes dividindo entre VRAM (GPU) e RAM (CPU). Funciona em qualquer GPU —
            inclusive RX470, Intel HD, e GPUs antigas que não rodam WebLLM.
          </p>
          {binaryInfo && (
            <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--teal)" }}>
              Backend: {binaryInfo.backend}
            </div>
          )}
        </div>

        {error && (
          <div style={{
            padding: "10px 14px",
            background: "rgba(255,139,159,0.08)",
            border: "1px solid rgba(255,139,159,0.3)",
            borderRadius: "8px",
            marginBottom: "16px",
            color: "var(--pink)",
            fontSize: "12px",
            whiteSpace: "pre-wrap",
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Step 1: Binary */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", marginBottom: "10px" }}>
            1. Baixar Engine (llama-server)
          </div>
          {binaryExists ? (
            <div style={{
              padding: "10px 14px",
              background: "rgba(63,185,80,0.08)",
              border: "1px solid rgba(63,185,80,0.2)",
              borderRadius: "8px",
              color: "#3fb950",
              fontSize: "13px",
            }}>
              ✓ llama-server instalado em: {status?.binary_path}
            </div>
          ) : (
            <button
              onClick={handleDownloadBinary}
              disabled={!!busy}
              style={{
                ...btn,
                background: "linear-gradient(135deg, #ff8b9f, #c026d3)",
                color: "#fff",
                border: "none",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy?.includes("llama-server") ? "⏳ Baixando..." : "⬇ Baixar llama-server (~50 MB)"}
            </button>
          )}
        </div>

        {/* Step 2: Models */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", marginBottom: "10px" }}>
            2. Baixar Modelo (.gguf)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {models.map((m) => {
              const isDownloaded = downloadedModels.includes(m.filename);
              const isSelected = selectedModel === m.filename;
              return (
                <div
                  key={m.id}
                  style={{
                    background: isSelected ? "rgba(255,139,159,0.08)" : "rgba(255,255,255,0.03)",
                    border: isSelected ? "1px solid rgba(255,139,159,0.4)" : "1px solid var(--border)",
                    borderRadius: "12px",
                    padding: "14px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                    <div style={{ fontSize: "22px", flexShrink: 0 }}>{m.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                        <strong style={{ color: "var(--text)", fontSize: "14px" }}>{m.label}</strong>
                        <span style={{
                          padding: "2px 8px",
                          background: "rgba(93,222,218,0.12)",
                          color: "var(--teal)",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 600,
                        }}>
                          {fmtSize(m.size_mb)}
                        </span>
                        {isDownloaded && (
                          <span style={{
                            padding: "2px 8px",
                            background: "rgba(63,185,80,0.12)",
                            color: "#3fb950",
                            borderRadius: "999px",
                            fontSize: "11px",
                            fontWeight: 600,
                          }}>
                            ✓ Instalado
                          </span>
                        )}
                      </div>
                      <div style={{ color: "var(--text-muted)", fontSize: "12px", lineHeight: 1.5 }}>
                        {m.description}
                      </div>
                      <div style={{ color: "var(--text-muted)", fontSize: "11px", marginTop: "4px" }}>
                        Recomendado: {m.recommended_gpu_layers} camadas na GPU
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                    {!isDownloaded && (
                      <button
                        onClick={() => handleDownloadModel(m)}
                        disabled={!!busy}
                        style={{ ...btn, opacity: busy ? 0.5 : 1 }}
                      >
                        {busy?.includes(m.label) ? "⏳ Baixando..." : `⬇ Baixar (${fmtSize(m.size_mb)})`}
                      </button>
                    )}
                    {isDownloaded && !isSelected && (
                      <button onClick={() => { setSelectedModel(m.filename); setGpuLayers(m.recommended_gpu_layers); }} style={btn}>
                        ● Selecionar
                      </button>
                    )}
                    {isDownloaded && isSelected && (
                      <span style={{ color: "var(--pink)", fontSize: "12px", fontWeight: 600, padding: "6px 10px" }}>✓ Selecionado</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 3: GPU Offload Slider */}
        {selectedModel && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", marginBottom: "10px" }}>
              3. Configurar Offload GPU
            </div>
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "16px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ color: "var(--text)", fontSize: "13px" }}>Camadas na GPU (VRAM)</span>
                <span style={{ color: "var(--pink)", fontSize: "13px", fontWeight: 700 }}>{gpuLayers}</span>
              </div>
              <input
                type="range"
                min={0}
                max={40}
                value={gpuLayers}
                onChange={(e) => setGpuLayers(parseInt(e.target.value))}
                style={{ width: "100%", accentColor: "#ff8b9f" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
                <span>0 = só CPU (lento, roda qualquer modelo)</span>
                <span>40 = tudo na GPU (rápido, precisa de VRAM)</span>
              </div>
              <div style={{ fontSize: "11px", color: "var(--teal)", marginTop: "8px" }}>
                💡 RX470 (4GB VRAM): use 10-18 camadas para modelos 3B, ou 25+ para 1.5B.
                O resto roda na RAM do sistema automaticamente.
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Server Control */}
        {selectedModel && binaryExists && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", marginBottom: "10px" }}>
              4. Iniciar Servidor
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {!status?.running ? (
                <button
                  onClick={handleStart}
                  disabled={!!busy}
                  style={{
                    ...btn,
                    background: "linear-gradient(135deg, #ff8b9f, #c026d3)",
                    color: "#fff",
                    border: "none",
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  {busy?.includes("Iniciando") ? "⏳ Iniciando..." : "▶ Iniciar IA Local"}
                </button>
              ) : (
                <>
                  <span style={{
                    padding: "8px 14px",
                    background: "rgba(63,185,80,0.12)",
                    border: "1px solid rgba(63,185,80,0.3)",
                    borderRadius: "8px",
                    color: "#3fb950",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}>
                    ✓ Servidor rodando (porta {status.port})
                  </span>
                  <button onClick={handleTest} disabled={!!busy} style={btn}>
                    🧪 Testar
                  </button>
                  <button onClick={handleStop} disabled={!!busy} style={{ ...btn, color: "var(--pink)", borderColor: "rgba(255,139,159,0.3)" }}>
                    ⏹ Parar
                  </button>
                </>
              )}
            </div>

            {/* Test response */}
            {testResp && (
              <div style={{
                marginTop: "12px",
                padding: "12px",
                background: "rgba(93,222,218,0.06)",
                border: "1px solid rgba(93,222,218,0.2)",
                borderRadius: "8px",
                color: "var(--text)",
                fontSize: "13px",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}>
                <div style={{ color: "var(--teal)", fontSize: "11px", marginBottom: "4px", fontWeight: 600 }}>
                  🦙 Resposta:
                </div>
                {testResp}
              </div>
            )}
            {testMsg && !testResp && (
              <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--text-muted)" }}>
                Enviado: "{testMsg}"
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          justifyContent: "center",
          borderTop: "1px solid var(--border)",
          paddingTop: "16px",
        }}>
          <button
            onClick={() => {
              if (status?.running && selectedModel) {
                const m = models.find((x) => x.filename === selectedModel);
                onReady(m?.label || "llama.cpp");
              } else {
                onClose();
              }
            }}
            disabled={!status?.running}
            style={{
              ...btn,
              background: status?.running ? "linear-gradient(135deg, #ff8b9f, #c026d3)" : "var(--surface-2)",
              color: status?.running ? "#fff" : "var(--text-muted)",
              border: "none",
              opacity: status?.running ? 1 : 0.6,
              padding: "10px 18px",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            ⚡ Usar IA Local (llama.cpp)
          </button>
          <button onClick={onClose} style={{ ...btn, padding: "10px 18px", fontSize: "14px" }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: "8px 14px",
  background: "var(--surface-2)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "13px",
  fontFamily: "inherit",
  fontWeight: 500,
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
};
