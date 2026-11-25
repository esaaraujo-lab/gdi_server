// ═══════════════════════════════════════════════════════════════
// mpv.rs — Leitor alternativo (sidecar mpv) p/ formatos legados
//
// Problema: o <video> do WebView2/Chromium NÃO lê AVI (contentor
// antigo; conteúdo típico DivX/Xvid + MP3/AC3) nem outros formatos
// que o Chromium não descodifica. O mpv (FFmpeg) lê praticamente
// tudo. Este módulo lança o binário mpv empacotado com a app
// (bundle.externalBin) e controla-o por IPC JSON:
//   - Unix (Linux/macOS): socket Unix em temp_dir
//   - Windows: socket TCP em 127.0.0.1 (mpv ≥0.34 aceita
//     --input-ipc-server=tcp://127.0.0.1:PORT; PROVAR na 1ª run
//     Windows — fallback documentado nas notas: named pipe tokio)
//
// O frontend (PlayerView) só chama isto para .avi/.divx ou quando
// o <video> nativo falha de verdade (onError). MP4/MKV e tudo o
// que hoje toca NUNCA passa por aqui — o caminho actual fica
// intacto. Posição/progresso: o frontend faz poll de mpv_status
// e grava pelas MESMAS rotas de sempre (/userstate via
// saveResumePosition/markWatched) — nada muda no servidor.
//
// ★ PlayerFix Fase 1 (2026-11-25) — o travamento do app:
// no Tauri v2 os comandos síncronos correm na THREAD PRINCIPAL.
// mpv_status era chamado de 2 em 2 s e fazia 4 pedidos IPC
// sequenciais (timeout de 800 ms cada) segurando o Mutex — com o
// mpv ocupado a abrir um stream de 300–500 MB, cada poll podia
// bloquear a interface ~3,2 s, de 2 em 2 s → o app congelava e
// tinha de ser fechado à força (relato do Elton, aulas de
// História/Vestibulares). mpv_start agravava: shutdown síncrono +
// ipc_connect até 5 s, também na thread principal.
// Correcção, sem mudar NENHUM comportamento visível:
//   - mpv_start / mpv_command / mpv_stop passam a comandos async
//     e o trabalho bloqueante corre em spawn_blocking (runtime),
//     nunca na thread principal.
//   - mpv_status deixa de falar com o mpv: devolve uma CACHE
//     actualizada por uma thread de fundo (poll interno de
//     500 ms, dona dos pedidos IPC). O comando fica instantâneo.
//   - A thread de fundo detecta a morte do processo (janela do
//     mpv fechada, crash, EOF) e limpa a sessão, como o antigo
//     mpv_status fazia. Um contador de geração impede que a
//     thread de uma sessão antiga toque na sessão nova.
// ═══════════════════════════════════════════════════════════════

use serde::Serialize;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[cfg(unix)]
use std::os::unix::net::UnixStream;

enum IpcStream {
    #[cfg(unix)]
    Unix(UnixStream),
    Tcp(TcpStream),
}

impl IpcStream {
    fn try_clone(&self) -> std::io::Result<IpcStream> {
        match self {
            #[cfg(unix)]
            IpcStream::Unix(s) => Ok(IpcStream::Unix(s.try_clone()?)),
            IpcStream::Tcp(s) => Ok(IpcStream::Tcp(s.try_clone()?)),
        }
    }
    fn set_timeouts(&self) {
        let t = Some(Duration::from_millis(800));
        match self {
            #[cfg(unix)]
            IpcStream::Unix(s) => {
                let _ = s.set_read_timeout(t);
                let _ = s.set_write_timeout(t);
            }
            IpcStream::Tcp(s) => {
                let _ = s.set_read_timeout(t);
                let _ = s.set_write_timeout(t);
            }
        }
    }
}

impl Read for IpcStream {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        match self {
            #[cfg(unix)]
            IpcStream::Unix(s) => s.read(buf),
            IpcStream::Tcp(s) => s.read(buf),
        }
    }
}

