// ═══════════════════════════════════════════════════════════════
// Home Page — Grid de drives + navegação de pastas + player inline (v1.4.4)
// Replica do _playVideoInline da web (layout Alfacon 2 colunas)
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { aiCacheGet, aiCacheSave, aiGenerate, fetchText, extractPdfText } from "../lib/api";

interface Drive { index: number; name: string; }
interface FileItem { name: string; mime_type: string; id: string; link: string | null; size: number; }

const BASE_URL = "https://educa.eu.org";

// ─── Markdown → HTML (simple regex, escape-first) ───
function mdToHtml(md: string): string {
  if (!md) return "";
  let h = md
    .replace(/&/g, "&amp;")
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
  const [view, setView] = useState<"drives" | "browse" | "player">("drives");
  const [playlist, setPlaylist] = useState<FileItem[]>([]);
  const [playerIndex, setPlayerIndex] = useState(0);

  useEffect(() => { loadDrives(); }, []);

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
    const newPath = currentPath.endsWith("/")
      ? `${currentPath}${file.name}/`
      : `${currentPath}/${file.name}/`;
    setCurrentPath(newPath);
    await loadFolder(currentDrive, newPath);
  }

  function navigateToBreadcrumb(index: number) {
    if (!currentDrive) return;
    const parts = currentPath.split("/").filter(Boolean);
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

  function backToBrowse() {
    setView("browse");
    setPlaylist([]);
    setPlayerIndex(0);
  }

  function openPlayer(file: FileItem) {
    // Build playlist from videos/audios in current folder
    const pl = files.filter(f =>
      f.mime_type.startsWith("video/") || f.name.endsWith(".mp4") ||
      f.mime_type.startsWith("audio/") || f.name.endsWith(".mp3") || f.name.endsWith(".m4a")
    );
    const idx = pl.findIndex(f => f.id === file.id);
    setPlaylist(pl.length > 0 ? pl : [file]);
    setPlayerIndex(idx >= 0 ? idx : 0);
    setView("player");
  }

  async function logout() {
    await invoke("logout");
    onLogout();
  }

  // ─── Player view ───
  if (view === "player" && currentDrive && playlist.length > 0) {
    return (
      <PlayerView
        drive={currentDrive}
        folderPath={currentPath}
        playlist={playlist}
        initialIndex={playerIndex}
        onBack={backToBrowse}
        onLogout={logout}
        onNavigateBreadcrumb={navigateToBreadcrumb}
        onHome={backToDrives}
      />
    );
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
                    else if (isVideo || isAudio) openPlayer(file);
                  }}
                />
              ))}
            </div>
          )}
        </div>
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

