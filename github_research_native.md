# Pesquisa GitHub — Apps Nativos Windows de Streaming/Estudo

**Task ID:** `GITHUB-RESEARCH-NATIVE-APP`
**Data:** 2026-10-20
**Objetivo:** Identificar apps nativos Windows (Tauri, Electron, Rust puro) de streaming e estudo que possam servir de inspiração para o app Meggy nativo.
**Metodologia:** Pesquisa direta no GitHub via `agent-browser` em 4 queries. Somente pesquisa e documentação — nenhum código do projeto foi alterado.

---

## Resumo Executivo

Foram analisadas **4 queries** no GitHub (`tauri streaming app`, `tauri video player`, `electron study app`, `rust desktop video player`) cobrindo **~350 repositórios**. Destes, **10 foram analisados em profundidade** (README completo + estrutura de pastas). O resultado indica claramente que:

1. **Tauri 2 + Rust + React/Vue/Svelte** é o stack dominante para players de vídeo nativos modernos no Windows.
2. **libmpv via FFI** é o padrão de- facto para playback de qualidade (L-MPV, frame-player, glucose). Tauri 2 + libmpv renderiza em child view nativa com webview HTML transparente por cima — exatamente o padrão que Meggy deveria adotar para 4K/HDR.
3. **SQLite local (modo WAL)** é o padrão para bibliotecas/progresso/histórico — alinhado com o que Meggy já planeja.
4. **Whisper on-device** para legendas (glucose) e **AI upscaling** (L-MPV) mostram que IA local virou commodity.
5. **Streaming de torrent com piece-prioritization** (frame-player) e **watch-together sincronizado** (frame-player) são features de ponta que agregam muito a um app de cursos/streaming.
6. **App de estudo (iFralex/IELTS-Study)** prova que flashcards com spaced repetition + AI tutor + analytics + SQLite é viável em Electron. Meggy já tem essas features em JS — porta para Rust/Tauri seria direta.
7. **OmniSpeed** (controle de velocidade global 0.25×–16× entre browsers e players desktop via atalho global) é um diferencial agressivo para um app de estudo (usuários assistem cursos em 2×–3×).

---

## Queries executadas

| # | URL | Resultados |
|---|-----|-----------|
| 1 | `https://github.com/search?q=tauri+streaming+app&type=repositories` | 109 repos |
| 2 | `https://github.com/search?q=tauri+video+player&type=repositories` | 70 repos |
| 3 | `https://github.com/search?q=electron+study+app&type=repositories` | 160 repos |
| 4 | `https://github.com/search?q=rust+desktop+video+player&type=repositories` | 15 repos |

---

## Repositórios analisados em profundidade

### 1. KeyRotate/LibreTV-App ⭐ 892
- **URL:** https://github.com/KeyRotate/LibreTV-App
- **Stars:** 892 · Forks: 252 · Commits: 173
- **Tecnologia:** Tauri 2.0 + HTML/CSS/Vanilla JS + Tailwind CSS
- **Plataformas:** Windows, macOS, Linux, Android (multi-platform nativo)
- **Features principais:**
  - Agregador de múltiplas fontes de vídeo online (filmes, séries, anime, variedades)
  - Filtros avançados (Douban hot, gêneros)
  - **Instalação zero-config** — baixa o installer e usa, sem backend próprio
  - API/proxy embutida para contornar CORS
  - Build distribuído via GitHub Actions
  - Código 100% aberto, sem tracking/anúncios
- **Inspiração para Meggy:**
  - **Multiplataforma nativa Tauri 2** incluindo Android — mesmo binário cobre desktop + mobile
  - **API/proxy embutida** para resolver CORS e cross-origin de fontes remotas (Google Drive, etc.) — pattern direto para o caso de Meggy
  - **GitHub Actions auto-build** com draft releases por tag — modelo de CI/CD pronto para copiar
  - UI Tailwind que funciona em telas pequenas e grandes

---