impl Write for IpcStream {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        match self {
            #[cfg(unix)]
            IpcStream::Unix(s) => s.write(buf),
            IpcStream::Tcp(s) => s.write(buf),
        }
    }
    fn flush(&mut self) -> std::io::Result<()> {
        match self {
            #[cfg(unix)]
            IpcStream::Unix(s) => s.flush(),
            IpcStream::Tcp(s) => s.flush(),
        }
    }
}

struct MpvSession {
    child: Child,
    reader: BufReader<IpcStream>,
    writer: IpcStream,
    next_id: u64,
    #[cfg(unix)]
    sock_path: PathBuf,
}

impl MpvSession {
    /// Envia um comando JSON-IPC e espera a resposta com o mesmo
    /// request_id (eventos intermédios são ignorados).
    fn request(&mut self, args: Vec<Value>) -> Result<Value, String> {
        self.next_id += 1;
        let id = self.next_id;
        let msg = json!({ "command": args, "request_id": id });
        let mut line = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
        line.push('\n');
        self.writer
            .write_all(line.as_bytes())
            .map_err(|e| format!("ipc write: {e}"))?;
        let mut buf = String::new();
        loop {
            buf.clear();
            let n = self
                .reader
                .read_line(&mut buf)
                .map_err(|e| format!("ipc read: {e}"))?;
            if n == 0 {
                return Err("ipc fechado pelo mpv".to_string());
            }
            let v: Value = match serde_json::from_str(buf.trim()) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if v.get("request_id").and_then(|r| r.as_u64()) == Some(id) {
                if v.get("error").and_then(|e| e.as_str()) == Some("success") || v.get("error").is_none() {
                    return Ok(v);
                }
                return Ok(v);
            }
        }
    }

    fn get_prop(&mut self, name: &str) -> Option<Value> {
        let v = self.request(vec![json!("get_property"), json!(name)]).ok()?;
        v.get("data").cloned()
    }