// ═══════════════════════════════════════════════════════════════
// PlayerView — 2-column inline player (video | materials)
// ═══════════════════════════════════════════════════════════════
function PlayerView({
  drive, folderPath, playlist, initialIndex, onBack, onLogout, onNavigateBreadcrumb, onHome,
}: {
  drive: Drive;
  folderPath: string;
  playlist: FileItem[];
  initialIndex: number;
  onBack: () => void;
  onLogout: () => void;
  onNavigateBreadcrumb: (i: number) => void;
  onHome: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const [mode, setMode] = useState<"split" | "fv" | "fm">("split");
  const [materials, setMaterials] = useState<FileItem[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<{ kind: "file" | "isa"; id: string }>({ kind: "file", id: "0" });
  const [isaCache, setIsaCache] = useState<Record<string, unknown> | null>(null);
  const [isaLoadingMsg, setIsaLoadingMsg] = useState<string | null>(null);
  const [isaError, setIsaError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notesList, setNotesList] = useState<{ time: string; text: string }[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [materialContent, setMaterialContent] = useState<Record<number, string>>({});
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isaGenRef = useRef<string>("");

  const currentFile = playlist[idx];
  const videoSrc = currentFile?.link ? `${BASE_URL}${currentFile.link}` : "";
  const isAudio = currentFile
    ? (currentFile.mime_type.startsWith("audio/") || currentFile.name.endsWith(".mp3") || currentFile.name.endsWith(".m4a"))
    : false;

  // ─── Load materials ───
  const loadMaterials = useCallback(async () => {
    if (!folderPath) return;
    setMaterialsLoading(true);
    setMaterials([]);
    setActiveTab({ kind: "file", id: "0" });
    setMaterialContent({});
    try {
      const here = await invoke<FileItem[]>("list_folder", {
        driveIndex: drive.index,
        path: folderPath,
      });
      const isMaterial = (x: FileItem) => {
        const ext = (x.name.split(".").pop() || "").toLowerCase();
        const mt = (x.mime_type || "").toLowerCase();
        return ext === "pdf" || mt.includes("pdf") || ext === "md" ||
          mt.includes("markdown") || ext === "txt" || mt === "text/plain" ||
          ext === "html" || mt.includes("html");
      };
      let found = here.filter(isMaterial);
      if (!found.length) {
        const subs = here.filter(x => x.mime_type === "application/vnd.google-apps.folder").slice(0, 20);
        for (const sf of subs) {
          const subPath = folderPath + encodeURIComponent(sf.name) + "/";
          try {
            const subFiles = await invoke<FileItem[]>("list_folder", { driveIndex: drive.index, path: subPath });
            const subMats = subFiles.filter(isMaterial);
            if (subMats.length) { found = found.concat(subMats); break; }
          } catch (_) { /* skip */ }
        }
      }
      if (!found.length) {
        const parts = folderPath.split("/").filter(Boolean);
        const parentPath = "/" + parts.slice(0, -1).join("/") + "/";
        if (parentPath !== "/" && parentPath !== folderPath) {
          try {
            const parentFiles = await invoke<FileItem[]>("list_folder", { driveIndex: drive.index, path: parentPath });
            found = parentFiles.filter(isMaterial);
          } catch (_) { /* skip */ }
        }
      }
      setMaterials(found.slice(0, 12));
    } catch (e) {
      console.error("loadMaterials", e);
      setMaterials([]);
    }
    setMaterialsLoading(false);
  }, [drive.index, folderPath]);

  useEffect(() => { loadMaterials(); }, [loadMaterials]);

  useEffect(() => { setIdx(initialIndex); }, [initialIndex]);

  // Reset ISA state + active tab on video change
  useEffect(() => {
    setIsaCache(null);
    setIsaError(null);
    setIsaLoadingMsg(null);
    isaGenRef.current = videoSrc;
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

  const isaCacheKey = useMemo(() => {
    if (!currentFile) return "";
    let raw: string;
    try { raw = decodeURIComponent(folderPath + currentFile.name); }
    catch (_) { raw = folderPath + currentFile.name; }
    return encodeURI(raw);
  }, [folderPath, currentFile]);

  function switchTo(newIdx: number) {
    if (newIdx < 0 || newIdx >= playlist.length) return;
    setIdx(newIdx);
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
        const here = await invoke<FileItem[]>("list_folder", { driveIndex: drive.index, path: folderPath });
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
            const subPath = folderPath + encodeURIComponent(sf.name) + "/";
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
              const subPath = folderPath + encodeURIComponent(sf.name) + "/";
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

      const courseName = folderPath.split("/").filter(Boolean).slice(-1)[0] || "";
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
      setIsaLoadingMsg(`✨ Gerando resumo + pílulas + questões${matSource ? " (fonte: " + matSource + ")" : ""}…\nIsto pode levar 30-60s.`);

      const callIsa = async (prompt: string, kind: string): Promise<string> => {
        try { return await aiGenerate(prompt, kind); }
        catch (e) { console.warn("callIsa", kind, e); return ""; }
      };

      const [summaryR, mindmapR, questionsR] = await Promise.all([
        (async (): Promise<string> => {
          for (let i = 0; i < RESUMO_PROMPTS.length; i++) {
            const r = await callIsa(RESUMO_PROMPTS[i], "resumo");
            if (r && r.length > 200) return r;
          }
          return "";
        })(),
        callIsa(PILULAS_PROMPT, "mindmap"),
        callIsa(QUESTOES_PROMPT, "questoes"),
      ]);

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
        <button onClick={onBack} style={{ ...btnStyle, marginLeft: "12px" }}>← Voltar</button>
      </div>
    );
  }

  const fileSize = currentFile.size > 0 ? `${(currentFile.size / 1024 / 1024).toFixed(1)} MB` : "";
  const parts = folderPath.split("/").filter(Boolean);

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
          <button onClick={onBack} style={{ ...btnStyle, flexShrink: 0 }}>← Voltar</button>
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
        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
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
                ref={videoRef}
                src={videoSrc}
                controls
                autoPlay
                playsInline
                style={{ display: "block", width: "100%", maxHeight: "60vh", background: "#000" }}
                onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
                onEnded={() => { if (idx < playlist.length - 1) switchTo(idx + 1); }}
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
            <button
              onClick={() => setPlaylistOpen(!playlistOpen)}
              style={{ ...modeBtnStyle, width: "100%", justifyContent: "flex-start", padding: "8px 10px", fontSize: "12px" }}
            >
              <strong>📋 Playlist</strong>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "6px" }}>{idx + 1} / {playlist.length}</span>
              <span style={{ marginLeft: "auto" }}>{playlistOpen ? "▲" : "▼"}</span>
            </button>
            {playlistOpen && (
              <div style={{
                overflowY: "auto", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "10px", padding: "6px", background: "rgba(0,0,0,0.2)",
                maxHeight: "240px", marginTop: "6px",
              }}>
                {playlist.map((v, i) => (
                  <div
                    key={v.id + i}
                    onClick={() => { if (i !== idx) switchTo(i); }}
                    title={v.name}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "6px 8px", borderRadius: "6px", cursor: "pointer", fontSize: "12px",
                      color: i === idx ? "var(--pink)" : "var(--text-muted)",
                      background: i === idx ? "rgba(255,139,159,0.12)" : "transparent",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {i === idx ? "▶ " : "🎬 "}<span style={{ fontWeight: i === idx ? 600 : 400 }}>{v.name}</span>
                    </div>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)", marginLeft: "8px" }}>{v.size > 0 ? `${(v.size / 1024 / 1024).toFixed(1)}MB` : ""}</span>
                  </div>
                ))}
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
          <div style={{ fontSize: "11px", color: "var(--text-muted)", padding: "2px 0" }}>
            <strong style={{ color: "var(--pink)" }}>📚 Materiais da aula</strong>
            <span style={{ marginLeft: "8px" }}>
              {materialsLoading ? "buscando…" : materials.length > 0 ? `${materials.length} material(is)` : "sem material"}
            </span>
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
  if (ext === "pdf" && link && !link.includes("inline=")) {
    link += (link.includes("?") ? "&" : "?") + "inline=true";
  }

  if (ext === "pdf" && link) {
    return <iframe src={link} style={{ width: "100%", height: "100%", border: "none", borderRadius: "16px" }} title={file.name} />;
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
      <div
        style={{ height: "100%", overflow: "auto", padding: "16px", color: "var(--text)", fontSize: "14px", lineHeight: 1.6 }}
        dangerouslySetInnerHTML={{ __html: mdToHtml(v) }}
      />
    );
  }
  if (type === "mindmap") {
    const v = cache.mindmap as string | null | undefined;
    if (!v) return <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>Não foi possível gerar pílulas. Tente novamente.</div>;
    return (
      <div
        style={{ height: "100%", overflow: "auto", padding: "16px", color: "var(--text)", fontSize: "14px", lineHeight: 1.6 }}
        dangerouslySetInnerHTML={{ __html: mdToHtml(v) }}
      />
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