### 2. rudi-q/glucose_media_player ⭐ 117
- **URL:** https://github.com/rudi-q/glucose_media_player
- **Stars:** 117
- **Tecnologia:** Tauri + Svelte + Rust
- **Plataformas:** Windows (com planejamento multi-OS)
- **Licença:** EUPL-1.2
- **Features principais:**
  - **Whisper AI on-device** para geração de legendas 100% local, sem internet
  - Suporte universal de legendas: `.srt`, `.vtt`, `.ass`, extração embutida em MKV/MP4
  - **"Up Next" overlay** estilo Netflix com countdown para próximo episódio
  - **Picture-in-Picture** draggable com snap-to-corners
  - **Smart Gallery** com preview por hover (frame do vídeo sincronizado com progresso)
  - **Agrupamento temporal** automático (Today, Yesterday…)
  - **Custom libraries** — usuário escolhe quais pastas escanear
  - Visualizador de áudio dinâmico
  - Dual audio com remux em tempo real
  - **Booster de volume 200%** via Web Audio API
  - Cinematic blur background + Glassmorphic UI
  - Fade in/out transitions
  - Zero telemetria — detecta placeholders de cloud (OneDrive) sem upload
- **Inspiração para Meggy:**
  - **Whisper local para transcrição de aulas** → base para gerar resumos/flashcards automaticamente
  - **"Up Next" overlay** para playlists de aulas (autoplay próxima com countdown)
  - **Hover preview na galeria** — melhoria massiva de UX na lista de cursos/aulas
  - **Agrupamento temporal** (Hoje, Ontem) para "Continue assistindo"
  - **Custom libraries** para o usuário apontar pasta local de PDFs/vídeos
  - **Booster de volume** para aulas com áudio baixo
  - Padrão de **glassmorphic UI** que o Meggy já usa no web

---

### 3. Menely/L-MPV ⭐ 22 (alta densidade de tecnologia)
- **URL:** https://github.com/Menely/L-MPV
- **Stars:** 22 (subestimado — projeto extremamente sofisticado)
- **Tecnologia:** Tauri v2 + React 19 + TypeScript 5.8 + Vite 7 + Rust (2021) + libmpv-2.dll (FFI dinâmico via `libloading`) + Direct3D 11 + ONNX/DirectML/TensorRT + MediaInfo.dll + WASAPI + FFmpeg
- **Plataformas:** Windows 10/11 x64
- **Features principais:**
  - **Real-Time 4K AI Upscaling** (vf_animejanai + ONNX + DirectML/TensorRT)
  - Engine: `vo=gpu-next` + Direct3D 11 + HDR tone-mapping
  - **WASAPI loopback capture** com FFT 1024 para visualizador
  - Hardware Letterbox Illumination (blur ambiental via GPU shader)
  - Studio Audiophile: 32-tap Sinc Resampler, 150% volume boost, downmix 5.1/7.1
  - **Track management & 1-click export** (popover + FFmpeg `-c copy`)
  - **Interactive Subtitle Browser & Inspector** com full-text search e live speech tracking
  - Glassmorphic UX/UI premium com design system
  - **Interactive Timeline** com Neon Pulse Wave e live scrubbing
  - Hardware Zoom & Pan + mouse wheel controls
  - Smart Fullscreen & Window Management
  - Clipboard integration + clean screenshots
  - **Modular Presets System** + configuration files
  - **Customizable Context Menu** com drag-and-drop editor (@dnd-kit)
  - Atomic writes, anti-stuttering, process ownership
  - **Update Integrity Verification** (BLAKE3 + checksums) com rollback
  - Modular Audio Pipeline com dynamic normalization + Night Mode
