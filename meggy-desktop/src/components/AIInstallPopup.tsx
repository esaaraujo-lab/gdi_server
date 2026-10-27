// ═══════════════════════════════════════════════════════════════
// AIInstallPopup.tsx — First-launch popup for local AI setup (v1.5.0)
// Shows WebGPU status, lets user download a model, test, and choose
// between "Usar IA Local" / "Usar IA da Nuvem" / "Ver depois".
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import {
  LOCAL_AI_MODELS,
  checkWebGPU,
  loadModel,
  localChat,
  unloadModel,
  isModelCached,
  setSelectedModel,
  clearSelectedModel,
  getSelectedModel,
  type LoadProgress,
  type LocalAIModel,
} from "../lib/local-ai";

interface AIInstallPopupProps {
  onClose: () => void;
  onChooseLocal: (modelId: string) => void;
  onChooseCloud: () => void;
}

interface ModelStatus {
  cached: boolean;
  downloading: boolean;
  loaded: boolean;
  progress: LoadProgress | null;
  errorMsg: string | null;
}

const initialStatus: ModelStatus = {
  cached: false,
  downloading: false,
  loaded: false,
  progress: null,
  errorMsg: null,
};

export default function AIInstallPopup({ onClose, onChooseLocal, onChooseCloud }: AIInstallPopupProps) {
  const [webgpuOk, setWebgpuOk] = useState<boolean | null>(null);
  // Per-model status: keyed by model id
  const [statuses, setStatuses] = useState<Record<string, ModelStatus>>({});
  const [selectedModel, setSelectedModelState] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // ─── Initial checks ───
  useEffect(() => {
    const gpu = checkWebGPU();
    setWebgpuOk(gpu);

    if (gpu) {
      // Check cache status for each model (async, fire-and-forget).
      LOCAL_AI_MODELS.forEach(async (m) => {
        try {
          const cached = await isModelCached(m.id);
          setStatuses((prev) => ({
            ...prev,
            [m.id]: { ...initialStatus, cached, loaded: false },
          }));
        } catch (_) {
          setStatuses((prev) => ({
            ...prev,
            [m.id]: { ...initialStatus, cached: false, loaded: false },
          }));
        }
      });

      // If a model is already selected in localStorage, pre-select it.
      const saved = getSelectedModel();
      if (saved && LOCAL_AI_MODELS.some((m) => m.id === saved)) {
        setSelectedModelState(saved);
      }
    }
  }, []);

  const updateStatus = useCallback((modelId: string, patch: Partial<ModelStatus>) => {
    setStatuses((prev) => ({
      ...prev,
      [modelId]: { ...(prev[modelId] || initialStatus), ...patch },
    }));
  }, []);

  // ─── Download (and load) a model ───
  async function handleDownload(m: LocalAIModel) {
    updateStatus(m.id, { downloading: true, errorMsg: null, progress: null });
    try {
      await loadModel(m.id, (p) => {
        updateStatus(m.id, { progress: p });
      });
      updateStatus(m.id, {
        downloading: false,
        loaded: true,
        cached: true,
        progress: null,
      });
      setSelectedModelState(m.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      updateStatus(m.id, { downloading: false, errorMsg: msg, progress: null });
    }
  }

  // ─── Uninstall (unload + clear localStorage) ───
  async function handleUninstall(m: LocalAIModel) {
    try {
      await unloadModel();
    } catch (_) { /* ignore */ }
    if (getSelectedModel() === m.id) clearSelectedModel();
    updateStatus(m.id, { loaded: false, cached: false });
    if (selectedModel === m.id) setSelectedModelState(null);
    setTestResponse(null);
    setTestError(null);
  }

  // ─── Test the local model ───
  async function handleTest(m: LocalAIModel) {
    setTesting(true);
    setTestResponse(null);
    setTestError(null);
    try {
      // Make sure the model is loaded before testing.
      const st = statuses[m.id];
      if (!st?.loaded) {
        await loadModel(m.id, (p) => updateStatus(m.id, { progress: p, downloading: true }));
        updateStatus(m.id, { downloading: false, loaded: true, cached: true, progress: null });
      }
      const r = await localChat("Oi! Sou a Meggy 🐩. Apresente-se em 2 frases curtas.", {
        maxTokens: 256,
        temperature: 0.7,
      });
      if (r.ok && r.text) {
        setTestResponse(r.text);
      } else {
        setTestError(r.error || "Resposta vazia do modelo.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestError(msg);
    }
    setTesting(false);
  }

  // ─── Choose local ───
  function handleUseLocal() {
    if (!selectedModel) return;
    setSelectedModel(selectedModel);
    onChooseLocal(selectedModel);
  }

  // ─── Render helpers ───
  function fmtProgress(p: LoadProgress | null): string {
    if (!p) return "";
    const pct = Math.round((p.progress || 0) * 100);
    return `${pct}%`;
  }

  function fmtSize(mb: number): string {
    if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
    return `${mb} MB`;
  }

  // ─── Render ───
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
        // Click on backdrop closes (treat as "Ver depois")
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "18px",
          width: "100%",
          maxWidth: "640px",
          maxHeight: "90vh",
          overflow: "auto",
          padding: "28px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div style={{ fontSize: "40px", marginBottom: "8px" }}>🚀</div>
          <h2 style={{ color: "var(--pink)", fontSize: "22px", fontWeight: 700, marginBottom: "8px" }}>
            IA Local — Respostas Instantâneas
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: 1.6, maxWidth: "480px", margin: "0 auto" }}>
            Baixe um modelo de IA uma vez e use para sempre. Sem internet, sem login, respostas em segundos direto no seu computador.
          </p>
        </div>

        {/* WebGPU not available */}
        {webgpuOk === false && (
          <div style={{
            padding: "20px",
            background: "rgba(255,139,159,0.08)",
            border: "1px solid rgba(255,139,159,0.3)",
            borderRadius: "10px",
            textAlign: "center",
            marginBottom: "20px",
          }}>
            <div style={{ fontSize: "32px", marginBottom: "10px" }}>⚠️</div>
            <div style={{ color: "var(--pink)", fontWeight: 600, marginBottom: "6px" }}>
              Seu computador não suporta WebGPU.
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>
              Use a IA da nuvem (já configurada).
            </div>
          </div>
        )}

        {/* WebGPU OK — show model options */}
        {webgpuOk === true && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
            {LOCAL_AI_MODELS.map((m) => {
              const st = statuses[m.id] || initialStatus;
              const isSelected = selectedModel === m.id;
              return (
                <div
                  key={m.id}
                  style={{
                    background: isSelected ? "rgba(255,139,159,0.08)" : "rgba(255,255,255,0.03)",
                    border: isSelected ? "1px solid rgba(255,139,159,0.4)" : "1px solid var(--border)",
                    borderRadius: "12px",
                    padding: "14px",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "8px" }}>
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
                          {fmtSize(m.sizeMb)}
                        </span>
                        {st.cached && (
                          <span style={{
                            padding: "2px 8px",
                            background: "rgba(93,222,218,0.12)",
                            color: "var(--teal)",
                            borderRadius: "999px",
                            fontSize: "11px",
                            fontWeight: 600,
                          }}>
                            ✓ Instalado
                          </span>
                        )}
                        {st.loaded && (
                          <span style={{
                            padding: "2px 8px",
                            background: "rgba(255,139,159,0.12)",
                            color: "var(--pink)",
                            borderRadius: "999px",
                            fontSize: "11px",
                            fontWeight: 600,
                          }}>
                            ⚡ Carregado
                          </span>
                        )}
                      </div>
                      <div style={{ color: "var(--text-muted)", fontSize: "12px", lineHeight: 1.5 }}>
                        {m.description}
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {st.downloading && st.progress && (
                    <div style={{ marginBottom: "8px" }}>
                      <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        marginBottom: "4px",
                      }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                          {st.progress.text || "Baixando…"}
                        </span>
                        <span>{fmtProgress(st.progress)}</span>
                      </div>
                      <div style={{
                        height: "6px",
                        background: "rgba(255,255,255,0.08)",
                        borderRadius: "999px",
                        overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%",
                          width: `${(st.progress.progress || 0) * 100}%`,
                          background: "linear-gradient(90deg, var(--pink), var(--purple))",
                          borderRadius: "999px",
                          transition: "width 0.2s",
                        }} />
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {st.errorMsg && (
                    <div style={{
                      padding: "8px 10px",
                      background: "rgba(255,139,159,0.08)",
                      border: "1px solid rgba(255,139,159,0.2)",
                      borderRadius: "6px",
                      marginBottom: "8px",
                      color: "var(--pink)",
                      fontSize: "11px",
                    }}>
                      ⚠️ {st.errorMsg}
                    </div>
                  )}

                  {/* Buttons */}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {!st.cached && !st.downloading && (
                      <button
                        onClick={() => handleDownload(m)}
                        disabled={st.downloading}
                        style={{
                          ...popupBtn,
                          background: "linear-gradient(135deg, var(--pink), var(--purple))",
                          color: "#fff",
                          border: "none",
                          opacity: st.downloading ? 0.5 : 1,
                        }}
                      >
                        ⬇ Baixar ({fmtSize(m.sizeMb)})
                      </button>
                    )}
                    {st.cached && !st.loaded && !st.downloading && (
                      <button
                        onClick={() => handleDownload(m)}
                        style={{ ...popupBtn }}
                      >
                        ⚡ Carregar
                      </button>
                    )}
                    {st.loaded && (
                      <button
                        onClick={() => handleTest(m)}
                        disabled={testing}
                        style={{
                          ...popupBtn,
                          background: "rgba(93,222,218,0.12)",
                          borderColor: "rgba(93,222,218,0.3)",
                          color: "var(--teal)",
                        }}
                      >
                        {testing ? "Testando…" : "🧪 Testar IA Local"}
                      </button>
                    )}
                    {st.cached && (
                      <button
                        onClick={() => handleUninstall(m)}
                        style={{
                          ...popupBtn,
                          background: "transparent",
                          borderColor: "rgba(255,139,159,0.3)",
                          color: "var(--pink)",
                          fontSize: "12px",
                          padding: "6px 10px",
                        }}
                      >
                        🗑 Remover
                      </button>
                    )}
                    {st.loaded && (
                      <button
                        onClick={() => setSelectedModelState(m.id)}
                        style={{
                          ...popupBtn,
                          background: isSelected ? "var(--pink)" : "rgba(255,139,159,0.12)",
                          color: isSelected ? "#fff" : "var(--pink)",
                          borderColor: "var(--pink)",
                        }}
                      >
                        {isSelected ? "✓ Selecionado" : "Selecionar"}
                      </button>
                    )}
                  </div>

                  {/* Test response */}
                  {testResponse && selectedModel === m.id && (
                    <div style={{
                      marginTop: "10px",
                      padding: "10px",
                      background: "rgba(93,222,218,0.06)",
                      border: "1px solid rgba(93,222,218,0.2)",
                      borderRadius: "8px",
                      color: "var(--text)",
                      fontSize: "13px",
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                    }}>
                      <div style={{ color: "var(--teal)", fontSize: "11px", marginBottom: "4px", fontWeight: 600 }}>
                        🐩 Resposta da IA Local:
                      </div>
                      {testResponse}
                    </div>
                  )}
                  {testError && selectedModel === m.id && (
                    <div style={{
                      marginTop: "10px",
                      padding: "10px",
                      background: "rgba(255,139,159,0.08)",
                      border: "1px solid rgba(255,139,159,0.2)",
                      borderRadius: "8px",
                      color: "var(--pink)",
                      fontSize: "12px",
                    }}>
                      ⚠️ {testError}
                    </div>
                  )}
                </div>
              );
            })}
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
            onClick={handleUseLocal}
            disabled={!selectedModel}
            style={{
              ...popupBtn,
              background: selectedModel
                ? "linear-gradient(135deg, var(--pink), var(--purple))"
                : "var(--surface-2)",
              color: selectedModel ? "#fff" : "var(--text-muted)",
              border: "none",
              opacity: selectedModel ? 1 : 0.6,
              padding: "10px 18px",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            ⚡ Usar IA Local
          </button>
          <button
            onClick={onChooseCloud}
            style={{
              ...popupBtn,
              padding: "10px 18px",
              fontSize: "14px",
            }}
          >
            ☁️ Usar IA da Nuvem
          </button>
          <button
            onClick={onClose}
            style={{
              ...popupBtn,
              background: "transparent",
              borderColor: "var(--border)",
              color: "var(--text-muted)",
              padding: "10px 18px",
              fontSize: "14px",
            }}
          >
            Ver depois
          </button>
        </div>

        <div style={{
          marginTop: "14px",
          fontSize: "11px",
          color: "var(--text-muted)",
          textAlign: "center",
          lineHeight: 1.5,
        }}>
          💡 A IA Local é mais rápida e funciona offline, mas a IA da Nuvem tem modelos melhores.
          Você pode alternar quando quiser nas configurações.
        </div>
      </div>
    </div>
  );
}

const popupBtn: React.CSSProperties = {
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
