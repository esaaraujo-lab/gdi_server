// ═══════════════════════════════════════════════════════════════
// Home Page — Grid de drives + navegação de pastas + player inline (v1.5.0)
// Replica do _playVideoInline da web (layout Alfacon 2 colunas)
// + IA Local (WebLLM via WebGPU) com fallback para nuvem
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { aiCacheGet, aiCacheSave, aiGenerate, fetchText, extractPdfText, downloadToTemp, saveUserState, getUserState } from "../lib/api";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  hasLocalAIConfigured,
  isPopupDismissed,
  dismissPopup,
  setSelectedModel as localAiSetSelectedModel,
  ensureModelLoaded,
  localChat,
  checkWebGPU,
} from "../lib/local-ai";
import AIInstallPopup from "../components/AIInstallPopup";
import LlamaManager from "../components/LlamaManager";
import { llamaChat as llamaLocalChat } from "../lib/llama-bridge";

interface Drive { index: number; name: string; }
interface FileItem { name: string; mime_type: string; id: string; link: string | null; size: number; }

const BASE_URL = "https://educa.eu.org";

// ─── Markdown → HTML (v1.6.9: fixed HTML entity bug — don't double-escape &entities;) ───
function mdToHtml(md: string): string {
  if (!md) return "";
  // ★ v1.6.9: Escape < and > but DON'T escape & that's already part of an HTML entity
  // The old code did .replace(/&/g, "&amp;") which turned &ccedil; into &amp;ccedil; (rendered as literal text)
  let h = md
    .replace(/&(?!#?\w+;)/g, "&amp;")  // only escape & NOT followed by entity (word or #digits + ;)
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (```...```)
  h = h.replace(/```([\s\S]*?)```/g, (_, c) =>
    `<pre style="background:rgba(255,255,255,0.05);padding:12px;border-radius:8px;overflow:auto;font-size:13px;margin:10px 0;">${c.trim()}</pre>`);

  // Headers
  h = h.replace(/^#### (.+)$/gm, '<h4 style="margin:14px 0 6px;font-size:15px;color:#e6edf3;">$1</h4>');
  h = h.replace(/^### (.+)$/gm, '<h3 style="margin:16px 0 8px;font-size:16px;color:#e6edf3;">$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2 style="margin:18px 0 10px;font-size:18px;color:#ff8b9f;">$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1 style="margin:20px 0 12px;font-size:22px;color:#ff8b9f;">$1</h1>');

  // Bold + italic + inline code
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;font-size:13px;">$1</code>');
  h = h.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Lists
  h = h.replace(/^(?:- |\* )(.+)$/gm, '<li style="margin:4px 0 4px 18px;list-style:disc;">$1</li>');
  h = h.replace(/^\d+\. (.+)$/gm, '<li style="margin:4px 0 4px 22px;list-style:decimal;">$1</li>');

  // Paragraphs / line breaks
  h = h.replace(/\n\n+/g, '</p><p style="margin:8px 0;">');
  h = h.replace(/\n/g, "<br>");
  return `<p style="margin:8px 0;">${h}</p>`;
}

// ─── Parse questions JSON (robust) ───
interface QuizQuestion {
  type: "mc" | "tf";
  statement: string;
  options: string[];
  correct: number;
  explanation: string;
  legalText: string;
  fundamentacao: string;
}

function parseQuestions(resp: string): QuizQuestion[] {
  if (!resp) return [];
  let arr: unknown = null;
  try { arr = JSON.parse(resp); } catch (_) {
    const m = resp.match(/\[[\s\S]*\]/);
    if (m) { try { arr = JSON.parse(m[0]); } catch (__) { arr = null; } }
  }
  if (!Array.isArray(arr)) return [];
  return (arr as Record<string, unknown>[])
    .map((q): QuizQuestion | null => {
      const options = Array.isArray(q.options) ? (q.options as unknown[]).map(String) : null;
      const correctNum = Number(q.correct ?? 0);
      const legalText = String(q.legalText ?? q.fundamentacao ?? "");
      const fundamentacao = String(q.fundamentacao ?? "");
      const explanation = String(q.explanation ?? "");
      const statement = String(q.statement ?? "");
      if (q.type === "tf" || (!options && q.correct !== undefined)) {
        return {
          type: "tf",
          statement,
          options: ["Certo", "Errado"],
          correct: Math.max(0, Math.min(1, isNaN(correctNum) ? 0 : correctNum)),
          explanation,
          legalText,
          fundamentacao,
        };
      }
      if (options) {
        return {
          type: "mc",
          statement,
          options,
          correct: Math.max(0, Math.min(options.length - 1, isNaN(correctNum) ? 0 : correctNum)),
          explanation,
          legalText,
          fundamentacao,
        };
      }
      return null;
    })
    .filter((q): q is QuizQuestion => q !== null);
}

// ─── Format seconds → m:ss or h:mm:ss ───
function fmtTime(s: number): string {
  if (!isFinite(s)) return "00:00";
  s = Math.floor(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

// ─── Semantic version comparison (returns -1 / 0 / 1) ───
function compareVersions(a: string, b: string): number {
  const pa = (a || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = (b || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

// ─── Strip AI chain-of-thought / reasoning from response (v1.9.1) ───
// Some AI models (DeepSeek-R1, Qwen with thinking, etc.) return reasoning text
// wrapped in §§...§§ or <think>...</think> or just prepend it before the actual answer.
// This function removes those blocks and returns only the final answer.
function stripAiReasoning(text: string): string {
  if (!text) return "";
  let cleaned = text;
  // Remove §§...§§ blocks (DeepSeek-R1 style)
  cleaned = cleaned.replace(/§§[\s\S]*?§§/g, "");
  // Remove <think>...</think> blocks
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, "");
  // Remove <reasoning>...</reasoning> blocks
  cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, "");
  // If text starts with "Okay," or "Let's" (common CoT prefixes), find the first markdown header
  // and trim everything before it
  const mdHeaderMatch = cleaned.match(/^#{1,6}\s/m);
  if (mdHeaderMatch && (cleaned.startsWith("Okay") || cleaned.startsWith("Let's") || cleaned.startsWith("First"))) {
    const idx = cleaned.indexOf(mdHeaderMatch[0]);
    if (idx > 0) cleaned = cleaned.substring(idx);
  }
  // If it starts with "Let me" or similar reasoning, and has a "---" separator, trim before it
  if (cleaned.startsWith("Let me") || cleaned.startsWith("First") || cleaned.startsWith("Now")) {
    const sepIdx = cleaned.indexOf("\n---\n");
    if (sepIdx > 0 && sepIdx < cleaned.length / 2) {
      cleaned = cleaned.substring(sepIdx + 5);
    }
  }
  return cleaned.trim();
}

// ═══════════════════════════════════════════════════════════════
// Main Home component
// ═══════════════════════════════════════════════════════════════
export default function Home({ onLogout }: { onLogout: () => void }) {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [currentDrive, setCurrentDrive] = useState<Drive | null>(null);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"home" | "drives" | "browse" | "player">("home");
  const [playlist, setPlaylist] = useState<FileItem[]>([]);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [userState, setUserState] = useState<Record<string, unknown>>({});
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);

  // ─── v1.5.0 — Local AI state ───
  // ★ v1.8.0: aiMode now has 3 options: "cloud" (worker), "local" (WebLLM), "llama" (llama.cpp)
  const [aiMode, setAiMode] = useState<"local" | "cloud" | "llama">(() => {
    return hasLocalAIConfigured() ? "local" : "cloud";
  });
  const [localAiReady, setLocalAiReady] = useState<boolean>(hasLocalAIConfigured());
  const [showAIPopup, setShowAIPopup] = useState<boolean>(false);
  const [showLlamaManager, setShowLlamaManager] = useState<boolean>(false);
  const [llamaReady, setLlamaReady] = useState<boolean>(false);

  // Show the install popup on first launch (if not dismissed).
  useEffect(() => {
    if (!isPopupDismissed() && !hasLocalAIConfigured()) {
      setShowAIPopup(true);
    }
    // Refresh localAiReady whenever popup closes (user may have chosen a model).
  }, []);

  function handleChooseLocal(modelId: string) {
    localAiSetSelectedModel(modelId);
    setLocalAiReady(true);
    setAiMode("local");
    dismissPopup();
    setShowAIPopup(false);
  }

  function handleChooseCloud() {
    // User explicitly chose cloud — keep current selection if any, but switch mode.
    setAiMode("cloud");
    dismissPopup();
    setShowAIPopup(false);
  }

  function handleClosePopup() {
    // "Ver depois" — dismiss without choosing.
    dismissPopup();
    setShowAIPopup(false);
  }

  function handleToggleAI() {
    // ★ v1.8.0: Cycle through 3 modes: cloud → local (WebLLM) → llama (llama.cpp) → cloud
    if (aiMode === "cloud") {
      if (localAiReady) {
        setAiMode("local");
      } else {
        setShowAIPopup(true);
      }
    } else if (aiMode === "local") {
      // Switch to llama if ready, otherwise open LlamaManager
      if (llamaReady) {
        setAiMode("llama");
      } else {
        setShowLlamaManager(true);
      }
    } else {
      // llama → cloud
      setAiMode("cloud");
    }
  }

  function handleManageAI() {
    // ★ v1.8.0: Open the appropriate manager based on current mode
    if (aiMode === "llama") {
      setShowLlamaManager(true);
    } else {
      setShowAIPopup(true);
    }
  }

  function handleChooseLlama(modelLabel: string) {
    setLlamaReady(true);
    setAiMode("llama");
    setShowLlamaManager(false);
    console.log("Llama ready:", modelLabel);
  }

  useEffect(() => { loadDrives(); loadUserState(); checkForUpdates(); }, []);

  async function loadDrives() {
    try {
      const result = await invoke<Drive[]>("get_drives");
      setDrives(result);
    } catch (e) {
      console.error("loadDrives", e);
      setError(String(e));
    }
  }

  // ★ v1.6.0: Load user state (history, resume, watched) for "Continue Assistindo"
  async function loadUserState() {
    try {
      const state = await getUserState();
      setUserState(state as Record<string, unknown>);
    } catch (_) { /* ignore */ }
  }

  // ★ v1.6.3: Check for app updates from GitHub releases (uses dynamic __APP_VERSION__)
  async function checkForUpdates() {
    try {
      const resp = await fetch("https://api.github.com/repos/esaaraujo-lab/gdi_server/releases?per_page=1");
      const releases = await resp.json();
      if (releases && releases[0] && !releases[0].draft && !releases[0].prerelease) {
        const tag = releases[0].tag_name || "";
        const versionMatch = tag.match(/v?([\d.]+)/);
        if (versionMatch) {
          const latestVersion = versionMatch[1];
          const currentVersion: string = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";
          // Semantic comparison: only show update if latest > current
          const cmp = compareVersions(latestVersion, currentVersion);
          if (cmp > 0) {
            setUpdateAvailable(latestVersion);
          }
        }
      }
    } catch (_) { /* ignore */ }
  }

  // ★ v1.6.0: Download and install update
  async function downloadUpdate() {
    if (!updateAvailable) return;
    // Open the releases page in the default browser
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(`https://github.com/esaaraujo-lab/gdi_server/releases/tag/desktop-v${updateAvailable}`);
    } catch (_) {
      window.open(`https://github.com/esaaraujo-lab/gdi_server/releases/tag/desktop-v${updateAvailable}`, "_blank");
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
    const newPath = currentPath.endsWith("/")
      ? `${currentPath}${file.name}/`
      : `${currentPath}/${file.name}/`;
    setCurrentPath(newPath);
    await loadFolder(currentDrive, newPath);
  }

  // ★ v1.5.7: navigateToBreadcrumb now exits player view and navigates
  function navigateToBreadcrumb(index: number) {
    if (!currentDrive) return;
    const parts = currentPath.split("/").filter(Boolean);
    if (index < 0 || index >= parts.length) return;
    const newPath = "/" + parts.slice(0, index + 1).join("/") + "/";
    setCurrentPath(newPath);
    setView("browse"); // Exit player view
    setPlaylist([]);
    loadFolder(currentDrive, newPath);
  }

  function backToDrives() {
    setView("drives");
    setFiles([]);
    setCurrentPath("");
    setCurrentDrive(null);
    setError(null);
  }

  function backToBrowse() {
    setView("browse");
    setPlaylist([]);
    setPlayerIndex(0);
  }

  // ★ v1.6.5: Voltar à tela inicial (Home) de qualquer view
  function backToHome() {
    setView("home");
    setFiles([]);
    setPlaylist([]);
    setPlayerIndex(0);
    setCurrentPath("");
    setCurrentDrive(null);
    setError(null);
    // ★ v1.9.2: Reload userState so "Continue Assistindo" shows fresh history/resume
    loadUserState();
  }

  function openPlayer(file: FileItem) {
    // ★ v1.7.0: Smart playlist — check if current folder has multiple media files.
    // If YES → build playlist from current folder only (no interfolder needed).
    // If NO (only 1 video) → use interfolder to load sibling folders.
    const isMediaFile = (f: FileItem) => {
      const isVid = (f.mime_type || "").includes("video") || f.name.endsWith(".mp4");
      const isAud = (f.mime_type || "").includes("audio") || f.name.endsWith(".mp3") || f.name.endsWith(".m4a");
      const clickedIsVideo = file.mime_type.startsWith("video/") || file.name.endsWith(".mp4");
      const clickedIsAudio = file.mime_type.startsWith("audio/") || file.name.endsWith(".mp3") || file.name.endsWith(".m4a");
      if (clickedIsVideo) return isVid;
      if (clickedIsAudio) return isAud;
      return isVid || isAud;
    };
    const folderMedia = files.filter(f => isMediaFile(f) && !f.name.includes(".part-"));
    
    if (folderMedia.length > 1) {
      // ★ v1.7.0: Multiple videos in current folder — build playlist from this folder only
      // Sort by name for logical order (Aula 01, Aula 02, ...)
      folderMedia.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
      const clickedIdx = folderMedia.findIndex(f => 
        f.id === file.id || f.link === file.link || f.name === file.name
      );
      setPlaylist(folderMedia);
      setPlayerIndex(clickedIdx >= 0 ? clickedIdx : 0);
      playerVideoIdRef.current = folderMedia[clickedIdx >= 0 ? clickedIdx : 0]?.id || file.id;
      setView("player");
    } else {
      // ★ Only 1 video in folder — use interfolder to load sibling folders
      setPlaylist([file]);
      setPlayerIndex(0);
      setView("player");
      loadInterfolderPlaylist(file);
    }
  }

  // ★ v1.5.8: Interfolder — carrega vídeos de pastas irmãs (adjacentes)
  // Filtros: (1) ignora pastas "audiocast", (2) se clicou vídeo → só vídeos, se clicou áudio → só áudios
  // Fix: use a ref to prevent playlist restart — the current video ID is tracked
  // and the PlayerView finds the correct index when the playlist updates
  const playerVideoIdRef = useRef<string>("");
  
  async function loadInterfolderPlaylist(currentFile: FileItem): Promise<void> {
    if (!currentDrive || !currentPath) return;
    playerVideoIdRef.current = currentFile.id; // ★ Track which video should be playing
    try {
      const parts = currentPath.split("/").filter(Boolean);
      if (parts.length < 2) return;
      const parentPath = "/" + parts.slice(0, -1).join("/") + "/";
      const parentFiles = await invoke<FileItem[]>("list_folder", {
        driveIndex: currentDrive.index,
        path: parentPath,
      });
      // ★ Filtro 1: Ignorar pastas "audiocast" (e variações)
      const subFolders = parentFiles.filter(f =>
        f.mime_type === "application/vnd.google-apps.folder" &&
        !f.name.toLowerCase().includes("audiocast") &&
        !f.name.toLowerCase().includes("audio cast") &&
        !f.name.toLowerCase().includes("audio-cast")
      );

      // ★ Filtro 2: Determinar tipo de mídia do arquivo clicado
      const clickedIsAudio = currentFile.mime_type.startsWith("audio/") ||
        currentFile.name.endsWith(".mp3") || currentFile.name.endsWith(".m4a");
      const clickedIsVideo = currentFile.mime_type.startsWith("video/") ||
        currentFile.name.endsWith(".mp4");

      const isMediaFile = (f: FileItem) => {
        const isVid = (f.mime_type || "").includes("video") || f.name.endsWith(".mp4");
        const isAud = (f.mime_type || "").includes("audio") || f.name.endsWith(".mp3") || f.name.endsWith(".m4a");
        // Se clicou vídeo → só vídeos; se clicou áudio → só áudios; se não sei → ambos
        if (clickedIsVideo) return isVid;
        if (clickedIsAudio) return isAud;
        return isVid || isAud;
      };

      const collected: FileItem[] = [];
      for (let i = 0; i < subFolders.length; i += 6) {
        const batch = subFolders.slice(i, i + 6);
        const results = await Promise.all(batch.map(folder => {
          const fpath = parentPath + encodeURIComponent(folder.name) + "/";
          return invoke<FileItem[]>("list_folder", { driveIndex: currentDrive.index, path: fpath })
            .then(files => files
              .filter(isMediaFile)
              .filter(f => !f.name.includes(".part-"))
              .map(f => ({ ...f, folder: folder.name } as FileItem & { folder?: string }))
            ).catch(() => []);
        }));
        results.forEach(v => collected.push(...v));
      }
      // Dedup por id
      const seen = new Set<string>();
      const deduped = collected.filter(v => {
        if (seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      });
      // Sort por folder + name
      deduped.sort((a, b) => {
        const fa = (a as FileItem & { folder?: string }).folder || "";
        const fb = (b as FileItem & { folder?: string }).folder || "";
        return fa.localeCompare(fb) || a.name.localeCompare(b.name);
      });
      // Finalize names
      const cnts: Record<string, number> = {};
      deduped.forEach(v => { cnts[v.name] = (cnts[v.name] || 0) + 1; });
      deduped.forEach(v => {
        const folder = (v as FileItem & { folder?: string }).folder;
        if (cnts[v.name] > 1 && folder) {
          v.name = folder + " - " + v.name;
        }
      });
      // Encontrar índice do vídeo atual — busca por id, depois por link, depois por name
      let newIdx = deduped.findIndex(v => v.id === currentFile.id && currentFile.id);
      if (newIdx < 0 && currentFile.link) {
        newIdx = deduped.findIndex(v => v.link === currentFile.link);
      }
      if (newIdx < 0 && currentFile.name) {
        newIdx = deduped.findIndex(v => v.name === currentFile.name || v.name.endsWith(currentFile.name));
      }
      if (newIdx < 0) newIdx = 0;
      // ★ v1.6.9: Preserve the EXACT link of the currently playing video so videoSrc
      // string stays identical after interfolder loads → video element doesn't reload.
      // The interfolder API call may return a slightly different link format (extra query params,
      // different encoding) which would change videoSrc and cause a reload.
      if (deduped[newIdx] && currentFile.link) {
        deduped[newIdx].link = currentFile.link;
      }
      if (deduped.length > 0) {
        setPlaylist(deduped);
        setPlayerIndex(newIdx);
        playerVideoIdRef.current = deduped[newIdx]?.id || currentFile.id;
      }
    } catch (e) {
      console.warn("Interfolder failed:", e);
    }
  }

  async function logout() {
    await invoke("logout");
    onLogout();
  }

  // ─── Player view ───
  if (view === "player" && currentDrive && playlist.length > 0) {
    return (
      <>
        <PlayerView
          drive={currentDrive}
          folderPath={currentPath}
          playlist={playlist}
          initialIndex={playerIndex}
          desiredIndex={playerIndex}
          playerVideoId={playerVideoIdRef.current}
          onBack={backToBrowse}
          onLogout={logout}
          onNavigateBreadcrumb={navigateToBreadcrumb}
          onHome={backToHome}
          aiMode={aiMode}
          localAiReady={localAiReady}
          onToggleAI={handleToggleAI}
          onManageAI={handleManageAI}
          onLoadInterfolder={loadInterfolderPlaylist}
        />
        {showAIPopup && (
          <AIInstallPopup
            onClose={handleClosePopup}
            onChooseLocal={handleChooseLocal}
            onChooseCloud={handleChooseCloud}
          />
        )}
        {showLlamaManager && (
          <LlamaManager
            onClose={() => setShowLlamaManager(false)}
            onReady={handleChooseLlama}
          />
        )}
      </>
    );
  }

  // ─── Browse view (folder listing) ───
  if (view === "browse") {
    return (
      <>
        <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
          <Header
            onBack={backToDrives}
            onHome={backToHome}
            onLogout={logout}
            breadcrumb={
              <Breadcrumb
                drive={currentDrive}
                path={currentPath}
                onCrumb={navigateToBreadcrumb}
                onRoot={backToDrives}
              />
            }
            aiMode={aiMode}
            localAiReady={localAiReady}
            onToggleAI={handleToggleAI}
            onManageAI={handleManageAI}
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
                      else if (isVideo || isAudio) openPlayer(file);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        {showAIPopup && (
          <AIInstallPopup
            onClose={handleClosePopup}
            onChooseLocal={handleChooseLocal}
            onChooseCloud={handleChooseCloud}
          />
        )}
      </>
    );
  }

  // ─── Home view (Área do Aluno — rich staging-style) ───
  if (view === "home") {
    const history = (userState.history as Array<{ name?: string; path?: string; link?: string }>) || [];
    const watched = (userState.watched as Record<string, boolean>) || {};
    const resume = (userState.resume as Record<string, number>) || {};
    const watchedCount = Object.keys(watched).length;
    const recentHistory = history.slice(-8).reverse();
    const appVersion: string = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.6.3";
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

    // Helper: decode path → { driveName, courseName }
    function parsePath(path?: string): { driveName: string; courseName: string } {
      if (!path) return { driveName: "", courseName: "" };
      try {
        const parts = path.split("/").filter(Boolean);
        const driveIdx = parts[0] ? parseInt(parts[0].replace(":", ""), 10) : -1;
        const driveName = driveIdx >= 0 ? (drives.find((d) => d.index === driveIdx)?.name || "") : "";
        const courseName = parts[2] ? decodeURIComponent(parts[2]).replace(/\+/g, " ") : "";
        return { driveName, courseName };
      } catch (_) { return { driveName: "", courseName: "" }; }
    }

    return (
      <>
        <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
          <Header
            onBack={null}
            onHome={null}
            onLogout={logout}
            breadcrumb={null}
            aiMode={aiMode}
            localAiReady={localAiReady}
            onToggleAI={handleToggleAI}
            onManageAI={handleManageAI}
          />
          <div style={{ flex: 1, overflow: "auto", padding: "24px", maxWidth: "1280px", margin: "0 auto", width: "100%" }}>
            {/* Update notification */}
            {updateAvailable && (
              <div style={{
                background: "linear-gradient(135deg, rgba(63,185,80,0.15), rgba(93,222,218,0.1))",
                border: "1px solid rgba(63,185,80,0.3)",
                borderRadius: "14px", padding: "14px 20px", marginBottom: "24px",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap",
              }}>
                <div>
                  <span style={{ color: "#3fb950", fontWeight: 700, fontSize: "14px" }}>🔄 Atualização disponível!</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "13px", marginLeft: "8px" }}>v{updateAvailable}</span>
                </div>
                <button onClick={downloadUpdate} style={{ ...btnStyle, background: "rgba(63,185,80,0.2)", borderColor: "rgba(63,185,80,0.4)", color: "#3fb950" }}>
                  ⬇ Baixar e instalar
                </button>
              </div>
            )}

            {/* ── Hero / Welcome ── */}
            <div style={{
              background: "linear-gradient(135deg, rgba(255,139,159,0.12), rgba(192,38,211,0.08))",
              border: "1px solid rgba(255,139,159,0.2)",
              borderRadius: "18px",
              padding: "28px 32px",
              marginBottom: "28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "20px",
              flexWrap: "wrap",
            }}>
              <div>
                <div style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "4px" }}>🐩 Meggy Desktop · v{appVersion}</div>
                <h1 style={{ fontSize: "28px", fontWeight: 800, color: "var(--text)", margin: 0, marginBottom: "6px" }}>
                  {greeting}! 👋
                </h1>
                <p style={{ fontSize: "14px", color: "var(--text-muted)", margin: 0, maxWidth: "480px", lineHeight: 1.5 }}>
                  Continue de onde parou ou explore novos cursos. Tudo offline, rápido e no seu ritmo.
                </p>
              </div>
              <div style={{ fontSize: "56px", flexShrink: 0 }}>🐩</div>
            </div>

            {/* ── Continue Assistindo (rich cards with progress bars) ── */}
            {recentHistory.length > 0 && (
              <div style={{ marginBottom: "32px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                  <span style={{ fontSize: "20px" }}>▶</span>
                  <h2 style={{ color: "var(--text)", fontSize: "18px", fontWeight: 700, margin: 0 }}>Continue assistindo</h2>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "14px" }}>
                  {recentHistory.map((h, i) => {
                    const rawName = h.name || h.path?.split("/").pop()?.replace(/\.\w+$/, "") || "Aula";
                    const name = decodeURIComponent(rawName).replace(/\+/g, " ");
                    const link = h.link || "";
                    const resumePos = resume[link] || 0;
                    const resumeStr = resumePos > 60 ? `${Math.floor(resumePos / 60)}:${String(Math.floor(resumePos % 60)).padStart(2, "0")}` : "";
                    const isWatched = watched[link];
                    const { driveName, courseName } = parsePath(h.path);
                    // Progress: watched=100%, has resume=~50% (visual), else 0%
                    const progressPct = isWatched ? 100 : resumePos > 0 ? 45 : 0;
                    const progressColor = isWatched ? "#3fb950" : resumePos > 0 ? "#ffd43b" : "#ff8b9f";
                    return (
                      <div
                        key={i}
                        onClick={async () => {
                          if (!h.path) return;
                          const pathParts = h.path.split("/").filter(Boolean);
                          if (pathParts.length < 2) return;
                          const driveIdx = parseInt(pathParts[0].replace(":", "")) || 0;
                          const drive = drives.find((d) => d.index === driveIdx);
                          if (!drive) return;
                          setCurrentDrive(drive);
                          const folderPath = "/" + pathParts.slice(0, -1).join("/") + "/";
                          setCurrentPath(folderPath);
                          setView("browse");
                          await loadFolder(drive, folderPath);
                          setTimeout(() => {
                            const fileItem: FileItem = {
                              name: name + (h.name?.endsWith(".mp4") ? "" : ".mp4"),
                              mime_type: "video/mp4",
                              id: h.link || "",
                              link: h.link || null,
                              size: 0,
                            };
                            openPlayer(fileItem);
                          }, 500);
                        }}
                        style={{
                          background: "var(--surface)", borderRadius: "14px", padding: "16px",
                          cursor: "pointer", transition: "all 0.2s",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,139,159,0.4)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "translateY(0)"; }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                          <div style={{
                            width: "42px", height: "42px", borderRadius: "10px", flexShrink: 0,
                            background: isWatched ? "rgba(63,185,80,0.15)" : "linear-gradient(135deg, rgba(255,139,159,0.18), rgba(192,38,211,0.12))",
                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px",
                          }}>{isWatched ? "✓" : "🎬"}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: "var(--text)", fontWeight: 600, fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                            <div style={{ color: "var(--text-muted)", fontSize: "11px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {driveName}{courseName ? " · " + courseName : ""}
                            </div>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div style={{ height: "4px", background: "rgba(255,255,255,0.08)", borderRadius: "2px", overflow: "hidden", marginBottom: "6px" }}>
                          <div style={{ height: "100%", width: `${progressPct}%`, background: progressColor, borderRadius: "2px", transition: "width 0.3s" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)" }}>
                          <span>{resumeStr ? `⏱ ${resumeStr}` : (resumePos > 0 ? "Em andamento" : "Não iniciado")}</span>
                          <span>{isWatched ? "✓ Assistido" : `${progressPct}%`}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Navigation cards grid (staging-style) ── */}
            <div style={{ marginBottom: "32px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                <span style={{ fontSize: "20px" }}>🧭</span>
                <h2 style={{ color: "var(--text)", fontSize: "18px", fontWeight: 700, margin: 0 }}>Navegação</h2>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "14px" }}>
                {[
                  { icon: "☁️", title: "Explorar Drives", desc: "Navegue por todos os drives disponíveis", action: () => setView("drives"), color: "rgba(93,222,218,0.12)" },
                  { icon: "🤖", title: "Meggy AI", desc: aiMode === "local" ? "WebLLM ativo (offline)" : aiMode === "llama" ? "llama.cpp ativo (CPU/GPU)" : "IA da Nuvem ativa", action: () => handleManageAI(), color: "rgba(255,139,159,0.12)" },
                  { icon: "📊", title: "Estatísticas", desc: `${watchedCount} aulas assistidas`, action: () => {}, color: "rgba(63,185,80,0.12)" },
                  { icon: "📱", title: "Apps Meggy", desc: "Baixar para outras plataformas", action: () => {
                    const el = document.getElementById("meggy-apps-section");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }, color: "rgba(192,38,211,0.12)" },
                ].map((card, i) => (
                  <div
                    key={i}
                    onClick={card.action}
                    style={{
                      background: "var(--surface)", borderRadius: "14px", padding: "20px",
                      cursor: "pointer", transition: "all 0.2s",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,139,159,0.4)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "translateY(0)"; }}
                  >
                    <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: card.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", marginBottom: "12px" }}>
                      {card.icon}
                    </div>
                    <div style={{ color: "var(--text)", fontWeight: 700, fontSize: "15px", marginBottom: "4px" }}>{card.title}</div>
                    <div style={{ color: "var(--text-muted)", fontSize: "12px", lineHeight: 1.4 }}>{card.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Estatísticas (rich stat cards) ── */}
            <div style={{ marginBottom: "32px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                <span style={{ fontSize: "20px" }}>📊</span>
                <h2 style={{ color: "var(--text)", fontSize: "18px", fontWeight: 700, margin: 0 }}>Estatísticas</h2>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "14px" }}>
                <div style={{ background: "var(--surface)", borderRadius: "14px", padding: "20px", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "rgba(63,185,80,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", marginBottom: "12px" }}>🎬</div>
                  <div style={{ color: "var(--text)", fontWeight: 800, fontSize: "24px" }}>{watchedCount}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>Aulas assistidas</div>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: "14px", padding: "20px", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "rgba(93,222,218,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", marginBottom: "12px" }}>📚</div>
                  <div style={{ color: "var(--text)", fontWeight: 800, fontSize: "24px" }}>{drives.length}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>Drives disponíveis</div>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: "14px", padding: "20px", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "rgba(255,139,159,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", marginBottom: "12px" }}>▶</div>
                  <div style={{ color: "var(--text)", fontWeight: 800, fontSize: "24px" }}>{recentHistory.length}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>Recentes</div>
                </div>
                <div
                  onClick={() => setView("drives")}
                  style={{ background: "linear-gradient(135deg, rgba(255,139,159,0.1), rgba(192,38,211,0.08))", borderRadius: "14px", padding: "20px", border: "1px solid rgba(255,139,159,0.2)", cursor: "pointer", transition: "all 0.2s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = "rgba(255,139,159,0.5)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "rgba(255,139,159,0.2)"; }}
                >
                  <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "rgba(255,139,159,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", marginBottom: "12px" }}>🚀</div>
                  <div style={{ color: "var(--pink)", fontWeight: 800, fontSize: "18px" }}>Explorar</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>Começar agora</div>
                </div>
              </div>
            </div>

            {/* ── Apps Meggy ── */}
            <div id="meggy-apps-section" style={{ marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                <span style={{ fontSize: "20px" }}>📱</span>
                <h2 style={{ color: "var(--text)", fontSize: "18px", fontWeight: 700, margin: 0 }}>Apps Meggy</h2>
              </div>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <a href="https://github.com/esaaraujo-lab/gdi_server/releases/latest" target="_blank" rel="noreferrer" style={{ ...btnStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 18px" }}>
                  🖥️ Windows / Linux
                </a>
                <a href="https://github.com/esaaraujo-lab/gdi_server/releases/latest" target="_blank" rel="noreferrer" style={{ ...btnStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 18px" }}>
                  📱 Android APK
                </a>
                <a href="https://github.com/esaaraujo-lab/gdi_server/releases/latest" target="_blank" rel="noreferrer" style={{ ...btnStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 18px" }}>
                  📺 Roku
                </a>
              </div>
            </div>

            {/* Footer version */}
            <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)", fontSize: "12px", borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: "12px" }}>
              🐩 Meggy Desktop v{appVersion} · <a href="https://github.com/esaaraujo-lab/gdi_server" target="_blank" rel="noreferrer" style={{ color: "var(--text-muted)" }}>GitHub</a>
            </div>
          </div>
        </div>
        {showAIPopup && (
          <AIInstallPopup
            onClose={handleClosePopup}
            onChooseLocal={handleChooseLocal}
            onChooseCloud={handleChooseCloud}
          />
        )}
        {showLlamaManager && (
          <LlamaManager
            onClose={() => setShowLlamaManager(false)}
            onReady={handleChooseLlama}
          />
        )}
      </>
    );
  }

  // ─── Drives view (root) ───
  return (
    <>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <Header
          onBack={null}
          onHome={backToHome}
          onLogout={logout}
          breadcrumb={null}
          aiMode={aiMode}
          localAiReady={localAiReady}
          onToggleAI={handleToggleAI}
          onManageAI={handleManageAI}
        />
        <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>
          <h2 style={{ color: "var(--text)", fontSize: "20px", marginBottom: "20px" }}>☁️ Drives disponíveis</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
            {drives.map((drive) => (
              <DriveCard key={drive.index} drive={drive} onClick={() => openDrive(drive)} />
            ))}
          </div>
        </div>
      </div>
      {showAIPopup && (
        <AIInstallPopup
          onClose={handleClosePopup}
          onChooseLocal={handleChooseLocal}
          onChooseCloud={handleChooseCloud}
        />
      )}
      {showLlamaManager && (
        <LlamaManager
          onClose={() => setShowLlamaManager(false)}
          onReady={handleChooseLlama}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// PlayerView — 2-column inline player (video | materials)
// ═══════════════════════════════════════════════════════════════
function PlayerView({
  drive, folderPath, playlist, initialIndex, desiredIndex, playerVideoId, onBack, onLogout, onNavigateBreadcrumb, onHome,
  aiMode, localAiReady, onToggleAI, onManageAI, onLoadInterfolder,
}: {
  drive: Drive;
  folderPath: string;
  playlist: FileItem[];
  initialIndex: number;
  desiredIndex: number;
  playerVideoId: string;
  onBack: () => void;
  onLogout: () => void;
  onNavigateBreadcrumb: (i: number) => void;
  onHome: () => void;
  aiMode: "local" | "cloud" | "llama";
  localAiReady: boolean;
  onToggleAI: () => void;
  onManageAI: () => void;
  onLoadInterfolder: (currentFile: FileItem) => Promise<void>;
}) {
  // ★ v1.7.0: Derived state via REF — only reacts to PROP changes, not manual switchTo.
  // The v1.6.9 version used state (prevDesiredIndex) which switchTo also updated,
  // causing the prop check to override manual switches on the next render.
  // Now: lastPropDesiredRef only updates when the PROP desiredIndex changes (interfolder load),
  // so switchTo's setIdx() is never overridden.
  const [idx, setIdx] = useState(initialIndex);
  const lastPropDesiredRef = useRef<number>(desiredIndex);
  if (desiredIndex !== lastPropDesiredRef.current) {
    lastPropDesiredRef.current = desiredIndex;
    if (desiredIndex >= 0 && desiredIndex < playlist.length) {
      setIdx(desiredIndex);
    }
  }
  const [mode, setMode] = useState<"split" | "fv" | "fm">("split");
  const [materials, setMaterials] = useState<FileItem[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<{ kind: "file" | "isa"; id: string }>({ kind: "file", id: "0" });
  const [isaCache, setIsaCache] = useState<Record<string, unknown> | null>(null);
  const [isaLoadingMsg, setIsaLoadingMsg] = useState<string | null>(null);
  const [watchedSet, setWatchedSet] = useState<Set<string>>(new Set()); // ★ v1.5.5: watched videos
  const [isaError, setIsaError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notesList, setNotesList] = useState<{ time: string; text: string }[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [interfolderLoading, setInterfolderLoading] = useState(false);
  const [currentFolderPath, setCurrentFolderPath] = useState(folderPath);
  const [materialContent, setMaterialContent] = useState<Record<number, string>>({});
  const [aiSource, setAiSource] = useState<"local" | "cloud" | "llama" | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isaGenRef = useRef<string>("");
  // ★ v1.6.9: Race-condition guard for loadMaterials — only the latest call's result is applied
  const loadMaterialsReqIdRef = useRef<number>(0);

  const currentFile = playlist[idx];
  const videoSrc = currentFile?.link ? `${BASE_URL}${currentFile.link}` : "";
  const isAudio = currentFile
    ? (currentFile.mime_type.startsWith("audio/") || currentFile.name.endsWith(".mp3") || currentFile.name.endsWith(".m4a"))
    : false;

  // ─── Load materials ───
  const loadMaterials = useCallback(async () => {
    if (!currentFolderPath) return;
    // ★ v1.6.9: Assign a unique ID to this call; only apply results if still the latest
    const myReqId = ++loadMaterialsReqIdRef.current;
    setMaterialsLoading(true);
    setMaterials([]);
    setActiveTab({ kind: "file", id: "0" });
    setMaterialContent({});
    try {
      const here = await invoke<FileItem[]>("list_folder", {
        driveIndex: drive.index,
        path: currentFolderPath,
      });
      // ★ Race guard: if a newer loadMaterials call started, discard our results
      if (myReqId !== loadMaterialsReqIdRef.current) return;
      const isMaterial = (x: FileItem) => {
        const ext = (x.name.split(".").pop() || "").toLowerCase();
        const mt = (x.mime_type || "").toLowerCase();
        return ext === "pdf" || mt.includes("pdf") || ext === "md" ||
          mt.includes("markdown") || ext === "txt" || mt === "text/plain" ||
          ext === "html" || mt.includes("html");
      };
      let found = here.filter(isMaterial);
      // ★ v1.7.1: ALWAYS search subfolders (not just when found is empty).
      // The old code only searched subfolders if the current folder had NO materials.
      // But many courses have PDFs in BOTH the current folder AND a "material" subfolder.
      // Now: always collect from subfolders too, then dedup.
      const subs = here.filter(x => x.mime_type === "application/vnd.google-apps.folder").slice(0, 20);
      for (const sf of subs) {
        const subPath = currentFolderPath + encodeURIComponent(sf.name) + "/";
        try {
          const subFiles = await invoke<FileItem[]>("list_folder", { driveIndex: drive.index, path: subPath });
          if (myReqId !== loadMaterialsReqIdRef.current) return; // race guard
          const subMats = subFiles.filter(isMaterial);
          if (subMats.length) {
            // Tag with subfolder name for context
            subMats.forEach(m => { (m as FileItem & { folder?: string }).folder = sf.name; });
            found = found.concat(subMats);
          }
        } catch (_) { /* skip */ }
      }
      // ★ v1.7.1: If still nothing found, search parent folder (fallback)
      if (!found.length) {
        const parts = currentFolderPath.split("/").filter(Boolean);
        const parentPath = "/" + parts.slice(0, -1).join("/") + "/";
        if (parentPath !== "/" && parentPath !== currentFolderPath) {
          try {
            const parentFiles = await invoke<FileItem[]>("list_folder", { driveIndex: drive.index, path: parentPath });
            if (myReqId !== loadMaterialsReqIdRef.current) return; // race guard
            found = parentFiles.filter(isMaterial);
          } catch (_) { /* skip */ }
        }
      }
      // ★ v1.7.1: Dedup by link (same PDF might appear in folder + subfolder listing)
      const seenLinks = new Set<string>();
      found = found.filter(f => {
        const key = f.link || f.id || f.name;
        if (seenLinks.has(key)) return false;
        seenLinks.add(key);
        return true;
      });
      if (myReqId !== loadMaterialsReqIdRef.current) return; // final race guard
      setMaterials(found.slice(0, 12));
    } catch (e) {
      console.error("loadMaterials", e);
      if (myReqId === loadMaterialsReqIdRef.current) setMaterials([]);
    }
    if (myReqId === loadMaterialsReqIdRef.current) setMaterialsLoading(false);
  }, [drive.index, currentFolderPath]);

  useEffect(() => { loadMaterials(); }, [loadMaterials]);

  // ★ v1.6.9: idx sync is now handled by derived state pattern (above, during render).
  // No more useEffect([desiredIndex]) — that fired AFTER commit and caused video restart.

  // ★ v1.5.5: Load watched state from server on mount
  useEffect(() => {
    getUserState().then((state) => {
      const watched = (state as Record<string, unknown>)?.watched;
      if (watched && typeof watched === "object") {
        const ids = Object.keys(watched);
        setWatchedSet(new Set(ids));
      }
    }).catch(() => { /* ignore */ });
  }, []);

  // ★ v1.5.5: Mark video as watched when played >50% or on ended
  function markWatched() {
    if (!currentFile) return;
    const link = currentFile.link || "";
    if (!link || watchedSet.has(link)) return;
    const newSet = new Set(watchedSet);
    newSet.add(link);
    setWatchedSet(newSet);
    // Save to server (fire-and-forget)
    saveUserState({ watched: { [link]: true } }).catch(() => { /* ignore */ });
  }

  // ★ v1.9.0: Save resume position to server (throttled — every 10s)
  const lastResumeSaveRef = useRef<number>(0);
  function saveResumePosition(position: number) {
    if (!currentFile || !currentFile.link) return;
    const now = Date.now();
    // Throttle: only save every 10 seconds
    if (now - lastResumeSaveRef.current < 10000) return;
    lastResumeSaveRef.current = now;
    const link = currentFile.link;
    // Save resume position as { [link]: seconds } — merges with existing resume data
    saveUserState({ resume: { [link]: Math.floor(position) } }).catch(() => { /* ignore */ });
  }

  // ★ v1.6.9: Save lesson to history (last 4) when video changes — for "Continue Assistindo"
  useEffect(() => {
    if (!currentFile || !videoSrc) return;
    const folder = (currentFile as FileItem & { folder?: string }).folder;
    const pathParts = currentFolderPath.split("/").filter(Boolean);
    const fullPath = "/" + pathParts.join("/") + "/" + currentFile.name;
    // Load existing history from userState, prepend current, keep last 4
    getUserState().then((state) => {
      const s = (state as Record<string, unknown>) || {};
      const history = (s.history as Array<{ name?: string; path?: string; link?: string }>) || [];
      // Don't add if it's already the most recent
      if (history.length > 0 && history[history.length - 1]?.link === currentFile.link) return;
      const entry = { name: currentFile.name, path: fullPath, link: currentFile.link || "" };
      const newHistory = [...history, entry].slice(-4); // keep last 4
      saveUserState({ history: newHistory }).catch(() => { /* ignore */ });
    }).catch(() => { /* ignore */ });
  }, [videoSrc]);

  // Reset ISA state + active tab on video change
  useEffect(() => {
    setIsaCache(null);
    setIsaError(null);
    setIsaLoadingMsg(null);
    setAiSource(null);
    isaGenRef.current = videoSrc;

    // ★ v1.5.4: Update currentFolderPath when video changes (interfolder playlists)
    if (currentFile) {
      // Check if the video has a "folder" property (set by interfolder)
      const folderName = (currentFile as FileItem & { folder?: string }).folder;
      if (folderName) {
        // Video is from a different folder — build the path
        const parts = folderPath.split("/").filter(Boolean);
        const parentPath = "/" + parts.slice(0, -1).join("/") + "/";
        const newFolderPath = parentPath + encodeURIComponent(folderName) + "/";
        if (newFolderPath !== currentFolderPath) {
          setCurrentFolderPath(newFolderPath);
        }
      } else {
        // Video is from the original folder
        if (folderPath !== currentFolderPath) {
          setCurrentFolderPath(folderPath);
        }
      }
    }
  }, [videoSrc]);

  // Load notes from localStorage on video change
  useEffect(() => {
    if (!videoSrc) return;
    try {
      const saved = localStorage.getItem("meggy-notes-" + videoSrc);
      setNotes(saved || "");
    } catch (_) { /* ignore */ }
    setNotesList([]);
  }, [videoSrc]);

  // ─── ISA cache key (must update when video changes) ───
  const isaCacheKey = useMemo(() => {
    if (!currentFile) return "";
    // Use the current folder path + file name for the cache key
    let raw: string;
    try { raw = decodeURIComponent(currentFolderPath + currentFile.name); }
    catch (_) { raw = currentFolderPath + currentFile.name; }
    return encodeURI(raw);
  }, [currentFolderPath, currentFile]);

  function switchTo(newIdx: number) {
    if (newIdx < 0 || newIdx >= playlist.length) return;
    setIdx(newIdx);
    // ★ v1.7.0: No need to update any ref — lastPropDesiredRef only tracks the PROP,
    // so manual switches via setIdx are never overridden.
  }

  function saveNote() {
    if (!notes.trim()) return;
    try { localStorage.setItem("meggy-notes-" + videoSrc, notes); } catch (_) { /* ignore */ }
    setNotesList(prev => [...prev, { time: fmtTime(currentTime), text: notes.trim() }]);
    setNotes("");
  }

  function seekToTime() {
    const t = prompt("Ir para (segundos):", "0");
    const media = videoRef.current || audioRef.current;
    if (t && media) {
      const num = parseFloat(t);
      if (!isNaN(num)) media.currentTime = num;
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      const media = videoRef.current || audioRef.current;
      if (!media) return;
      switch (e.key) {
        case " ": e.preventDefault(); media.paused ? media.play() : media.pause(); break;
        case "ArrowRight": media.currentTime = Math.min(media.duration || 0, media.currentTime + 10); break;
        case "ArrowLeft": media.currentTime = Math.max(0, media.currentTime - 10); break;
        case "ArrowUp": e.preventDefault(); media.volume = Math.min(1, media.volume + 0.1); break;
        case "ArrowDown": e.preventDefault(); media.volume = Math.max(0, media.volume - 0.1); break;
        case "n": case "N": if (idx < playlist.length - 1) switchTo(idx + 1); break;
        case "p": case "P": if (idx > 0) switchTo(idx - 1); break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [idx, playlist.length]);

  // ─── Show ISA panel (cache check + parallel generate) ───
  async function showISA(type: "summary" | "questions" | "mindmap" | "flashcards") {
    setActiveTab({ kind: "isa", id: type });
    setIsaError(null);

    // If already cached and this field exists, render directly
    if (isaCache && (isaCache[type] || (type === "flashcards" && isaCache.flashcards))) return;

    const myKey = videoSrc;
    isaGenRef.current = myKey;
    setIsaLoadingMsg("🐩 Meggy está lendo o material e criando conteúdo…\n⏱️ Tempo estimado: 30-60 segundos.");

    try {
      // ─── 1. Cache check (GET /api/ai/cache?key=...) ───
      let cached: Record<string, unknown> | null = null;
      try {
        const r = await aiCacheGet(isaCacheKey);
        if (r && r.cached) cached = r.cached as Record<string, unknown>;
      } catch (_) { /* cache miss */ }

      if (cached && (cached.summary || cached.mindmap || (cached.questions && (cached.questions as unknown[]).length))) {
        // Auto-create flashcards from cached questions
        const cachedQs = (cached.questions || []) as QuizQuestion[];
        if (cachedQs.length && !cached.flashcards) {
          cached.flashcards = cachedQs.map(q => {
            let back = "";
            if (q.type === "mc" && q.options) {
              back = String.fromCharCode(65 + q.correct) + ") " + (q.options[q.correct] || "");
            } else {
              back = (q.correct === 1) ? "Certo" : "Errado";
            }
            if (q.explanation) back += "\n\n💡 " + q.explanation;
            if (q.legalText) back += "\n\n⚖️ " + q.legalText;
            if (q.fundamentacao) back += "\n\n📚 " + q.fundamentacao;
            return { f: q.statement, b: back, type: q.type };
          });
        }
        if (isaGenRef.current !== myKey) return;
        setIsaCache(cached);
        setIsaLoadingMsg(null);
        return;
      }

      // ─── 2. Extract material: TRANSCRIÇÃO primeiro, PDF se não houver ───
      setIsaLoadingMsg("🔍 Procurando transcrição da aula…");
      let matContent = "";
      let matSource = "";
      try {
        const here = await invoke<FileItem[]>("list_folder", { driveIndex: drive.index, path: currentFolderPath });
        const isTransc = (f: FileItem) => {
          const ext = (f.name.split(".").pop() || "").toLowerCase();
          const lowName = f.name.toLowerCase();
          return lowName.includes("transcri") || ext === "txt" || ext === "md";
        };
        let searchFiles = here.filter(isTransc);
        // ★ Buscar transcrição em subpastas (especialmente "material")
        if (!searchFiles.length) {
          const subs = here.filter(f => f.mime_type === "application/vnd.google-apps.folder").slice(0, 5);
          for (const sf of subs) {
            const subPath = currentFolderPath + encodeURIComponent(sf.name) + "/";
            try {
              const subFiles = await invoke<FileItem[]>("list_folder", { driveIndex: drive.index, path: subPath });
              const subTransc = subFiles.filter(isTransc);
              if (subTransc.length) { searchFiles = subTransc; break; }
            } catch (_) { /* skip */ }
          }
        }
        // ★ FASE 1: Se achou transcrição, usar SÓ ELA
        if (searchFiles.length) {
          setIsaLoadingMsg("📝 Transcrição encontrada! Lendo…");
          for (const m of searchFiles.slice(0, 2)) {
            if (m.link) {
              try {
                const link = m.link.startsWith("http") ? m.link : (BASE_URL + m.link);
                const txt = await fetchText(link);
                if (txt) {
                  matContent += "\n\n--- Transcrição: " + m.name + " ---\n" + txt.substring(0, 60000);
                }
              } catch (_) { /* skip */ }
            }
          }
          if (matContent.length > 100) matSource = "transcrição";
        }
        // ★ FASE 2: Se NÃO achou transcrição, extrair PDFs
        if (matContent.length < 100) {
          setIsaLoadingMsg("📄 Sem transcrição. Extraindo material em PDF…");
          let pdfFiles = here.filter(f => {
            const ext = (f.name.split(".").pop() || "").toLowerCase();
            return ext === "pdf";
          });
          // Buscar PDFs em subpastas se não achou na pasta principal
          if (!pdfFiles.length) {
            const subs = here.filter(f => f.mime_type === "application/vnd.google-apps.folder").slice(0, 5);
            for (const sf of subs) {
              const subPath = currentFolderPath + encodeURIComponent(sf.name) + "/";
              try {
                const subFiles = await invoke<FileItem[]>("list_folder", { driveIndex: drive.index, path: subPath });
                const subPdfs = subFiles.filter(f => {
                  const ext = (f.name.split(".").pop() || "").toLowerCase();
                  return ext === "pdf";
                });
                if (subPdfs.length) { pdfFiles = subPdfs; break; }
              } catch (_) { /* skip */ }
            }
          }
          for (const m of pdfFiles.slice(0, 3)) {
            if (m.link) {
              setIsaLoadingMsg("📄 Extraindo texto do PDF: " + m.name + "…");
              try {
                const link = m.link.startsWith("http") ? m.link : (BASE_URL + m.link);
                const pdfText = await extractPdfText(link);
                if (pdfText && pdfText.length > 50) {
                  matContent += "\n\n--- Material PDF: " + m.name + " ---\n" + pdfText.substring(0, 40000);
                }
              } catch (e) {
                console.warn("PDF extract failed:", m.name, e);
              }
            }
          }
          if (matContent.length > 100) matSource = "PDF";
        }
      } catch (e) { console.warn("material extract", e); }

      if (matContent.length > 80000) matContent = matContent.substring(0, 80000) + "\n[...truncado...]";

      const courseName = currentFolderPath.split("/").filter(Boolean).slice(-1)[0] || "";
      const ctx = `Aula: ${currentFile?.name || ""}\nCurso: ${courseName}\nDrive: ${drive.name}` +
        (matSource ? `\nFonte do material: ${matSource}` : "");
      const hasContent = matContent.length > 100;
      const textSlice = hasContent ? matContent : ctx;
      const sliceCap = hasContent ? 80000 : 2000;

      // ─── 3. Prompts (replica de meggy-cache.js) ───
      const RESUMO_PROMPTS = [
        `Você é um professor especialista em concursos públicos. Leia TODO o material abaixo e crie um RESUMO PROFUNDO E DETALHADO em Markdown.\n\nREQUISITOS:\n- Mínimo 2000 caracteres\n- Estruture com ## títulos e ### subtítulos\n- Para CADA tópico: explique o conceito, dê EXEMPLOS práticos, e destaque pegadinhas de prova\n- Use **negrito** para palavras-chave e dispositivos legais\n- Use listas com marcadores para enumerações\n- Inclua uma seção ## Pegadinhas de Prova no final\n- Inclua uma seção ## Resumo Rápido com 5-10 bullets dos pontos mais importantes\n\nNÃO omita nenhum tema. Seja PROFUNDO, não conciso.\n\nMaterial:\n${textSlice.slice(0, sliceCap)}`,
        `Crie um resumo DETALHADO em Markdown deste material. Use ## títulos, **negrito** e - bullets. Inclua ## Pegadinhas de Prova no final. Material:\n${textSlice.slice(0, 20000)}`,
        `Crie um resumo em Markdown deste material. Use ## títulos e bullets. Material:\n${textSlice.slice(0, 10000)}`,
      ];
      const PILULAS_PROMPT = `Crie "Pílulas" deste material — pontos-chave para revisão rápida ANTES da prova. Formato Markdown:\n# Pílulas de Revisão\n\n## Conceitos Essenciais\n- **Conceito 1**: explicação curta com exemplo\n- **Conceito 2**: explicação curta\n\n## Pegadinhas Rápidas\n- ⚠️ Pegadinha 1\n- ⚠️ Pegadinha 2\n\n## Mnemônicos\n- Dica para memorizar\n\nMáximo 20 bullets no total. Seja OBJETIVO mas COMPLETO.\n\nConteúdo:\n${textSlice.slice(0, 15000)}`;
      const QUESTOES_PROMPT = `Você é um examinador de concurso público brasileiro experiente. Baseado neste material, gere 10 questões de concurso em JSON array. Misture:\n- 6 múltipla escolha: {"type":"mc","statement":"...","options":["a","b","c","d"],"correct":0,"legalText":"...","explanation":"...","fundamentacao":"..."}\n- 4 certo/errado (CEBRASPE): {"type":"tf","statement":"...","correct":1,"legalText":"...","explanation":"...","fundamentacao":"..."}\n\nCAMPOS:\n- statement: enunciado claro, contexto completo\n- legalText: o dispositivo legal aplicável (ex: "art. 5º, CF")\n- explanation: explicação técnica do acerto/erro\n- fundamentacao: fundamentação didática completa\n\nSem comentários, só JSON.\n\n${textSlice.slice(0, 60000)}`;

      // ─── 4. Generate in parallel (Promise.allSettled) ───
      // ★ v1.8.0: 3 AI modes — "cloud" (worker), "local" (WebLLM), "llama" (llama.cpp)
      // Each tries its local model first, falls back to cloud on failure.
      const modeLabel = aiMode === "local" ? " (⚡ WebLLM)" : aiMode === "llama" ? " (🦙 llama.cpp)" : "";
      setIsaLoadingMsg(`✨ Gerando resumo + pílulas + questões${matSource ? " (fonte: " + matSource + ")" : ""}…${modeLabel}\nIsto pode levar 30-90s.`);

      type AiResult = { text: string; source: "local" | "cloud" | "llama" };

      const callAiWithFallback = async (prompt: string, kind: string): Promise<AiResult> => {
        // ★ v1.8.0: llama.cpp mode — uses llama-server (CPU/GPU offloading)
        if (aiMode === "llama") {
          try {
            const shortPrompt = prompt.slice(0, 12000); // llama.cpp can handle larger context
            const r = await llamaLocalChat(shortPrompt);
            if (r.ok && r.text && r.text.length >= 100) {
              return { text: r.text, source: "llama" };
            }
            console.warn("llama.cpp failed, falling back to cloud:", r.error);
          } catch (e) {
            console.warn("llama.cpp failed, falling back to cloud:", e);
          }
        }
        // ★ v1.5.0: WebLLM mode — uses WebGPU (if GPU supports it)
        if (aiMode === "local" && localAiReady && checkWebGPU()) {
          try {
            const shortPrompt = prompt.slice(0, 6000);
            const loaded = await ensureModelLoaded();
            if (loaded) {
              const r = await localChat(shortPrompt, { maxTokens: 2048, temperature: 0.6 });
              if (r.ok && r.text && r.text.length >= 100) {
                return { text: r.text, source: "local" };
              }
            }
          } catch (e) {
            console.warn("local AI failed, falling back to cloud:", e);
          }
        }
        // Cloud fallback with the full prompt.
        const text = await aiGenerate(prompt, kind);
        return { text, source: "cloud" };
      };

      const callIsa = async (prompt: string, kind: string): Promise<AiResult> => {
        try { return await callAiWithFallback(prompt, kind); }
        catch (e) { console.warn("callIsa", kind, e); return { text: "", source: "cloud" }; }
      };

      const [summaryRes, mindmapRes, questionsRes] = await Promise.all([
        (async (): Promise<AiResult> => {
          for (let i = 0; i < RESUMO_PROMPTS.length; i++) {
            const r = await callIsa(RESUMO_PROMPTS[i], "resumo");
            if (r.text && r.text.length > 200) return r;
          }
          return { text: "", source: "cloud" };
        })(),
        callIsa(PILULAS_PROMPT, "mindmap"),
        callIsa(QUESTOES_PROMPT, "questoes"),
      ]);

      const summaryR = stripAiReasoning(summaryRes.text);
      const mindmapR = stripAiReasoning(mindmapRes.text);
      const questionsR = stripAiReasoning(questionsRes.text);

      // ★ v1.5.0: Determine the AI source badge — if ANY call succeeded locally, show "local".
      const sources = [summaryRes.source, mindmapRes.source, questionsRes.source];
      setAiSource(sources.some((s) => s === "local") ? "local" : "cloud");

      if (isaGenRef.current !== myKey) return; // stale — user switched video

      const questions = parseQuestions(questionsR);
      const flashcards = questions.map(q => {
        let back = "";
        if (q.type === "mc" && q.options) {
          back = String.fromCharCode(65 + q.correct) + ") " + (q.options[q.correct] || "");
        } else {
          back = (q.correct === 1) ? "Certo" : "Errado";
        }
        if (q.explanation) back += "\n\n💡 " + q.explanation;
        if (q.legalText) back += "\n\n⚖️ " + q.legalText;
        if (q.fundamentacao) back += "\n\n📚 " + q.fundamentacao;
        return { f: q.statement, b: back, type: q.type };
      });

      const gen: Record<string, unknown> = {
        summary: summaryR || null,
        mindmap: mindmapR || null,
        questions: questions.length ? questions : null,
        flashcards: flashcards.length ? flashcards : null,
        lessonName: currentFile?.name || "",
      };

      // ─── 5. Save cache (fire-and-forget) ───
      aiCacheSave(isaCacheKey, {
        summary: (gen.summary as string) || null,
        questions: (gen.questions as QuizQuestion[]) || null,
        mindmap: (gen.mindmap as string) || null,
        lessonName: (gen.lessonName as string) || "",
      }).catch(() => { /* ignore */ });

      setIsaCache(gen);
      setIsaLoadingMsg(null);
    } catch (e: unknown) {
      console.error("showISA", e);
      if (isaGenRef.current !== myKey) return;
      setIsaError(e instanceof Error ? e.message : "Erro ao gerar conteúdo");
      setIsaLoadingMsg(null);
    }
  }

  // ─── Material tab click ───
  function showMaterial(i: number) {
    setActiveTab({ kind: "file", id: String(i) });
    const m = materials[i];
    if (!m) return;
    const ext = (m.name.split(".").pop() || "").toLowerCase();
    if ((ext === "md" || ext === "txt" || ext === "html") && m.link && materialContent[i] === undefined) {
      const link = m.link.startsWith("http") ? m.link : (BASE_URL + m.link);
      setMaterialContent(prev => ({ ...prev, [i]: "" })); // mark loading
      fetchText(link).then(txt => {
        setMaterialContent(prev => ({ ...prev, [i]: txt }));
      }).catch(() => {
        setMaterialContent(prev => ({ ...prev, [i]: "Erro ao carregar." }));
      });
    }
  }

  // ─── Render guards ───
  if (!currentFile) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
        Nenhum vídeo na playlist.
        <button onClick={onHome} style={{ ...btnStyle, marginLeft: "12px" }}>🏠 Home</button>
      </div>
    );
  }

  const fileSize = currentFile.size > 0 ? `${(currentFile.size / 1024 / 1024).toFixed(1)} MB` : "";
  const parts = currentFolderPath.split("/").filter(Boolean);

  // Build material tabs
  let materialCounter = 0;
  const fileTabs = materials.map((m, i) => {
    const ext = (m.name.split(".").pop() || "").toLowerCase();
    const lowName = m.name.toLowerCase();
    const isTransc = lowName.includes("transcri") || ext === "txt";
    const isAiResumo = lowName.startsWith("resumo") || lowName.includes("resumo_ia") || lowName.includes("resumo-ia");
    const isEbook = lowName.includes("ebook") || lowName.includes("apostila");
    const isGenericPdf = ext === "pdf" && !isTransc && !isAiResumo && !isEbook;
    if (isGenericPdf) materialCounter++;
    let label: string;
    if (isTransc) label = "Transcrição";
    else if (isAiResumo) label = "Resumo IA";
    else if (isEbook) label = "Ebook";
    else if (isGenericPdf) label = materialCounter > 1 ? "Material " + materialCounter : "Material";
    else label = m.name.replace(/\.[^.]+$/, "").substring(0, 15);
    const icon = isTransc ? "📝" : isAiResumo ? "⭐" : isEbook ? "📖" : ext === "pdf" ? "📄" : "📃";
    return { i, label, icon };
  });

  const isaTabs = [
    { id: "summary" as const, label: "Resumo Meggy", icon: "⭐" },
    { id: "questions" as const, label: "Questões", icon: "❓" },
    { id: "mindmap" as const, label: "Pílulas", icon: "💊" },
    { id: "flashcards" as const, label: "Flashcards", icon: "🃏" },
  ];

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header with breadcrumb + mode buttons */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", background: "var(--surface)", borderBottom: "1px solid var(--border)",
        gap: "12px", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1, flexWrap: "wrap" }}>
          <button onClick={onHome} style={{ ...btnStyle, flexShrink: 0 }}>🏠 Home</button>
          <span style={{ color: "var(--pink)", fontWeight: 700, fontSize: "18px", flexShrink: 0 }}>🐩 Meggy</span>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", minWidth: 0 }}>
            <button onClick={onHome} style={{ ...btnStyle, padding: "4px 8px", fontSize: "12px" }}>☁️ Drives</button>
            {parts.map((part, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>/</span>
                <button
                  onClick={() => onNavigateBreadcrumb(i)}
                  style={{
                    ...btnStyle, padding: "4px 8px", fontSize: "12px",
                    maxWidth: "160px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}
                  title={part}
                >{i === 0 ? `📁 ${drive.name}` : decodeURIComponent(part)}</button>
              </span>
            ))}
            <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>/</span>
            <span
              style={{ color: "var(--pink)", fontSize: "12px", fontWeight: 600, maxWidth: "220px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              title={currentFile.name}
            >{isAudio ? "🎵" : "🎬"} {currentFile.name}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px", flexShrink: 0, alignItems: "center" }}>
          <button
            onClick={onToggleAI}
            title={aiMode === "local" ? "WebLLM ativo (clique para llama.cpp)" : aiMode === "llama" ? "llama.cpp ativo (clique para nuvem)" : "IA da Nuvem ativa (clique para WebLLM)"}
            style={{
              ...modeBtnStyle,
              background: aiMode === "local" ? "linear-gradient(135deg,#ff8b9f,#c026d3)" : aiMode === "llama" ? "linear-gradient(135deg,#5ddeda,#3fb950)" : "var(--surface-2)",
              color: aiMode === "local" || aiMode === "llama" ? "#fff" : "var(--text)",
              borderColor: aiMode === "local" || aiMode === "llama" ? "transparent" : "var(--border)",
              opacity: aiMode === "local" && !localAiReady ? 0.6 : 1,
            }}
          >
            {aiMode === "local" ? "⚡ WebLLM" : aiMode === "llama" ? "🦙 llama.cpp" : "☁️ IA Nuvem"}
          </button>
          <button
            onClick={onManageAI}
            title="Gerenciar IA Local (instalar/desinstalar modelos)"
            style={{
              ...modeBtnStyle,
              padding: "6px 10px",
            }}
          >
            ⚙️
          </button>
          <button onClick={() => setMode("split")} style={{ ...modeBtnStyle, background: mode === "split" ? "var(--pink)" : "var(--surface-2)", color: mode === "split" ? "#fff" : "var(--text)" }}>⊟ Dividido</button>
          <button onClick={() => setMode("fv")} style={{ ...modeBtnStyle, background: mode === "fv" ? "var(--pink)" : "var(--surface-2)", color: mode === "fv" ? "#fff" : "var(--text)" }}>⚡ Foco aula</button>
          <button onClick={() => setMode("fm")} style={{ ...modeBtnStyle, background: mode === "fm" ? "var(--pink)" : "var(--surface-2)", color: mode === "fm" ? "#fff" : "var(--text)" }}>📄 Foco material</button>
        </div>
        <button onClick={onLogout} style={{ ...btnStyle, flexShrink: 0 }}>Sair</button>
      </div>

      {/* 2-column grid */}
      <div style={{
        flex: 1, overflow: "hidden", display: "grid", gap: "16px", padding: "16px",
        gridTemplateColumns: mode === "split" ? "1fr 1fr" : mode === "fv" ? "1fr 0fr" : "0fr 1fr",
        transition: "grid-template-columns 0.2s",
      }}>
        {/* LEFT — video + controls + notes + playlist */}
        <section style={{
          display: "flex", flexDirection: "column", gap: "12px", minWidth: 0,
          overflow: "auto", visibility: mode === "fm" ? "hidden" : "visible",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "22px", color: "var(--pink)" }}>{isAudio ? "🎵" : "🎬"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentFile.name}</div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{fileSize}</div>
            </div>
          </div>
          <div style={{
            background: "#000", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "16px",
            overflow: "hidden", width: "100%",
          }}>
            {isAudio ? (
              <div style={{ padding: "20px", textAlign: "center" }}>
                <div style={{ fontSize: "48px", marginBottom: "12px" }}>🎵</div>
                <audio
                  ref={audioRef}
                  src={videoSrc}
                  controls
                  autoPlay
                  style={{ width: "100%" }}
                  onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
                />
              </div>
            ) : (
              <video
                key={videoSrc}
                ref={videoRef}
                src={videoSrc}
                controls
                autoPlay
                playsInline
                style={{ display: "block", width: "100%", maxHeight: "60vh", background: "#000" }}
                onLoadedMetadata={(e) => {
                  // ★ v1.9.0: Seek to saved resume position when video loads
                  if (currentFile?.link) {
                    getUserState().then((state) => {
                      const s = (state as Record<string, unknown>) || {};
                      const resume = (s.resume as Record<string, number>) || {};
                      const pos = resume[currentFile.link!] || 0;
                      if (pos > 5) {
                        const media = e.target as HTMLVideoElement;
                        media.currentTime = pos;
                      }
                    }).catch(() => { /* ignore */ });
                  }
                }}
                onTimeUpdate={(e) => {
                  const t = (e.target as HTMLVideoElement).currentTime;
                  const d = (e.target as HTMLVideoElement).duration || 0;
                  setCurrentTime(t);
                  // ★ v1.5.5: Mark watched at 50% playback
                  if (d > 0 && t / d > 0.5) markWatched();
                  // ★ v1.9.0: Save resume position to server every 10s (cross-platform Win/Android/Web)
                  saveResumePosition(t);
                }}
                onEnded={() => { markWatched(); if (idx < playlist.length - 1) switchTo(idx + 1); }}
              />
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button onClick={() => switchTo(idx - 1)} disabled={idx === 0} style={{ ...modeBtnStyle, opacity: idx === 0 ? 0.4 : 1 }}>◀ Anterior</button>
            <button onClick={() => switchTo(idx + 1)} disabled={idx >= playlist.length - 1} style={{ ...modeBtnStyle, opacity: idx >= playlist.length - 1 ? 0.4 : 1 }}>Próxima ▶</button>
            <a href={videoSrc} download={currentFile.name} target="_blank" rel="noreferrer" style={{ ...modeBtnStyle, textDecoration: "none" }}>⬇ Baixar</a>
          </div>
          {/* Notes */}
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "10px", padding: "12px" }}>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)", marginBottom: "8px" }}>📝 Anotações</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Digite sua anotação..."
              style={{
                width: "100%", background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.09)", borderRadius: "6px",
                padding: "8px", color: "var(--text)", fontFamily: "inherit",
                fontSize: "13px", resize: "vertical", outline: "none",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
              <span onClick={seekToTime} style={{ cursor: "pointer", fontSize: "12px", color: "var(--teal)" }}>{fmtTime(currentTime)}</span>
              <button onClick={saveNote} style={{ background: "rgba(255,139,159,0.12)", border: "1px solid rgba(255,139,159,0.3)", color: "var(--pink)", borderRadius: "6px", padding: "4px 10px", fontSize: "12px", cursor: "pointer" }}>💾 Salvar</button>
            </div>
            <div style={{ marginTop: "8px" }}>
              {notesList.map((n, i) => (
                <div key={i} style={{ padding: "8px", borderRadius: "6px", background: "rgba(255,255,255,0.04)", marginTop: "6px", fontSize: "12px" }}>
                  <span style={{ color: "var(--teal)" }}>{n.time}</span> {n.text}
                </div>
              ))}
            </div>
          </div>
          {/* Playlist */}
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "10px", padding: "8px" }}>
            <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
              <button
                onClick={() => setPlaylistOpen(!playlistOpen)}
                style={{ ...modeBtnStyle, flex: 1, justifyContent: "flex-start", padding: "8px 10px", fontSize: "12px" }}
              >
                <strong>📋 Playlist</strong>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "6px" }}>{idx + 1} / {playlist.length}</span>
                <span style={{ marginLeft: "auto" }}>{playlistOpen ? "▲" : "▼"}</span>
              </button>
              <button
                onClick={async () => {
                  if (interfolderLoading || !currentFile) return;
                  setInterfolderLoading(true);
                  await onLoadInterfolder(currentFile);
                  setInterfolderLoading(false);
                  setPlaylistOpen(true);
                }}
                title="Carregar vídeos de pastas adjacentes (interfolder)"
                style={{ ...modeBtnStyle, padding: "8px 10px", fontSize: "12px", whiteSpace: "nowrap", background: interfolderLoading ? "rgba(255,139,159,0.2)" : "rgba(255,139,159,0.08)", borderColor: "rgba(255,139,159,0.3)" }}
              >
                {interfolderLoading ? "⏳" : "📂"} Interfolder
              </button>
            </div>
            {playlistOpen && (
              <div style={{
                overflowY: "auto", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "10px", padding: "6px", background: "rgba(0,0,0,0.2)",
                maxHeight: "240px", marginTop: "6px",
              }}>
                {playlist.map((v, i) => {
                  const vLink = v.link || "";
                  const isWatched = watchedSet.has(vLink);
                  return (
                  <div
                    key={v.id + i}
                    onClick={() => { if (i !== idx) switchTo(i); }}
                    title={v.name}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "6px 8px", borderRadius: "6px", cursor: "pointer", fontSize: "12px",
                      color: i === idx ? "var(--pink)" : isWatched ? "var(--teal)" : "var(--text-muted)",
                      background: i === idx ? "rgba(255,139,159,0.12)" : "transparent",
                      opacity: isWatched && i !== idx ? 0.7 : 1,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {i === idx ? "▶ " : isWatched ? "✓ " : "🎬 "}<span style={{ fontWeight: i === idx ? 600 : 400, textDecoration: isWatched && i !== idx ? "line-through" : "none" }}>{v.name}</span>
                    </div>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)", marginLeft: "8px" }}>{v.size > 0 ? `${(v.size / 1024 / 1024).toFixed(1)}MB` : ""}</span>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT — materials + ISA tabs */}
        <aside style={{
          display: "flex", flexDirection: "column", gap: "8px", minWidth: 0,
          overflow: "hidden", visibility: mode === "fv" ? "hidden" : "visible",
        }}>
          {/* Tabs */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {materialsLoading ? (
              <span style={{ fontSize: "12px", color: "var(--text-muted)", padding: "8px" }}>Buscando materiais…</span>
            ) : fileTabs.length === 0 ? (
              <span style={{ fontSize: "12px", color: "var(--text-muted)", padding: "8px" }}>Sem materiais na pasta</span>
            ) : (
              fileTabs.map(t => (
                <button
                  key={t.i}
                  onClick={() => showMaterial(t.i)}
                  style={tabStyle(activeTab.kind === "file" && activeTab.id === String(t.i))}
                >
                  <span style={{ fontSize: "16px" }}>{t.icon}</span>
                  <span style={{ fontSize: "13px", fontWeight: 600 }}>{t.label}</span>
                </button>
              ))
            )}
            {isaTabs.map(t => (
              <button
                key={t.id}
                onClick={() => showISA(t.id)}
                style={isaTabStyle(activeTab.kind === "isa" && activeTab.id === t.id)}
              >
                <span style={{ fontSize: "16px" }}>{t.icon}</span>
                <span style={{ fontSize: "13px", fontWeight: 600 }}>{t.label}</span>
              </button>
            ))}
          </div>
          {/* Status */}
          <div style={{ fontSize: "11px", color: "var(--text-muted)", padding: "2px 0", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <strong style={{ color: "var(--pink)" }}>📚 Materiais da aula</strong>
            <span>
              {materialsLoading ? "buscando…" : materials.length > 0 ? `${materials.length} material(is)` : "sem material"}
            </span>
            {/* ★ v1.5.0: AI source badge */}
            {aiSource && (
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "999px",
                  fontSize: "10px",
                  fontWeight: 600,
                  marginLeft: "auto",
                  background: aiSource === "local" ? "rgba(255,139,159,0.12)" : "rgba(139,148,158,0.12)",
                  color: aiSource === "local" ? "var(--pink)" : "var(--text-muted)",
                  border: aiSource === "local" ? "1px solid rgba(255,139,159,0.3)" : "1px solid rgba(139,148,158,0.2)",
                }}
                title={aiSource === "local" ? "Conteúdo gerado pela IA Local (WebLLM)" : "Conteúdo gerado pela IA da Nuvem"}
              >
                {aiSource === "local" ? "⚡ WebLLM" : aiSource === "llama" ? "🦙 llama.cpp" : "☁️ IA Nuvem"}
              </span>
            )}
          </div>
          {/* Body */}
          <div style={{
            background: "rgba(22,27,38,0.72)", border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: "16px", flex: 1, overflow: "hidden", minHeight: "420px",
          }}>
            {activeTab.kind === "file" && (
              <MaterialViewer
                file={materials[parseInt(activeTab.id)]}
                content={materialContent[parseInt(activeTab.id)]}
              />
            )}
            {activeTab.kind === "isa" && (
              <ISAPanel
                type={activeTab.id as "summary" | "questions" | "mindmap" | "flashcards"}
                cache={isaCache}
                loadingMsg={isaLoadingMsg}
                error={isaError}
                lessonName={currentFile.name}
                onRetry={() => showISA(activeTab.id as "summary" | "questions" | "mindmap" | "flashcards")}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MaterialViewer — PDF iframe / MD rendered / fallback link
// ═══════════════════════════════════════════════════════════════
function MaterialViewer({ file, content }: { file?: FileItem; content?: string }) {
  const [pdfSrc, setPdfSrc] = useState<string>("");
  const [pdfLoadedLink, setPdfLoadedLink] = useState<string>("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string>("");

  const pdfLinkKey = file?.link || "";
  useEffect(() => {
    setPdfError("");
    if (!file) { setPdfSrc(""); setPdfLoadedLink(""); return; }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext !== "pdf" || !file.link) { setPdfSrc(""); setPdfLoadedLink(""); return; }
    // ★ v1.9.1: Only skip download if we ALREADY loaded THIS exact link
    if (pdfLoadedLink === file.link && pdfSrc) return;
    setPdfLoading(true);
    setPdfSrc(""); // Clear old PDF while loading new one
    const link = file.link.startsWith("http") ? file.link : (BASE_URL + file.link);
    const pdfLink = link.includes("inline=") ? link : link + (link.includes("?") ? "&" : "?") + "inline=true";
    downloadToTemp(pdfLink)
      .then((path) => {
        const src = convertFileSrc(path);
        setPdfSrc(src);
        setPdfLoadedLink(file.link!);
        setPdfLoading(false);
      })
      .catch((e) => {
        setPdfError(String(e));
        setPdfLoading(false);
      });
  }, [pdfLinkKey]);

  if (!file) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
        <div style={{ fontSize: "34px", marginBottom: "8px" }}>📄</div>
        Selecione um material.
      </div>
    );
  }
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  let link = file.link ? (file.link.startsWith("http") ? file.link : (BASE_URL + file.link)) : "";

  if (ext === "pdf") {
    if (pdfLoading) {
      return (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", border: "3px solid rgba(255,139,159,0.3)", borderTopColor: "var(--pink)", margin: "0 auto 14px", animation: "meggy-spin 1s linear infinite" }} />
          <div>Baixando PDF…</div>
          <style>{`@keyframes meggy-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }
    if (pdfError) {
      return (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--pink)" }}>
          <div style={{ fontSize: "34px", marginBottom: "8px" }}>⚠️</div>
          <div>Erro ao carregar PDF: {pdfError}</div>
          <a href={link} download={file.name} target="_blank" rel="noreferrer" style={{ ...modeBtnStyle, marginTop: "12px", textDecoration: "none", display: "inline-block" }}>⬇ Baixar</a>
        </div>
      );
    }
    if (pdfSrc) {
      return <iframe src={pdfSrc} style={{ width: "100%", height: "100%", border: "none", borderRadius: "16px" }} title={file.name} />;
    }
    return <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>Carregando…</div>;
  }
  if ((ext === "md" || ext === "txt" || ext === "html") && link) {
    if (content === undefined) {
      return <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>Carregando…</div>;
    }
    if (!content) {
      return <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>Vazio.</div>;
    }
    return (
      <div style={{ width: "100%", height: "100%", overflow: "auto" }}>
        <div style={{
          marginBottom: "12px", padding: "8px 12px",
          background: "rgba(255,139,159,0.08)", border: "1px solid rgba(255,139,159,0.2)",
          borderRadius: "8px 8px 0 0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          position: "sticky", top: 0, zIndex: 2, backdropFilter: "blur(8px)",
        }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>📃 {file.name}</span>
          <a
            href={link}
            download={file.name}
            target="_blank"
            rel="noreferrer"
            style={{
              background: "rgba(255,139,159,0.12)", border: "1px solid rgba(255,139,159,0.3)",
              color: "var(--pink)", borderRadius: "6px", padding: "4px 10px", fontSize: "12px",
              textDecoration: "none",
            }}
          >⬇ Baixar</a>
        </div>
        <div
          style={{ padding: "16px", color: "var(--text)", fontSize: "14px", lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: mdToHtml(content) }}
        />
      </div>
    );
  }
  if (link) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <a href={link} target="_blank" rel="noreferrer" style={{ ...btnStyle, textDecoration: "none" }}>⬇ Abrir</a>
      </div>
    );
  }
  return <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>Sem preview</div>;
}

// ═══════════════════════════════════════════════════════════════
// ISAPanel — Resumo / Questões / Pílulas / Flashcards
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// IsaToolbar — toolbar with PDF download + Copy buttons (v1.6.9)
// ═══════════════════════════════════════════════════════════════
function IsaToolbar({ content, lessonName, label }: { content: string; lessonName: string; label: string }) {
  const [copied, setCopied] = useState(false);

  function downloadPdf() {
    // ★ v1.6.9: Open a new window with styled HTML and trigger print-to-PDF
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${label} — ${lessonName}</title>
      <style>
        body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #1a1a1a; line-height: 1.7; }
        h1 { color: #d6336c; border-bottom: 2px solid #d6336c; padding-bottom: 8px; }
        h2 { color: #c026d3; margin-top: 28px; }
        h3 { color: #6f42c1; }
        pre { background: #f6f8fa; padding: 12px; border-radius: 6px; overflow: auto; font-size: 13px; }
        code { background: #f6f8fa; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
        table { border-collapse: collapse; width: 100%; margin: 12px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f6f8fa; }
        blockquote { border-left: 4px solid #d6336c; margin: 12px 0; padding: 8px 16px; background: #fff5f8; }
        @media print { body { margin: 0; } }
      </style></head><body><h1>🐩 Meggy — ${label}</h1><p><strong>Aula:</strong> ${lessonName}</p><hr>
      ${mdToHtml(content)}</body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => { w.print(); }, 500);
    }
  }

  async function copyContent() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) { /* ignore */ }
  }

  return (
    <div style={{
      display: "flex", gap: "8px", padding: "8px 12px",
      background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)",
      alignItems: "center", flexShrink: 0,
    }}>
      <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>{label}</span>
      <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
        <button onClick={downloadPdf} title="Baixar como PDF" style={{ ...modeBtnStyle, padding: "4px 10px", fontSize: "12px" }}>📄 PDF</button>
        <button onClick={copyContent} title="Copiar texto" style={{ ...modeBtnStyle, padding: "4px 10px", fontSize: "12px" }}>{copied ? "✓ Copiado" : "📋 Copiar"}</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ISAPanel — Inline Study Assistant panel (summary/questions/mindmap/flashcards)
// ═══════════════════════════════════════════════════════════════
function ISAPanel({
  type, cache, loadingMsg, error, lessonName, onRetry,
}: {
  type: "summary" | "questions" | "mindmap" | "flashcards";
  cache: Record<string, unknown> | null;
  loadingMsg: string | null;
  error: string | null;
  lessonName: string;
  onRetry: () => void;
}) {
  if (loadingMsg) {
    return (
      <div style={{ maxWidth: "560px", margin: "0 auto", padding: "30px 20px", textAlign: "center" }}>
        <div style={{
          width: "40px", height: "40px", borderRadius: "50%",
          border: "3px solid rgba(255,139,159,0.3)", borderTopColor: "var(--pink)",
          margin: "0 auto 14px", animation: "meggy-spin 1s linear infinite",
        }} />
        <div style={{ fontSize: "13px", lineHeight: 1.6, color: "var(--text)", whiteSpace: "pre-wrap" }}>{loadingMsg}</div>
        <div style={{ marginTop: "14px", fontSize: "11px", color: "var(--text-muted)", fontStyle: "italic" }}>
          ℹ️ Não feche esta aba — a geração continua em segundo plano.
        </div>
        <style>{`@keyframes meggy-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: "20px", color: "var(--pink)", textAlign: "center" }}>
        <div style={{ fontSize: "36px", marginBottom: "12px" }}>⚠️</div>
        <div style={{ fontWeight: 600, marginBottom: "8px" }}>Erro ao gerar conteúdo</div>
        <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>{error}</div>
        <button onClick={onRetry} style={{
          padding: "8px 16px",
          background: "linear-gradient(135deg,#ff8b9f,#c026d3)", color: "#fff",
          border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: 600,
        }}>↻ Tentar novamente</button>
      </div>
    );
  }
  if (!cache) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
        <div style={{ fontSize: "32px", marginBottom: "12px" }}>⭐</div>
        <div style={{ marginBottom: "12px" }}>Conteúdo não gerado ainda.</div>
        <button onClick={onRetry} style={btnStyle}>Gerar agora</button>
      </div>
    );
  }

  if (type === "summary") {
    const v = cache.summary as string | null | undefined;
    if (!v) return <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>Não foi possível gerar o resumo. Tente novamente.</div>;
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <IsaToolbar content={v} lessonName={lessonName} label="Resumo" />
        <div
          style={{ flex: 1, overflow: "auto", padding: "16px", color: "var(--text)", fontSize: "14px", lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: mdToHtml(v) }}
        />
      </div>
    );
  }
  if (type === "mindmap") {
    const v = cache.mindmap as string | null | undefined;
    if (!v) return <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>Não foi possível gerar pílulas. Tente novamente.</div>;
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <IsaToolbar content={v} lessonName={lessonName} label="Pílulas" />
        <div
          style={{ flex: 1, overflow: "auto", padding: "16px", color: "var(--text)", fontSize: "14px", lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: mdToHtml(v) }}
        />
      </div>
    );
  }
  if (type === "questions") {
    const qs = cache.questions as QuizQuestion[] | null | undefined;
    if (!qs || !qs.length) return <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>Não foi possível gerar questões. Tente novamente.</div>;
    return <QuizView questions={qs} />;
  }
  if (type === "flashcards") {
    const fs = cache.flashcards as { f: string; b: string; type?: string }[] | null | undefined;
    if (!fs || !fs.length) return <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>Sem flashcards. Gere as questões primeiro.</div>;
    return <FlashcardDeck flashcards={fs} />;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// QuizView — interactive quiz
// ═══════════════════════════════════════════════════════════════
function QuizView({ questions }: { questions: QuizQuestion[] }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const score = questions.reduce((acc, q, i) => acc + (answers[i] === q.correct ? 1 : 0), 0);

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "16px" }}>
      {submitted && (
        <div style={{
          padding: "12px 16px", background: "rgba(93,222,218,0.08)",
          border: "1px solid rgba(93,222,218,0.3)", borderRadius: "8px",
          marginBottom: "16px", color: "var(--teal)", fontWeight: 600,
        }}>
          🎯 Pontuação: {score} / {questions.length}
        </div>
      )}
      {questions.map((q, i) => {
        const selected = answers[i];
        return (
          <div key={i} style={{ marginBottom: "20px", padding: "14px", background: "rgba(255,255,255,0.03)", borderRadius: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)", marginBottom: "10px" }}>
              <span style={{ color: "var(--pink)", marginRight: "6px" }}>{i + 1}.</span>
              {q.statement}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {q.options.map((opt, j) => {
                const isSelected = selected === j;
                const isCorrect = q.correct === j;
                const showColor = submitted && (isSelected || isCorrect);
                return (
                  <button
                    key={j}
                    onClick={() => !submitted && setAnswers(prev => ({ ...prev, [i]: j }))}
                    style={{
                      padding: "8px 12px", borderRadius: "6px",
                      cursor: submitted ? "default" : "pointer",
                      background: showColor
                        ? (isCorrect ? "rgba(93,222,218,0.15)" : "rgba(255,139,159,0.15)")
                        : (isSelected ? "rgba(255,139,159,0.08)" : "rgba(255,255,255,0.03)"),
                      border: showColor
                        ? (isCorrect ? "1px solid rgba(93,222,218,0.5)" : "1px solid rgba(255,139,159,0.5)")
                        : (isSelected ? "1px solid rgba(255,139,159,0.3)" : "1px solid rgba(255,255,255,0.08)"),
                      color: "var(--text)", textAlign: "left", fontSize: "13px",
                    }}
                  >
                    {q.type === "mc" ? `${String.fromCharCode(65 + j)}) ` : ""}{opt}
                    {submitted && isCorrect && " ✓"}
                    {submitted && isSelected && !isCorrect && " ✗"}
                  </button>
                );
              })}
            </div>
            {submitted && (q.explanation || q.legalText || q.fundamentacao) && (
              <div style={{
                marginTop: "10px", padding: "10px",
                background: "rgba(255,255,255,0.04)", borderRadius: "6px",
                fontSize: "12px", color: "var(--text-muted)",
              }}>
                {q.legalText && <div style={{ marginBottom: "4px" }}>⚖️ <strong>{q.legalText}</strong></div>}
                {q.explanation && <div style={{ marginBottom: "4px" }}>💡 {q.explanation}</div>}
                {q.fundamentacao && <div>📚 {q.fundamentacao}</div>}
              </div>
            )}
          </div>
        );
      })}
      {!submitted ? (
        <button
          onClick={() => setSubmitted(true)}
          style={{
            padding: "10px 20px", background: "linear-gradient(135deg,#ff8b9f,#c026d3)",
            color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer",
            fontSize: "14px", fontWeight: 600,
          }}
        >Enviar respostas</button>
      ) : (
        <button
          onClick={() => { setSubmitted(false); setAnswers({}); }}
          style={{ ...btnStyle, marginTop: "8px" }}
        >↺ Refazer</button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FlashcardDeck — flip card UI
// ═══════════════════════════════════════════════════════════════
function FlashcardDeck({ flashcards }: { flashcards: { f: string; b: string; type?: string }[] }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = flashcards[i];

  if (!card) return null;
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "16px", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>
        Card {i + 1} / {flashcards.length} {flipped ? "(verso)" : "(frente)"}
      </div>
      <div
        onClick={() => setFlipped(!flipped)}
        style={{
          width: "100%", maxWidth: "500px", minHeight: "240px", padding: "24px",
          background: "linear-gradient(135deg,rgba(255,139,159,0.05),rgba(192,38,211,0.05))",
          border: "1px solid rgba(255,139,159,0.2)", borderRadius: "16px",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          textAlign: "center", fontSize: "14px", color: "var(--text)", lineHeight: 1.6,
          whiteSpace: "pre-wrap",
        }}
      >
        {flipped ? card.b : card.f}
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
        <button
          onClick={() => { setI(Math.max(0, i - 1)); setFlipped(false); }}
          disabled={i === 0}
          style={{ ...btnStyle, opacity: i === 0 ? 0.4 : 1 }}
        >◀ Anterior</button>
        <button
          onClick={() => setFlipped(!flipped)}
          style={{ ...btnStyle, background: "rgba(255,139,159,0.12)", borderColor: "rgba(255,139,159,0.3)", color: "var(--pink)" }}
        >{flipped ? "← Verso" : "Virar →"}</button>
        <button
          onClick={() => { setI(Math.min(flashcards.length - 1, i + 1)); setFlipped(false); }}
          disabled={i >= flashcards.length - 1}
          style={{ ...btnStyle, opacity: i >= flashcards.length - 1 ? 0.4 : 1 }}
        >Próxima ▶</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Shared UI components
// ═══════════════════════════════════════════════════════════════
function Breadcrumb({
  drive, path, onCrumb, onRoot,
}: {
  drive: Drive | null;
  path: string;
  onCrumb: (index: number) => void;
  onRoot: () => void;
}) {
  if (!drive) return null;
  const parts = path.split("/").filter(Boolean);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", minWidth: 0 }}>
      <button onClick={onRoot} style={{ ...btnStyle, padding: "4px 8px", fontSize: "12px" }} title="Voltar para drives">☁️ Drives</button>
      {parts.map((part, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>/</span>
          <button
            onClick={() => onCrumb(i)}
            style={{
              ...btnStyle, padding: "4px 8px", fontSize: "12px",
              maxWidth: "160px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
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

function Header({
  onBack, onHome, onLogout, breadcrumb, aiMode, localAiReady, onToggleAI, onManageAI,
}: {
  onBack: (() => void) | null;
  onHome: (() => void) | null;
  onLogout: () => void;
  breadcrumb: React.ReactNode;
  aiMode: "local" | "cloud" | "llama";
  localAiReady: boolean;
  onToggleAI: () => void;
  onManageAI: () => void;
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
        {onHome && (
          <button onClick={onHome} style={{ ...btnStyle, flexShrink: 0 }} title="Voltar à tela inicial">🏠 Home</button>
        )}
        <span style={{ color: "var(--pink)", fontWeight: 700, fontSize: "18px", flexShrink: 0 }}>🐩 Meggy</span>
        {breadcrumb}
      </div>
      <div style={{ display: "flex", gap: "6px", flexShrink: 0, alignItems: "center" }}>
        <button
          onClick={onToggleAI}
          title={aiMode === "local" ? "WebLLM ativo (clique para llama.cpp)" : aiMode === "llama" ? "llama.cpp ativo (clique para nuvem)" : "IA da Nuvem ativa (clique para WebLLM)"}
          style={{
            ...modeBtnStyle,
            background: aiMode === "local" ? "linear-gradient(135deg,#ff8b9f,#c026d3)" : aiMode === "llama" ? "linear-gradient(135deg,#5ddeda,#3fb950)" : "var(--surface-2)",
            color: aiMode === "local" || aiMode === "llama" ? "#fff" : "var(--text)",
            borderColor: aiMode === "local" || aiMode === "llama" ? "transparent" : "var(--border)",
            opacity: aiMode === "local" && !localAiReady ? 0.6 : 1,
          }}
        >
          {aiMode === "local" ? "⚡ WebLLM" : aiMode === "llama" ? "🦙 llama.cpp" : "☁️ IA Nuvem"}
        </button>
        <button
          onClick={onManageAI}
          title="Gerenciar IA Local (instalar/desinstalar modelos)"
          style={{ ...modeBtnStyle, padding: "6px 10px" }}
        >
          ⚙️
        </button>
        <button onClick={onLogout} style={{ ...btnStyle, flexShrink: 0 }}>Sair</button>
      </div>
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
        {isFolder && <div style={{ color: "var(--teal)", fontSize: "11px", marginTop: "2px" }}>Abrir pasta →</div>}
        {(isVideo || isAudio) && <div style={{ color: "var(--teal)", fontSize: "11px", marginTop: "2px" }}>▶ Reproduzir</div>}
      </div>
    </div>
  );
}

// ─── Button styles ───
const btnStyle: React.CSSProperties = {
  padding: "8px 16px", background: "var(--surface-2)", color: "var(--text)",
  border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer", fontSize: "14px",
};

const modeBtnStyle: React.CSSProperties = {
  padding: "6px 12px", background: "var(--surface-2)", color: "var(--text)",
  border: "1px solid var(--border)", borderRadius: "999px", cursor: "pointer",
  fontSize: "13px", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: "6px",
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: "6px",
    padding: "7px 12px",
    background: active ? "#1f6feb" : "rgba(255,255,255,0.06)",
    border: `1px solid ${active ? "#1f6feb" : "rgba(255,255,255,0.12)"}`,
    borderRadius: "999px", cursor: "pointer",
    fontSize: "13px", fontWeight: 500,
    color: active ? "#fff" : "#c9d1d9",
    fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap",
  };
}

function isaTabStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: "6px",
    padding: "7px 12px",
    background: active ? "#7c4dff" : "rgba(124,77,255,0.08)",
    border: `1px solid ${active ? "#7c4dff" : "rgba(124,77,255,0.2)"}`,
    borderRadius: "999px", cursor: "pointer",
    fontSize: "13px", fontWeight: 500,
    color: active ? "#fff" : "#a78bfa",
    fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap",
  };
}
