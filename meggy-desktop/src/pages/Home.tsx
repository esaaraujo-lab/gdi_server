// ═══════════════════════════════════════════════════════════════
// Home Page — Grid de drives + rail de cursos
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Drive { index: number; name: string; }
interface FileItem { name: string; mime_type: string; id: string; link: string | null; size: number; }

export default function Home({ onLogout }: { onLogout: () => void }) {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"drives" | "browse">("drives");

  useEffect(() => {
    loadDrives();
  }, []);

  async function loadDrives() {
    const result = await invoke<Drive[]>("get_drives");
    setDrives(result);
  }

  async function openDrive(drive: Drive) {
    setLoading(true);
    setView("browse");
    setCurrentPath(`/${drive.index}:/`);
    try {
      const result = await invoke<FileItem[]>("list_folder", { driveIndex: drive.index });
      setFiles(result);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  function backToDrives() {
    setView("drives");
    setFiles([]);
    setCurrentPath("");
  }

  async function logout() {
    await invoke("logout");
    onLogout();
  }

  if (view === "browse") {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <Header onBack={backToDrives} onLogout={logout} path={currentPath} />
        <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>Carregando...</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "12px" }}>
              {files.map((file) => (
                <FileCard key={file.id} file={file} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <Header onBack={null} onLogout={logout} path="" />
      <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>
        <h2 style={{ color: "var(--text)", fontSize: "20px", marginBottom: "20px" }}>☁️ Drives disponíveis</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
          {drives.map((drive) => (
            <DriveCard key={drive.index} drive={drive} onClick={() => openDrive(drive)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Header({ onBack, onLogout, path }: { onBack: (() => void) | null; onLogout: () => void; path: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 20px", background: "var(--surface)", borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        {onBack && (
          <button onClick={onBack} style={btnStyle}>← Voltar</button>
        )}
        <span style={{ color: "var(--pink)", fontWeight: 700, fontSize: "18px" }}>🐩 Meggy</span>
        {path && <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>{path}</span>}
      </div>
      <button onClick={onLogout} style={btnStyle}>Sair</button>
    </div>
  );
}

function DriveCard({ drive, onClick }: { drive: Drive; onClick: () => void }) {
  const icons = ["⚖️", "📚", "🎯", "🎨", "🎼", "🏆", "💪", "🧘", "⚕️", "⚖️", "🎓", "🛡️"];
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--surface)", borderRadius: "14px", padding: "24px",
        cursor: "pointer", transition: "all 0.2s", border: "2px solid transparent",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--pink)"; e.currentTarget.style.background = "var(--surface-2)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "var(--surface)"; }}
    >
      <div style={{ fontSize: "32px", marginBottom: "8px" }}>{icons[drive.index] || "📁"}</div>
      <div style={{ color: "var(--text)", fontWeight: 600, fontSize: "15px" }}>{drive.name}</div>
    </div>
  );
}

function FileCard({ file }: { file: FileItem }) {
  const isFolder = file.mime_type === "application/vnd.google-apps.folder";
  const isVideo = file.mime_type.startsWith("video/") || file.name.endsWith(".mp4");
  const isAudio = file.mime_type.startsWith("audio/") || file.name.endsWith(".mp3") || file.name.endsWith(".m4a");

  const icon = isFolder ? "📁" : isVideo ? "🎬" : isAudio ? "🎵" : "📄";
  const sizeStr = file.size > 0 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "";

  return (
    <div style={{
      background: "var(--surface)", borderRadius: "14px", padding: "14px",
      display: "flex", alignItems: "center", gap: "12px",
      cursor: "pointer", transition: "all 0.2s", border: "2px solid transparent",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--pink)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
    >
      <div style={{
        width: "48px", height: "48px", borderRadius: "10px",
        background: "linear-gradient(135deg, rgba(255,139,159,0.15), rgba(192,38,211,0.15))",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px",
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "var(--text)", fontWeight: 600, fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
        {sizeStr && <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>{sizeStr}</div>}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "8px 16px", background: "var(--surface-2)", color: "var(--text)",
  border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer", fontSize: "14px",
};
