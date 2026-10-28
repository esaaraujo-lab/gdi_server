// ═══════════════════════════════════════════════════════════════
// MeggyChat.tsx — Chat drawer da Meggy AI (v1.9.3)
// Chat-only (gerar material só funciona no player via ISA tabs).
// Usa a IA configurada (cloud/WebLLM/llama.cpp) para responder.
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect } from "react";
import { aiGenerate } from "../lib/api";
import { localChat, checkWebGPU } from "../lib/local-ai";
import { llamaChat } from "../lib/llama-bridge";

interface MeggyChatProps {
  onClose: () => void;
  aiMode: "local" | "cloud" | "llama";
  localAiReady: boolean;
}

interface ChatMsg {
  role: "user" | "bot";
  text: string;
}

const SYSTEM_PROMPT =
  "Voce e a Meggy - uma poodle tutora de estudos brasileira. Responda em portugues, clara e objetiva. Use Markdown quando util (titulos, listas, negrito).";

// Simple markdown to HTML (reuses mdToHtml from Home, but standalone)
function mdToHtml(md: string): string {
  if (!md) return "";
  let h = md
    .replace(/&(?!#?\w+;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  h = h.replace(/```([\s\S]*?)```/g, (_, c) =>
    `<pre style="background:rgba(255,255,255,0.05);padding:12px;border-radius:8px;overflow:auto;font-size:13px;margin:10px 0;">${c.trim()}</pre>`);
  h = h.replace(/^#### (.+)$/gm, '<h4 style="margin:14px 0 6px;font-size:15px;color:#e6edf3;">$1</h4>');
  h = h.replace(/^### (.+)$/gm, '<h3 style="margin:16px 0 8px;font-size:16px;color:#e6edf3;">$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2 style="margin:18px 0 10px;font-size:18px;color:#ff8b9f;">$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1 style="margin:20px 0 12px;font-size:22px;color:#ff8b9f;">$1</h1>');
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;font-size:13px;">$1</code>');
  h = h.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  h = h.replace(/^(?:- |\* )(.+)$/gm, '<li style="margin:4px 0 4px 18px;list-style:disc;">$1</li>');
  h = h.replace(/^\d+\. (.+)$/gm, '<li style="margin:4px 0 4px 22px;list-style:decimal;">$1</li>');
  h = h.replace(/\n\n+/g, '</p><p style="margin:8px 0;">');
  h = h.replace(/\n/g, "<br>");
  return `<p style="margin:8px 0;">${h}</p>`;
}

// Strip AI chain-of-thought
function stripAiReasoning(text: string): string {
  if (!text) return "";
  let cleaned = text;
  cleaned = cleaned.replace(/§§[\s\S]*?§§/g, "");
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, "");
  cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, "");
  const mdHeaderMatch = cleaned.match(/^#{1,6}\s/m);
  if (mdHeaderMatch && (cleaned.startsWith("Okay") || cleaned.startsWith("Let's") || cleaned.startsWith("First"))) {
    const idx = cleaned.indexOf(mdHeaderMatch[0]);
    if (idx > 0) cleaned = cleaned.substring(idx);
  }
  if (cleaned.startsWith("Let me") || cleaned.startsWith("First") || cleaned.startsWith("Now")) {
    const sepIdx = cleaned.indexOf("\n---\n");
    if (sepIdx > 0 && sepIdx < cleaned.length / 2) {
      cleaned = cleaned.substring(sepIdx + 5);
    }
  }
  return cleaned.trim();
}

export default function MeggyChat({ onClose, aiMode, localAiReady }: MeggyChatProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "bot",
      text: "Oi! Sou a **Meggy** 🐩 — sua poodle tutora de estudos.\n\nPosso ajudar com:\n- Explicar um tema da aula\n- Tirar duvidas\n- Sugerir um plano de estudos\n\nPara gerar resumos, questoes e flashcards, abra uma aula e use as abas **Resumo Meggy**, **Questoes**, **Pilulas** ou **Flashcards** no player.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: msg }]);
    setLoading(true);

    try {
      let response = "";

      // Try llama.cpp first if enabled
      if (aiMode === "llama") {
        const r = await llamaChat(msg, SYSTEM_PROMPT);
        if (r.ok && r.text) {
          response = r.text;
        } else {
          // Fallback to cloud
          response = await aiGenerate(msg, "resumo");
        }
      } else if (aiMode === "local" && localAiReady && checkWebGPU()) {
        try {
          const r = await localChat(msg, { maxTokens: 2048, temperature: 0.7, systemPrompt: SYSTEM_PROMPT });
          if (r.ok && r.text && r.text.length > 20) {
            response = r.text;
          } else {
            response = await aiGenerate(msg, "resumo");
          }
        } catch (_) {
          response = await aiGenerate(msg, "resumo");
        }
      } else {
        // Cloud
        response = await aiGenerate(msg, "resumo");
      }

      // Strip chain-of-thought
      response = stripAiReasoning(response);

      setMessages(prev => [...prev, { role: "bot", text: response }]);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setMessages(prev => [...prev, { role: "bot", text: "Erro: " + errMsg }]);
    }
    setLoading(false);
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "420px",
        height: "100vh",
        background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
        zIndex: 10001,
        display: "flex",
        flexDirection: "column",
        boxShadow: "-10px 0 40px rgba(0,0,0,0.4)",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 18px",
        borderBottom: "1px solid var(--border)",
        background: "linear-gradient(135deg, rgba(255,139,159,0.08), rgba(192,38,211,0.05))",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "24px" }}>🐩</span>
          <div>
            <div style={{ color: "var(--pink)", fontWeight: 700, fontSize: "15px" }}>Meggy AI</div>
            <div style={{ color: "var(--text-muted)", fontSize: "11px" }}>
              {aiMode === "local" ? "WebLLM" : aiMode === "llama" ? "llama.cpp" : "Nuvem"}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: "20px",
            padding: "4px 8px",
          }}
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              padding: "10px 14px",
              borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
              background: m.role === "user"
                ? "linear-gradient(135deg, #ff8b9f, #c026d3)"
                : "rgba(255,255,255,0.05)",
              color: m.role === "user" ? "#fff" : "var(--text)",
              fontSize: "13px",
              lineHeight: 1.5,
            }}
            dangerouslySetInnerHTML={{ __html: mdToHtml(m.text) }}
          />
        ))}
        {loading && (
          <div style={{
            alignSelf: "flex-start",
            padding: "10px 14px",
            borderRadius: "14px 14px 14px 4px",
            background: "rgba(255,255,255,0.05)",
            color: "var(--text-muted)",
            fontSize: "13px",
          }}>
            🐾 Pensando...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: "12px 16px",
        borderTop: "1px solid var(--border)",
        display: "flex",
        gap: "8px",
        alignItems: "flex-end",
      }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Pergunte algo a Meggy..."
          rows={2}
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "10px 12px",
            color: "var(--text)",
            fontFamily: "inherit",
            fontSize: "13px",
            resize: "none",
            outline: "none",
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            background: loading || !input.trim() ? "var(--surface-2)" : "linear-gradient(135deg, #ff8b9f, #c026d3)",
            color: loading || !input.trim() ? "var(--text-muted)" : "#fff",
            border: "none",
            borderRadius: "10px",
            padding: "10px 14px",
            cursor: loading || !input.trim() ? "default" : "pointer",
            fontSize: "16px",
            fontWeight: 600,
          }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