- **Inspiração para Meggy:**
  - **Arquitetura Tauri 2 + libmpv FFI** é exatamente o caminho para playback 4K/HDR com aceleração de hardware
  - Padrão **True Portable Architecture (Zero-Install)** — tudo na pasta do app (config, cache, screenshots, models ONNX, dlls) — excelente para distribuição portable do Meggy
  - **Modular Presets System** para perfis de estudo (modo foco, modo revisão, modo aula longa)
  - **Context Menu customizável via drag-and-drop** — feature diferenciada
  - **BLAKE3 update verification + rollback automático** — solução robusta para auto-update sem código signing caro
  - **Interactive Subtitle Browser** — base para um futuro "transcrição navegável de aulas"

---

### 4. singcl/XmVideoPlayer ⭐ 84
- **URL:** https://github.com/singcl/XmVideoPlayer
- **Stars:** 84
- **Tecnologia:** Tauri 2 + TypeScript (frontend Vanilla) + Rust + FFmpeg
- **Plataformas:** Windows + macOS (com screenshots de ambos)
- **Features principais:**
  - Suporte a múltiplos formatos de streaming: mp4, m3u8, flv, mpeg-dash
  - **Auto-detecção e auto-download do FFmpeg no primeiro boot** (sem instalar manual)
  - Download de m3u8 com **merge automático para mp4**
  - **Download com progresso + breakpoint resume** (continuar download parcial)
  - Playlist & histórico de reprodução
  - Cross-origin resource loading (m3u8, flv, mpd)
  - **Window Customization** (frameless)
  - **System tray** (app tray)
  - **Updater** embutido
  - Screenshot capture
  - Multi-theme
- **Inspiração para Meggy:**
  - **Auto-download do FFmpeg no primeiro boot** — resolve dependência pesada sem inflar installer
  - **Download de aulas com resume** para usuários que querem offline (cursos baixados do Drive)
  - **Merge m3u8 → mp4** para cache offline de aulas fragmentadas
  - **System tray** com playback contínuo em background
  - Padrão de **window customization** (frameless custom titlebar)

---

### 5. risenxxx/frame-player ⭐ 40 (densidade de features altíssima)
- **URL:** https://github.com/risenxxx/frame-player
- **Stars:** 40
- **Tecnologia:** Tauri 2 + libmpv (mpv renderiza em **native child view atrás de webview transparente**) + Rust
- **Plataformas:** Windows 10/11 x64 + macOS (Apple Silicon, com Homebrew cask)
- **Features principais:**
  - **Streaming de torrent enquanto baixa** — magnet link → temporada inteira vira fila, **piece-prioritization ao redor do playhead**, seekbar mostra o que já chegou
  - **Next episode prefetch** automático
  - **Watch-together**: código de 6 chars sincroniza 2 players (mesma posição, pausa, episódio). **Drift corrigido por nudge de velocidade (não seek)** para evitar decode de keyframe
  - **Chromecast + DLNA** com remux automico (stream-copy em segundos, sem reencode) quando o device não suporta o formato original
  - **Auto-skip intro/recap/credits/ads** com matching por título de capítulo completo (não substring)
  - **OpenSubtitles por hash de arquivo** (identifica release exato, não guess) + fallback por título, painel informa qual método funcionou
  - **Hover preview frame-accurate** (não keyframe anterior) — medida: 60% das vezes o método ingênuo erra a cena
  - **Exact seek medido** (1.9s em um arquivo, 0.05s em outro) — player mede o primeiro e decide, em vez de otimizar globalmente
  - **Resume por arquivo/link/episódio de torrent**, tela inicial de "não terminados" com poster frame
  - **Dublagem lembrada entre episódios** por language/title/codec (não track number, que muda entre releases)
  - **Mini player always-on-top** com snap-to-corners; no macOS flutua sobre fullscreen spaces
  - Localização RU/EN + todos os hotkeys rebinding
  - **Auto-update assinado** (chave própria do projeto, recusa se assinatura não bater) — não exige código signing de OS
  - CI build por version bump com release automático
