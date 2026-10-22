// ═══════════════════════════════════════════════════════════════
// Home Page — Grid de drives + navegação de pastas + player de vídeo
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Drive { index: number; name: string; }
interface FileItem { name: string; mime_type: string; id: string; link: string | null; size: number; }

const BASE_URL = "https://educa.eu.org";

export default function Home({ onLogout }: { onLogout: () => void }) {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [currentDrive, setCurrentDrive] = useState<Drive | null>(null);
  const [currentPath, setCurrentPath] = useState<string>("");      // full path e.g. "/0:/CURSO X/"
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"drives" | "browse">("drives");
  const [playingFile, setPlayingFile] = useState<FileItem | null>(null);

  useEffect(() => {
    loadDrives();
  }, []);

  async function loadDrives() {
    try {
      const result = await invoke<Drive[]>("get_drives");
      setDrives(result);
    } catch (e) {
      console.error("loadDrives", e);
      setError(String(e));
    }
  }

  const loadFolder = useCallback(async (drive: Drive, path: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<FileItem[]>("list_folder", {
        driveIndex: drive.index,
        path: path || null,
      });
      setFiles(result);
      if (result.length === 0) setError("Pasta vazia.");
    } catch (e) {
      console.error("loadFolder", e);
      setError(String(e));
      setFiles([]);
    }
    setLoading(false);
  }, []);

  async function openDrive(drive: Drive) {
    setCurrentDrive(drive);
    const rootPath = `/${drive.index}:/`;
    setCurrentPath(rootPath);
    setView("browse");
    await loadFolder(drive, rootPath);
  }

  async function openFolder(file: FileItem) {
    if (!currentDrive) return;
    // Build the new path: currentPath + folderName + "/"
    const newPath = currentPath.endsWith("/")
      ? `${currentPath}${file.name}/`
      : `${currentPath}/${file.name}/`;
    setCurrentPath(newPath);
    await loadFolder(currentDrive, newPath);
  }

  function navigateToBreadcrumb(index: number) {
    if (!currentDrive) return;
    // Split path into segments. e.g. "/0:/CURSO X/SUB/" → ["0:", "CURSO X", "SUB"]
    const parts = currentPath.split("/").filter(Boolean); // ["0:", "CURSO X", "SUB"]
    if (index < 0 || index >= parts.length) return;
    const newPath = "/" + parts.slice(0, index + 1).join("/") + "/";
    setCurrentPath(newPath);
    loadFolder(currentDrive, newPath);
  }

  function backToDrives() {
    setView("drives");
    setFiles([]);
    setCurrentPath("");
    setCurrentDrive(null);
    setError(null);
  }

  async function logout() {
    await invoke("logout");
    onLogout();
  }

  // ─── Browse view (folder listing) ───
  if (view === "browse") {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <Header
          onBack={backToDrives}
          onLogout={logout}
          breadcrumb={
            <Breadcrumb
              drive={currentDrive}
              path={currentPath}
              onCrumb={navigateToBreadcrumb}
              onRoot={backToDrives}
            />
          }
        />
        <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>
          {error && (
            <div style={{ textAlign: "center", padding: "20px", color: "var(--pink)", fontSize: "14px" }}>
              ⚠️ {error}
            </div>
          )}
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>Carregando...</div>
          ) : files.length === 0 && !error ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>Pasta vazia.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "12px" }}>
              {files.map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  onClick={() => {
                    const isFolder = file.mime_type === "application/vnd.google-apps.folder";
                    const isVideo = file.mime_type.startsWith("video/") || file.name.endsWith(".mp4");
                    const isAudio = file.mime_type.startsWith("audio/") || file.name.endsWith(".mp3") || file.name.endsWith(".m4a");
                    if (isFolder) openFolder(file);
                    else if (isVideo || isAudio) setPlayingFile(file);
                  }}
                />
              ))}
            </div>
          )}
        </div>
        {playingFile && <VideoPlayer file={playingFile} onClose={() => setPlayingFile(null)} />}
      </div>
    );
  }

  // ─── Drives view (root) ───
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <Header onBack={null} onLogout={logout} breadcrumb={null} />
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

