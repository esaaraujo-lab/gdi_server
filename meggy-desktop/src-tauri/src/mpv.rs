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
// ═══════════════════════════════════════════════════════════════

use serde::Serialize;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
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

pub struct MpvState(pub Mutex<Option<MpvSession>>);

impl Default for MpvState {
    fn default() -> Self {
        MpvState(Mutex::new(None))
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
pub fn mpv_start(
    state: tauri::State<'_, MpvState>,
    url: String,
    start_secs: f64,
    speed: f64,
    title: String,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "mpv state poisoned".to_string())?;
    if let Some(mut old) = guard.take() {
        old.shutdown();
    }

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
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MpvStatus {
    running: bool,
    time_pos: Option<f64>,
    duration: Option<f64>,
    paused: bool,
    eof: bool,
}

#[tauri::command]
pub fn mpv_status(state: tauri::State<'_, MpvState>) -> Result<MpvStatus, String> {
    let mut guard = state.0.lock().map_err(|_| "mpv state poisoned".to_string())?;
    if guard.is_none() {
        return Ok(MpvStatus {
            running: false,
            time_pos: None,
            duration: None,
            paused: false,
            eof: false,
        });
    }
    // O processo morreu (janela fechada pelo utilizador, crash)?
    let alive = match guard.as_mut().map(|s| s.child.try_wait()) {
        Some(Ok(None)) => true,  // ainda a correr
        Some(Err(_)) => true,    // indeterminado — trata como vivo
        _ => false,              // Ok(Some(_)) = saiu
    };
    if !alive {
        if let Some(mut old) = guard.take() {
            old.shutdown();
        }
        return Ok(MpvStatus {
            running: false,
            time_pos: None,
            duration: None,
            paused: false,
            eof: false,
        });
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
    Ok(MpvStatus {
        running: true,
        time_pos,
        duration,
        paused,
        eof,
    })
}

#[tauri::command]
pub fn mpv_command(state: tauri::State<'_, MpvState>, args: Vec<Value>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "mpv state poisoned".to_string())?;
    let session = guard.as_mut().ok_or("mpv não está a correr")?;
    session.request(args).map(|_| ())
}

#[tauri::command]
pub fn mpv_stop(state: tauri::State<'_, MpvState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "mpv state poisoned".to_string())?;
    if let Some(mut old) = guard.take() {
        old.shutdown();
    }
    Ok(())
}