    fn shutdown(&mut self) {
        let _ = self.request(vec![json!("quit")]);
        let _ = self.child.kill();
        let _ = self.child.wait();
        #[cfg(unix)]
        {
            let _ = std::fs::remove_file(&self.sock_path);
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MpvStatus {
    running: bool,
    time_pos: Option<f64>,
    duration: Option<f64>,
    paused: bool,
    eof: bool,
}

impl MpvStatus {
    fn stopped() -> Self {
        MpvStatus {
            running: false,
            time_pos: None,
            duration: None,
            paused: false,
            eof: false,
        }
    }
}

/// Estado partilhado do mpv. ★ PlayerFix: a sessão e a cache vivem
/// atrás de um Arc para os comandos async poderem mover o estado
/// para as threads do runtime (spawn_blocking) — a thread
/// principal nunca mais espera pelo IPC.
pub struct MpvInner {
    session: Mutex<Option<MpvSession>>,
    cache: Mutex<MpvStatus>,
    generation: AtomicU64,
}

pub struct MpvState(pub Arc<MpvInner>);

impl Default for MpvState {
    fn default() -> Self {
        MpvState(Arc::new(MpvInner {
            session: Mutex::new(None),
            cache: Mutex::new(MpvStatus::stopped()),
            generation: AtomicU64::new(0),
        }))
    }
}

impl MpvInner {
    fn set_cache(&self, status: MpvStatus) {
        if let Ok(mut c) = self.cache.lock() {
            *c = status;
        }
    }

    /// Arranca o mpv (corpo bloqueante — só chamado via
    /// spawn_blocking). Comportamento idêntico ao original:
    /// desliga a sessão anterior, localiza o binário, liga o IPC.
    fn start(
        self: &Arc<Self>,
        url: String,
        start_secs: f64,
        speed: f64,
        title: String,
    ) -> Result<(), String> {
        // Nova geração: qualquer poller antigo pára no próximo ciclo.
        let gen = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let mut guard = self
            .session
            .lock()
            .map_err(|_| "mpv state poisoned".to_string())?;
        if let Some(mut old) = guard.take() {
            old.shutdown();
        }
        // Se o arranque falhar a meio, a cache não pode ficar com o
        // estado da sessão antiga (o caminho de sucesso sobrescreve).
        self.set_cache(MpvStatus::stopped());

        let bin = mpv_binary();
        #[cfg(unix)]
        let (addr, sock_path) = ipc_endpoint();
        #[cfg(windows)]
        let (addr, port) = ipc_endpoint();

        let mut cmd = Command::new(&bin);
        cmd.arg("--no-config")
            .arg(format!("--input-ipc-server={addr}"))
            .arg("--force-window=yes")
            .arg("--keep-open=no")
            .arg(format!("--title={title}"));
        if start_secs > 0.0 {
            cmd.arg(format!("--start={start_secs}"));
        }
        if (speed - 1.0).abs() > f64::EPSILON {
            cmd.arg(format!("--speed={speed}"));
        }
        cmd.arg(&url)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let child = cmd
            .spawn()
            .map_err(|e| format!("não foi possível iniciar o mpv ({}): {e}", bin.display()))?;

        #[cfg(unix)]
        let stream = match ipc_connect(&sock_path) {
            Ok(s) => s,
            Err(e) => {
                let mut c = child;
                let _ = c.kill();
                let _ = c.wait();
                return Err(e);
            }
        };
        #[cfg(windows)]
        let stream = match ipc_connect(port) {
            Ok(s) => s,
            Err(e) => {
                let mut c = child;
                let _ = c.kill();
                let _ = c.wait();
                return Err(e);
            }
        };
        stream.set_timeouts();
        let writer = stream.try_clone().map_err(|e| e.to_string())?;
        let session = MpvSession {
            child,
            reader: BufReader::new(stream),
            writer,
            next_id: 0,
            #[cfg(unix)]
            sock_path,
        };
        *guard = Some(session);
        drop(guard);
        self.set_cache(MpvStatus {
            running: true,
            time_pos: None,
            duration: None,
            paused: false,
            eof: false,
        });
        Self::spawn_poller(self.clone(), gen);
        Ok(())
    }

    /// Thread de fundo dona dos pedidos de estado. Actualiza a
    /// cache de 500 em 500 ms; detecta a morte do processo e limpa
    /// a sessão (o papel que o antigo mpv_status síncrono fazia).
    /// Sai quando a geração muda (sessão substituída/parada).
    fn spawn_poller(inner: Arc<MpvInner>, gen: u64) {
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(500));
            if inner.generation.load(Ordering::SeqCst) != gen {
                return;
            }
            let mut guard = match inner.session.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            if guard.is_none() {
                inner.set_cache(MpvStatus::stopped());
                return;
            }
            // O processo morreu (janela fechada, crash, fim)?
            let alive = match guard.as_mut().map(|s| s.child.try_wait()) {
                Some(Ok(None)) => true,  // ainda a correr
                Some(Err(_)) => true,    // indeterminado — trata como vivo
                _ => false,              // Ok(Some(_)) = saiu
            };
            if !alive {
                if let Some(mut old) = guard.take() {
                    old.shutdown();
                }
                drop(guard);
                inner.set_cache(MpvStatus::stopped());
                return;
            }
            let session = guard.as_mut().expect("session presente");
            let time_pos = session.get_prop("time-pos").and_then(|v| v.as_f64());
            let duration = session.get_prop("duration").and_then(|v| v.as_f64());
            let paused = session
                .get_prop("pause")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let eof = session
                .get_prop("eof-reached")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            drop(guard);
            inner.set_cache(MpvStatus {
                running: true,
                time_pos,
                duration,
                paused,
                eof,
            });
        });
    }