// ─── Breadcrumb ───
function Breadcrumb({
  drive, path, onCrumb, onRoot,
}: {
  drive: Drive | null;
  path: string;
  onCrumb: (index: number) => void;
  onRoot: () => void;
}) {
  if (!drive) return null;
  // "/0:/CURSO X/SUB/" → ["0:", "CURSO X", "SUB"]
  const parts = path.split("/").filter(Boolean);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", minWidth: 0 }}>
      <button
        onClick={onRoot}
        style={{ ...btnStyle, padding: "4px 8px", fontSize: "12px" }}
        title="Voltar para drives"
      >☁️ Drives</button>
      {parts.map((part, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>/</span>
          <button
            onClick={() => onCrumb(i)}
            style={{
              ...btnStyle,
              padding: "4px 8px",
              fontSize: "12px",
              maxWidth: "160px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={part}
          >
            {i === 0 ? `📁 ${drive.name}` : part}
          </button>
        </span>
      ))}
    </div>
  );
}

// ─── Header ───
function Header({
  onBack, onLogout, breadcrumb,
}: {
  onBack: (() => void) | null;
  onLogout: () => void;
  breadcrumb: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 20px", background: "var(--surface)", borderBottom: "1px solid var(--border)",
      gap: "12px", flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1 }}>
        {onBack && (
          <button onClick={onBack} style={{ ...btnStyle, flexShrink: 0 }}>← Voltar</button>
        )}
        <span style={{ color: "var(--pink)", fontWeight: 700, fontSize: "18px", flexShrink: 0 }}>🐩 Meggy</span>
        {breadcrumb}
      </div>
      <button onClick={onLogout} style={{ ...btnStyle, flexShrink: 0 }}>Sair</button>
    </div>
  );
}

// ─── Drive card ───
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

// ─── File card (folder / video / audio / file) ───
function FileCard({ file, onClick }: { file: FileItem; onClick: () => void }) {
  const isFolder = file.mime_type === "application/vnd.google-apps.folder";
  const isVideo = file.mime_type.startsWith("video/") || file.name.endsWith(".mp4");
  const isAudio = file.mime_type.startsWith("audio/") || file.name.endsWith(".mp3") || file.name.endsWith(".m4a");

  const icon = isFolder ? "📁" : isVideo ? "🎬" : isAudio ? "🎵" : "📄";
  const sizeStr = file.size > 0 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "";

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--surface)", borderRadius: "14px", padding: "14px",
        display: "flex", alignItems: "center", gap: "12px",
        cursor: "pointer", transition: "all 0.2s", border: "2px solid transparent",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--pink)"; e.currentTarget.style.background = "var(--surface-2)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "var(--surface)"; }}
    >
      <div style={{
        width: "48px", height: "48px", borderRadius: "10px", flexShrink: 0,
        background: "linear-gradient(135deg, rgba(255,139,159,0.15), rgba(192,38,211,0.15))",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px",
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "var(--text)", fontWeight: 600, fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
        {sizeStr && <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>{sizeStr}</div>}
        {isFolder && <div style={{ color: "var(--cyan)", fontSize: "11px", marginTop: "2px" }}>Abrir pasta →</div>}
        {(isVideo || isAudio) && <div style={{ color: "var(--cyan)", fontSize: "11px", marginTop: "2px" }}>▶ Reproduzir</div>}
      </div>
    </div>
  );
}

// ─── Video / Audio player modal ───
function VideoPlayer({ file, onClose }: { file: FileItem; onClose: () => void }) {
  // The link from worker.js generateLink() is a relative URL like
  // "/download.aspx?file=...&expiry=...&mac=..." — it's self-contained
  // (encrypted file id + expiry + MAC), so it does NOT need the session cookie.
  const src = file.link ? `${BASE_URL}${file.link}` : "";
  const isAudio = file.mime_type.startsWith("audio/") || file.name.endsWith(".mp3") || file.name.endsWith(".m4a");

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.85)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)", borderRadius: "14px", padding: "16px",
          maxWidth: "90vw", maxHeight: "90vh", display: "flex", flexDirection: "column", gap: "12px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
          <div style={{ color: "var(--text)", fontWeight: 600, fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60vw" }}>
            {isAudio ? "🎵" : "🎬"} {file.name}
          </div>
          <button onClick={onClose} style={btnStyle}>✕ Fechar</button>
        </div>
        {src ? (
          isAudio ? (
            <audio src={src} controls autoPlay style={{ width: "100%", minWidth: "400px" }} />
          ) : (
            <video
              src={src}
              controls
              autoPlay
              style={{ maxWidth: "85vw", maxHeight: "75vh", borderRadius: "8px", background: "#000" }}
            />
          )
        ) : (
          <div style={{ color: "var(--text-muted)", padding: "40px", textAlign: "center" }}>
            Link de reprodução indisponível para este arquivo.
          </div>
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "8px 16px", background: "var(--surface-2)", color: "var(--text)",
  border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer", fontSize: "14px",
};