- **Inspiração para Meggy:**
  - **Padrão "mpv em child view nativa + webview HTML transparente"** é a arquitetura de ouro para um player real (não `<video>` HTML5) — performance e UX ao mesmo tempo
  - **Watch-together** para estudo em grupo (sala de aula virtual sincronizada) — diferencial massivo
  - **Auto-skip intro/credits** para aulas com abertura longa
  - **OpenSubtitles por hash** para legendas automáticas em qualquer aula
  - **Hover preview frame-accurate** na seekbar (visualmente impressionante)
  - **Resume multi-contexto** (arquivo, link, episódio) com tela de "continue assistindo"
  - **Auto-update sem código signing de OS** — solução pragmática para distribuição Meggy
  - **Drift correction por nudge de velocidade** — lição de engenharia para watch-together robusto

---

### 6. biggiesmallcap-blip/NOORwave ⭐ 15 (densidade altíssima)
- **URL:** https://github.com/biggiesmallcap-blip/NOORwave
- **Stars:** 15 (subestimado — projeto TIDAL player muito maduro)
- **Tecnologia:** Rust + Tauri + SQLite + WASAPI exclusive + HLS + PWA + embedding model
- **Plataformas:** Windows (WASAPI exclusive mode), macOS, Linux
- **Features principais:**
  - **Mirror da library TIDAL → SQLite local** → busca instantânea (digita, responde — sem spinner)
  - **Indexação de videoclipes** para cada track da library (covers, versões ao vivo, alternativas) — wall de vídeos filtrável por gênero/ano
  - **Video Stations** — lineup diário de vídeos baseado em taste + catálogo
  - **Genre Galaxy** — library inteira mapeada como campo de estrelas navegável (14 famílias, ~200 gêneros), com 4 lenses: Map / Heat / Vibe / Rediscover
  - **Gapless playback** com NearEnd event 15s antes do fim → próxima já decoded/buffered; rebuild do output stream por sample rate do source (96kHz toca em 96kHz)
  - **DJ cockpit** com audio profiles, planeja cue/duration/gain antes da transição; harmonic mixing (Camelot key), energy analysis
  - **Automix que aprende** com embedding model treinado na própria listening history; penaliza hub tracks; fallback para session taste profile; 4 shuffle modes
  - **Phone remote** via PWA no mesmo processo/porta — sem companion app, sem cloud. QR code + 6-digit code, pareamento por nome
  - **25+ color schemes** (Iris, Clay, Ember, Abyss, Neon, Obsidian…) × light/dark/system
  - **50+ animated backgrounds** (aurora, liquid chrome, spiral galaxies, stained glass, synthwave, spectrum analysers) que pulsam com a música
  - Listening analytics: ridgeline 24h, peak hour, session count, completion/skip rate, janelas 24h/7d/14d/30d/all time
  - Incremental sync, duplicate detection, metadata enrichment (MusicBrainz, Last.fm, Discogs)
  - Save-to-disk como FLAC bit-perfect ou MP3 320
- **Inspiração para Meggy:**
  - **SQLite local → busca instantânea** — pattern que Meggy já planeja (D1 local), validar a UX "type-ahead sem spinner"
  - **Genre Galaxy → "Knowledge Galaxy"** — mapa de cursos/matérias como campo de estrelas, navegável por 4 lenses (Mapa/Calor/Vibe/Rediscover) — visualização diferenciada
  - **Embedding model treinado no próprio histórico** → recomendação de próxima aula (próximo vídeo, próximo curso)
  - **PWA como phone remote** no mesmo processo — sem companion app separado, sem cloud — solução elegante para "controle remoto do desktop pelo celular"
  - **Listening analytics com ridgeline 24h** → "Study analytics" mostrando quando o usuário mais estuda
  - **50+ animated backgrounds que pulsam com o áudio** — UI premium para diferenciar Meggy de players genéricos
  - **Gapless playback com NearEnd event** — sem "buraco" entre aulas de uma playlist

---