    fn command(&self, args: Vec<Value>) -> Result<(), String> {
        let mut guard = self
            .session
            .lock()
            .map_err(|_| "mpv state poisoned".to_string())?;
        let session = guard.as_mut().ok_or("mpv não está a correr")?;
        session.request(args).map(|_| ())
    }

    fn stop(&self) {
        // Invalida o poller da sessão actual antes de a desligar.
        self.generation.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut guard) = self.session.lock() {
            if let Some(mut old) = guard.take() {
                old.shutdown();
            }
        }
        self.set_cache(MpvStatus::stopped());
    }
}

/// Localiza o mpv: primeiro o sidecar empacotado (junto ao exe —
/// é onde o Tauri põe os externalBin), depois o PATH do sistema.
fn mpv_binary() -> PathBuf {
    let name = if cfg!(windows) { "mpv.exe" } else { "mpv" };
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let side = dir.join(name);
            if side.exists() {
                return side;
            }
        }
    }
    PathBuf::from(name)
}

#[cfg(unix)]
fn ipc_endpoint() -> (String, PathBuf) {
    let path = std::env::temp_dir().join(format!("meggy-mpv-{}.sock", std::process::id()));
    let _ = std::fs::remove_file(&path);
    (path.to_string_lossy().to_string(), path)
}

#[cfg(unix)]
fn ipc_connect(path: &PathBuf) -> Result<IpcStream, String> {
    for _ in 0..50 {
        if let Ok(s) = UnixStream::connect(path) {
            s.set_timeouts_via();
            return Ok(IpcStream::Unix(s));
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Err("timeout a ligar ao IPC do mpv".to_string())
}

#[cfg(windows)]
fn ipc_endpoint() -> (String, u16) {
    // Porta livre efémera em localhost.
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind 127.0.0.1:0");
    let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
    drop(listener);
    (format!("tcp://127.0.0.1:{port}"), port)
}

#[cfg(windows)]
fn ipc_connect(port: u16) -> Result<IpcStream, String> {
    for _ in 0..50 {
        if let Ok(s) = TcpStream::connect(("127.0.0.1", port)) {
            return Ok(IpcStream::Tcp(s));
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Err("timeout a ligar ao IPC do mpv".to_string())
}

// Pequeno helper p/ aplicar timeouts logo após ligar (Unix).
#[cfg(unix)]
trait SetTimeouts {
    fn set_timeouts_via(&self);
}
#[cfg(unix)]
impl SetTimeouts for UnixStream {
    fn set_timeouts_via(&self) {
        let t = Some(Duration::from_millis(800));
        let _ = self.set_read_timeout(t);
        let _ = self.set_write_timeout(t);
    }
}

#[tauri::command]
pub async fn mpv_start(
    state: tauri::State<'_, MpvState>,
    url: String,
    start_secs: f64,
    speed: f64,
    title: String,
) -> Result<(), String> {
    let inner = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || inner.start(url, start_secs, speed, title))
        .await
        .map_err(|e| format!("mpv_start: {e}"))?
}

/// Instantâneo por desenho: devolve a cache mantida pela thread de
/// fundo — nunca fala com o mpv, nunca bloqueia a interface.
#[tauri::command]
pub fn mpv_status(state: tauri::State<'_, MpvState>) -> Result<MpvStatus, String> {
    let cache = state
        .0
        .cache
        .lock()
        .map_err(|_| "mpv state poisoned".to_string())?;
    Ok(cache.clone())
}

#[tauri::command]
pub async fn mpv_command(
    state: tauri::State<'_, MpvState>,
    args: Vec<Value>,
) -> Result<(), String> {
    let inner = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || inner.command(args))
        .await
        .map_err(|e| format!("mpv_command: {e}"))?
}

#[tauri::command]
pub async fn mpv_stop(state: tauri::State<'_, MpvState>) -> Result<(), String> {
    let inner = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || inner.stop())
        .await
        .map_err(|e| format!("mpv_stop: {e}"))?;
    Ok(())
}
