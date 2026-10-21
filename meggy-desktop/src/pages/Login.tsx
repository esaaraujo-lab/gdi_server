// ═══════════════════════════════════════════════════════════════
// Login Page
// ═══════════════════════════════════════════════════════════════

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await invoke<{ ok: boolean; error: string | null }>("login", {
        username,
        password,
      });
      if (result.ok) {
        onLogin();
      } else {
        setError(result.error || "Erro ao fazer login");
      }
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100vh", gap: "20px"
    }}>
      <div style={{ fontSize: "64px" }}>🐩</div>
      <h1 style={{ color: "var(--pink)", fontSize: "32px", fontWeight: 700 }}>Meggy</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Plataforma de Estudos</p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px", width: "320px" }}>
        <input
          type="text"
          placeholder="Usuário"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={inputStyle}
          autoFocus
        />
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
        {error && <p style={{ color: "#ff6b6b", fontSize: "13px", textAlign: "center" }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "12px",
            background: "linear-gradient(135deg, #ff8b9f, #c026d3)",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "16px",
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "12px 16px",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  color: "var(--text)",
  fontSize: "14px",
  outline: "none",
};