### 7. IvanCodesDev/OmniSpeed ⭐ 25
- **URL:** https://github.com/IvanCodesDev/OmniSpeed
- **Stars:** 25
- **Tecnologia:** Tauri 2 + Rust + TypeScript + Vite + WebView2; Browser Extension (Chrome/Edge/Firefox) com Native Messaging
- **Plataformas:** Windows 10/11 x64 (macOS/Linux preparados na arquitetura)
- **Features principais:**
  - **Controle de velocidade global 0.25×–16×** que afeta qualquer player (browser + desktop)
  - **System tray resident app** + **atalho global** Ctrl+Alt+↑/↓
  - **OSD** (on-screen display) mostrando velocidade atual
  - **Quebra o limite de 2×/3× das plataformas** controlando diretamente o playback core
  - **Speed-lock**: impede reset do player ao trocar episódio/seek/autoplay
  - **Suporte a shorts** (continua velocidade ao rolar para próximo vídeo)
  - **Adaptação por player desktop**: mpv/VLC/PotPlayer/MPC-HC via IPC prioritário, fallback para hotkeys
  - **CDP takeover** de clientes Chromium (Bilibili desktop) via DevTools Protocol local
  - **Per-app memory**: lembra velocidade por app/site e restaura ao voltar
  - **Live stream detection** (desativa speed) + **ad detection** (não interfere em anúncios)
  - Instalador NSIS sem admin
  - **Auto-update** com `createUpdaterArtifacts` (latest.json + .sig)
- **Inspiração para Meggy:**
  - **Controle de velocidade global 16×** — diferencial agressivo para app de estudo (usuários assistem aulas em 2×–3×)
  - **System tray resident + atalho global** — Meggy pode rodar em background e responder a hotkeys mesmo com outra app em foco
  - **Speed-lock para impedir reset** — útil quando usuário troca de aula e o site tenta voltar para 1×
  - **CDP takeover de Chromium embedded** — se Meggy usar webview embedded para serviços externos, dá para controlar o player de dentro
  - **Auto-update via latest.json + .sig** — modelo pronto de distribuição auto-assinada
  - **Padrão "instalador NSIS sem admin"** — menor fricção de instalação para usuário final

---

### 8. iFralex/IELTS-Study ⭐ 6 (altamente relevante para estudo)
- **URL:** https://github.com/iFralex/IELTS-Study
- **Stars:** 6
- **Tecnologia:** Electron + React + TypeScript + SQLite local + multi-AI provider (Anthropic/Google/OpenAI)
- **Plataformas:** Desktop (Electron multi-OS)
- **Features principais:**
  - **Dashboard** com 4 stat cards (sessões, acurácia, tempo total, simulados) dos últimos 30 dias + recent sessions + recent exam runs
  - **Listening Practice** com 41 exercícios, 5 question types, **sticky audio player**, single/series/random practice modes
  - **Reading** com 32 exercícios, split-pane layout
  - **Writing** com 20 tasks + **AI band scoring** + model answers
  - **Exam Simulator** full timed (Listening + Reading + Writing em sequência)
  - **Flashcards** com **spaced repetition** + AI generation
  - **AI Tutor Chat** com conversation history persistida
  - **Analytics** deep: band estimates, trends, coverage
  - **Persistência SQLite local** para progresso, settings, answers, essays, flashcards, chat history
  - **Multi-AI provider** configurável (Anthropic/Google/OpenAI) via `.env`
  - **Multilingual** EN/IT/FR/ES com switch na sidebar
  - Documentação extensa: Architecture, Data Model, AI and Privacy, Content Pipeline, Testing, Releases, Troubleshooting, Security Policy, Contributing
- **Inspiração para Meggy:**
  - **Padrão de app de estudo Electron** é praticamente um blueprint do que Meggy já faz em web — a porta para Tauri seria direta
  - **Spaced repetition flashcards com AI generation** — Meggy já tem `meggy-flashcards.js`; portar para Rust com SQLite seria natural
  - **Dashboard com 4 stat cards dos últimos 30 dias** — exatamente o que Meggy precisa
  - **Sticky audio player** (top fixo enquanto faz exercício) — UX para aulas
  - **Multi-AI provider configurável** — Meggy já tem `gdi-ai-providers.js`, padrão idêntico
  - **Multilingual com switch na sidebar** — alinhado com roadmap Meggy
  - **Documentação por domínio** (Architecture, Data Model, AI and Privacy…) — modelo para organizar docs do Meggy

---

### 9. lindsey-labs/ielts-speaking-coach ⭐ 22
- **URL:** https://github.com/lindsey-labs/ielts-speaking-coach
- **Stars:** 22
- **Tecnologia:** Electron + Local MCP server (STDIO) + OpenAI + ChatGPT Voice integration
- **Plataformas:** Windows + macOS
- **Features principais:**
  - **Local-first**: transcripts, recordings, reports, login ficam no computador local
  - Lança ChatGPT Voice do dashboard desktop e captura texto da conversa
  - Importação de question bank
  - **Planos de estudo**: 7/14/30 dias
  - **Review estruturado automático** após cada sessão
  - Continuação de última questão, próxima, ou qualquer sessão histórica
  - **Retraining targeted**: salva alvos recomendados e treina um alvo via transfer
  - Dashboard com: review history, recurring issues, vocabulary, optional targets, progress
  - **Local MCP server** com tools: `initialize_ielts_workspace`, `open_dashboard`, `set_training_selection`, `get_training_context`, `save_session_review`, `list_practice_history`, `get_dashboard_data`
  - Dados em `%LOCALAPPDATA%\IELTS Speaking Coach` no Windows
  - Build Windows `.exe` via `npm run package:win`; macOS DMG+ZIP Intel/ARM separados
- **Inspiração para Meggy:**
  - **Plano de estudo 7/14/30 dias** — feature simples e valiosa para o app Meggy nativo
  - **Local MCP server** — expor Meggy como MCP server permite que LLMs (Claude, ChatGPT) controlem o app programaticamente (next-gen feature)
  - **Review estruturado automático** após cada sessão — base para "pós-aula review" do Meggy
  - **Retraining targeted** — identifica ponto fraco e foca próxima sessão nele
  - Padrão de dados em `%LOCALAPPDATA%` — correto para Windows

---

### 10. peditx/tauri-skills ⭐ 54 (skill/playbook, não app)
- **URL:** https://github.com/peditx/tauri-skills
- **Stars:** 54
- **Tecnologia:** Tauri 2 + Rust + React/TS + Python sidecar (subprocess/HTTP bridge/PyO3) + CI/CD matrix
- **Tipo:** Skill/playbook para construir apps Tauri 2 — não é app em si, mas define arquitetura de referência
- **Features principais:**
  - Padrões de **Tauri commands com `#[tauri::command]`** + custom error types + Result propagation
  - **SQLite com WAL mode** (write-ahead logging)
  - **Python sidecar management** em 4 níveis: subprocess, HTTP bridge (FastAPI), PyO3/Maturin, JSON IPC
  - **System tray + multi-window**
  - Hooks React: `useTauriCommand`, `useTauriEvent`
  - Zustand state management
  - **SSE streaming com real-time chunks**
  - CSP + IPC permissions + OS keyring + self-signed TLS
  - Testes: Rust unit + Vitest + Testing Library + E2E WebDriver
  - **CI/CD matrix**: Windows (NSIS+MSI), macOS (DMG), Linux (AppImage+deb)
  - **Parallel execution** com subagents (Rust + React + CI/CD simultâneos)
- **Inspiração para Meggy:**
  - **Blueprint arquitetural completo para Tauri 2** — Meggy pode usar este repo como referência de estrutura
  - **SQLite WAL mode** para acesso concorrente (worker + UI)
  - **Python sidecar 4 níveis** — se Meggy precisar de ML/NLP pesado, PyO3 é o caminho (sem subprocess overhead)
  - **CI/CD matrix pronta** para Windows+macOS+Linux
  - **OS keyring** para armazenar tokens do Google Drive de forma segura (não em plaintext)
  - **Self-signed TLS** para IPC local entre componentes

---

## Outros repositórios identificados (menção breve)

| Repo | Stars | Notas |
|------|-------|-------|
| `GoodDay360/HyperionBox` | 40 | Tauri + anime, archived |
| `himanshu-systems/nats-studio` | 17 | Tauri + React + Rust GUI para NATS (não relacionado) |
| `canwdev/web-mediadevices-player` | 151 | 151 stars — MediaDevices API, não player de arquivo |
| `YeonV/tauri-plugin-videoplayer` | 7 | Plugin Tauri v2 com ExoPlayer/Media3 para Android |
| `Bernard-Borg/VideOVish` | 10 | Tauri + Vue3 + YouTube player |
| `ebobo/tauri-video-player` | 2 | Tutorial starter |
| `cliambrown/Playa` | 2 | Pequeno |
| `Tue-StudyOS/tue-api-wrapper` | 14 | Wrapper para API da Univ. Tübingen (estudo admin) |
| `polarscope-studio/polarscope` | 50 | Simulador de antena 3D (não relacionado) |
| `hugo-cardenas/lickit` | 6 | Music study Electron (arquivado) |
| `L-Chris/replayer` | 2 | Pequeno |
| `RealWhyKnot/VRCResolver` | 5 | VRChat + HLS + Windows Rust |
| `biggiesmallcap-blip/NOORwave` | 15 | (já detalhado acima — denso demais para ignorar) |
| `IvanCodesDev/OmniSpeed` | 25 | (já detalhado acima) |

---

## Padrões arquiteturais observados (consolidado)

### Stack vencedor para player nativo Windows moderno
```
Frontend:  React 19 / Svelte / Vue 3  +  TypeScript  +  Vite 7  +  Tailwind/CSS Custom Properties
Backend:   Rust (2021 edition)  +  Tauri v2  +  Tokio
Player:    libmpv-2.dll via FFI dinâmico (libloading)  +  vo=gpu-next  +  Direct3D 11  +  HDR tone-mapping
         OU  mpv em child view nativa atrás de webview transparente (frame-player)
Audio:     WASAPI (exclusive mode se possível)  +  32-tap Sinc Resampler  +  Scaletempo2
Media:     FFmpeg bundled (ffmpeg.exe)  +  MediaInfo.dll via C-FFI
DB:        SQLite com WAL mode (local-first, busca instantânea)
IA:        Whisper on-device  +  ONNX/DirectML  +  Embedding model local
Update:    Auto-update com signing próprio (BLAKE3/latest.json/.sig) — não exige código signing de OS
Build:     GitHub Actions matrix (NSIS+MSI / DMG / AppImage+deb)
```

### Features que Meggy deveria considerar (priorizadas)

**P0 — Must have para diferenciar do web atual:**
1. **Tauri 2 + Rust backend** — performance nativa + binário único multi-OS (Win/Mac/Linux/Android)
2. **SQLite WAL local** — busca type-ahead sem spinner, progresso offline, histórico
3. **System tray + atalho global** — playback continua com outra app em foco
4. **Auto-update auto-assinado** (BLAKE3 + latest.json + .sig) — sem custo de certificado de OS
5. **FFmpeg bundled** (auto-download no primeiro boot se >50MB) — format support universal

**P1 — Alto valor de UX:**
6. **Hover preview frame-accurate** na seekbar e na galeria de aulas
7. **"Up Next" overlay** estilo Netflix para playlists de aulas
8. **Resume multi-contexto** (arquivo / link / episódio) com tela de "continue assistindo"
9. **Auto-skip intro/credits** com matching por título de capítulo
10. **Agrupamento temporal** (Hoje, Ontem) na lista de cursos
11. **Custom libraries** — usuário aponta pasta local

**P2 — Diferencial competitivo:**
12. **Whisper on-device** para transcrição de aulas → base para resumos/flashcards automáticos
13. **Watch-together** para estudo em grupo sincronizado (drift correction por nudge de velocidade)
14. **Phone remote via PWA** no mesmo processo (sem companion app separado)
15. **Controle de velocidade global 0.25×–16×** com speed-lock (anti-reset)
16. **Genre Galaxy / Knowledge Galaxy** — mapa visual navegável da biblioteca
17. **Embedding model treinado no histórico** → "próxima aula sugerida"
18. **Local MCP server** — expor Meggy para LLMs controlarem programaticamente

**P3 — Polish:**
19. **Glassmorphic UI** premium com fade in/out transitions
20. **50+ animated backgrounds** que pulsam com o áudio
21. **Customizable context menu** com drag-and-drop editor (@dnd-kit)
22. **Modular Presets System** (perfis: Modo Foco, Modo Revisão, Modo Aula Longa)
23. **Listening/Study analytics** com ridgeline 24h + completion rate + trends

### Riscos observados
- **Auto-update sem código signing de OS** → SmartScreen (Windows) e Gatekeeper (macOS) alertam na primeira execução — frame-player documenta isso explicitamente como "fato sobre certificado, não sobre o binário"
- **libmpv FFI** → requer build de mpv-winbuild ou download de binário confiável — pode inflar o installer em ~30MB
- **Whisper on-device** → modelos GGML pesam 75MB–1.5GB; glucose usa versão small; Meggy precisaria de strategy de download lazy
- **Watch-together** → requer relay server (frame-player usa relay só para timeline, nunca mídia) — Meggy teria que adicionar um endpoint no Cloudflare Worker atual

---

## Próximas ações recomendadas

1. **Decidir arquitetura de player**: `<video>` HTML5 (simples, limitado a 1080p sem HDR) vs **libmpv FFI via child view nativa** (frame-player/L-MPV pattern — recomendado para diferencial de qualidade)
2. **Spike de 1 semana**: replicar o pattern do **frame-player** (Tauri 2 + libmpv + webview transparente) num MVP com 1 tela de player + 1 playlist
3. **Adotar SQLite WAL** desde o dia 1 — referência: peditx/tauri-skills para patterns Rust
4. **Planejar auto-update auto-assinado** (BLAKE3 + .sig) — referência: frame-player e OmniSpeed
5. **Estudar deep-dive do NOORwave** para o "Knowledge Galaxy" + phone remote PWA — são as features mais diferenciadas
6. **Estudar deep-dive do iFralex/IELTS-Study** para portar flashcards spaced-repetition + AI tutor para Rust
7. **Avaliar Whisper on-device** (glucose) para transcrição de aulas — habilita resumo automático + busca por trecho falado

---

## Anexos

### Repos por query (contagem bruta)

| Query | Total de resultados | Repos analisados em profundidade |
|-------|---------------------|----------------------------------|
| `tauri streaming app` | 109 | LibreTV-App, tauri-skills |
| `tauri video player` | 70 | glucose, XmVideoPlayer, L-MPV, frame-player |
| `electron study app` | 160 | IELTS-Study, ielts-speaking-coach |
| `rust desktop video player` | 15 | OmniSpeed, NOORwave |

### URLs completas para referência

- https://github.com/KeyRotate/LibreTV-App
- https://github.com/rudi-q/glucose_media_player
- https://github.com/Menely/L-MPV
- https://github.com/singcl/XmVideoPlayer
- https://github.com/risenxxx/frame-player
- https://github.com/biggiesmallcap-blip/NOORwave
- https://github.com/IvanCodesDev/OmniSpeed
- https://github.com/iFralex/IELTS-Study
- https://github.com/lindsey-labs/ielts-speaking-coach
- https://github.com/peditx/tauri-skills

---

**Status da task:** ✅ Completa — pesquisa e documentação salvas em `/home/z/my-project/github_research_native.md`. Nenhum código do projeto foi modificado.
