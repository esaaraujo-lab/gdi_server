// ═══════════════════════════════════════════════════════════════
// Meggy Desktop — llama.cpp Integration (v1.8.0)
// Manages llama-server subprocess for local AI with CPU/GPU offloading.
// Supports: Windows (Vulkan/CUDA), Linux (Vulkan/CPU), macOS (Metal).
// RX470 fix (1.9.10): Windows usa o build Vulkan — o build win-opencl-x64 NAO
// existe na release b5960 (404) e o ROCm/HIP nao suporta Polaris (gfx803).
// ═══════════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};
use tokio::process::{Child, Command};

pub struct LlamaState {
    pub child: Mutex<Option<Child>>,
    pub port: u16,
    pub model_loaded: Mutex<Option<String>>,
}

impl Default for LlamaState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            port: 8082,
            model_loaded: Mutex::new(None),
        }
    }
}

// ─── Tauri Commands ───

#[derive(Serialize)]
pub struct LlamaStatus {
    pub running: bool,
    pub model: Option<String>,
    pub port: u16,
    pub binary_path: String,
    pub models_dir: String,
}

/// Get llama-server status
#[tauri::command]
pub async fn llama_status(state: State<'_, LlamaState>, app: tauri::AppHandle) -> Result<LlamaStatus, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let llama_dir = app_dir.join("llama");
    let binary_path = llama_dir.join("llama-server").to_string_lossy().to_string();
    let models_dir = llama_dir.join("models").to_string_lossy().to_string();

    let running = {
        let child = state.child.lock().unwrap();
        child.is_some()
    };

    let model = {
        state.model_loaded.lock().unwrap().clone()
    };

    Ok(LlamaStatus {
        running,
        model,
        port: state.port,
        binary_path,
        models_dir,
    })
}

/// Detect platform and return the correct llama-server binary download URL
#[derive(Serialize)]
pub struct LlamaBinaryInfo {
    pub url: String,
    pub filename: String,
    pub extract_cmd: String,
    pub backend: String,
}

#[tauri::command]
pub async fn llama_binary_info() -> Result<LlamaBinaryInfo, String> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    // ★ Use llama.cpp prebuilt releases (bXXXX format)
    // https://github.com/ggml-org/llama.cpp/releases
    let release_tag = "b5960"; // stable release

    let (url, filename, extract_cmd, backend) = match (os, arch) {
        ("windows", "x86_64") => {
            // RX470 fix (1.9.10): build Vulkan — o win-opencl-x64 NAO existe na
            // release b5960 (404 verificado) e o HIP/ROCm nao suporta Polaris
            // (gfx803). O driver Vulkan da AMD suporta a RX470 (Vulkan 1.3).
            // extract_cmd aqui e o comando INTERNO (sem "powershell -Command"):
            // llama_download_binary invoca o powershell directamente no Windows.
            (
                format!("https://github.com/ggml-org/llama.cpp/releases/download/{}/llama-{}-bin-win-vulkan-x64.zip", release_tag, release_tag),
                "llama-server.exe".to_string(),
                "Expand-Archive -Path {zip} -DestinationPath {dest} -Force".to_string(),
                "Vulkan (AMD/NVIDIA/Intel)".to_string(),
            )
        }
        ("linux", "x86_64") => {
            (
                format!("https://github.com/ggml-org/llama.cpp/releases/download/{}/llama-{}-bin-ubuntu-x64.zip", release_tag, release_tag),
                "llama-server".to_string(),
                "unzip -o {zip} -d {dest}".to_string(),
                "CPU/Vulkan".to_string(),
            )
        }
        ("macos", "aarch64") => {
            (
                format!("https://github.com/ggml-org/llama.cpp/releases/download/{}/llama-{}-bin-macos-arm64.zip", release_tag, release_tag),
                "llama-server".to_string(),
                "unzip -o {zip} -d {dest}".to_string(),
                "Metal".to_string(),
            )
        }
        ("macos", "x86_64") => {
            (
                format!("https://github.com/ggml-org/llama.cpp/releases/download/{}/llama-{}-bin-macos-x64.zip", release_tag, release_tag),
                "llama-server".to_string(),
                "unzip -o {zip} -d {dest}".to_string(),
                "CPU".to_string(),
            )
        }
        _ => return Err(format!("Plataforma não suportada: {} {}", os, arch)),
    };

    Ok(LlamaBinaryInfo { url, filename, extract_cmd, backend })
}

/// Check if llama-server binary exists
#[tauri::command]
pub async fn llama_binary_exists(app: tauri::AppHandle) -> Result<bool, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let os = std::env::consts::OS;
    let exe_name = if os == "windows" { "llama-server.exe" } else { "llama-server" };
    let binary_path = app_dir.join("llama").join(exe_name);
    Ok(binary_path.exists())
}

/// Download and extract llama-server binary
#[tauri::command]
pub async fn llama_download_binary(app: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let llama_dir = app_dir.join("llama");
    std::fs::create_dir_all(&llama_dir).map_err(|e| e.to_string())?;

    let info = llama_binary_info().await?;
    let zip_path = llama_dir.join("llama-server.zip");

    // Download via curl (available on all platforms in Tauri)
    // RX470 fix: -f faz o curl falhar no HTTP 404 (antes gravava a pagina de
    // erro dentro do zip e a extracao falhava sem explicar).
    let status = Command::new("curl")
        .args(&["-f", "-L", "-o", zip_path.to_str().unwrap(), &info.url])
        .status()
        .await
        .map_err(|e| format!("curl failed: {}", e))?;

    if !status.success() {
        return Err(format!("Download failed: HTTP {}", status));
    }

    // Extract
    // RX470 fix: no Windows nao existe `sh` (stock) — invocar o powershell
    // directamente; `sh -c` so no Unix. O extract_cmd do Windows ja e o
    // comando interno (Expand-Archive ...), sem o prefixo "powershell -Command".
    let extract = info.extract_cmd
        .replace("{zip}", zip_path.to_str().unwrap())
        .replace("{dest}", llama_dir.to_str().unwrap());

    let extract_status = if std::env::consts::OS == "windows" {
        Command::new("powershell")
            .args(&["-NoProfile", "-Command", &extract])
            .status()
            .await
            .map_err(|e| format!("Extract failed: {}", e))?
    } else {
        Command::new("sh")
            .args(&["-c", &extract])
            .status()
            .await
            .map_err(|e| format!("Extract failed: {}", e))?
    };

    if !extract_status.success() {
        return Err(format!("Extract failed: {}", extract_status));
    }

    // RX470 fix: confirmar que o binario existe depois da extracao (o zip
    // pode ter outra estrutura interna noutra release).
    let bin_path = llama_dir.join(&info.filename);
    if !bin_path.exists() {
        return Err(format!(
            "Extração concluída mas {} não foi encontrado em {}.",
            info.filename,
            llama_dir.to_string_lossy()
        ));
    }

    // Cleanup zip
    let _ = std::fs::remove_file(&zip_path);

    // Make executable on Unix
    if std::env::consts::OS != "windows" {
        let exe_path = llama_dir.join("llama-server");
        let _ = Command::new("chmod").args(&["+x", exe_path.to_str().unwrap()]).status().await;
    }

    Ok(llama_dir.join(info.filename).to_string_lossy().to_string())
}

/// Available GGUF models for download (from HuggingFace)
#[derive(Serialize, Deserialize)]
pub struct GgufModel {
    pub id: String,
    pub label: String,
    pub size_mb: u32,
    pub url: String,
    pub filename: String,
    pub description: String,
    pub emoji: String,
    pub recommended_gpu_layers: u32,
}

#[tauri::command]
pub async fn llama_models() -> Result<Vec<GgufModel>, String> {
    Ok(vec![
        GgufModel {
            id: "qwen2.5-1.5b".to_string(),
            label: "Qwen 2.5 — 1.5B".to_string(),
            size_mb: 1000,
            url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf".to_string(),
            filename: "qwen2.5-1.5b-instruct-q4_k_m.gguf".to_string(),
            description: "Rápido (~1GB). Cabe 100% na VRAM de GPUs modestas (RX470). Respostas em ~2-5s.".to_string(),
            emoji: "⚡".to_string(),
            recommended_gpu_layers: 28,
        },
        GgufModel {
            id: "qwen2.5-3b".to_string(),
            label: "Qwen 2.5 — 3B".to_string(),
            size_mb: 2000,
            url: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf".to_string(),
            filename: "qwen2.5-3b-instruct-q4_k_m.gguf".to_string(),
            description: "Equilíbrio (~2GB). Offload parcial CPU/GPU. Boa qualidade, ~5-10s por resposta.".to_string(),
            emoji: "⚖️".to_string(),
            recommended_gpu_layers: 18,
        },
        GgufModel {
            id: "llama-3.2-3b".to_string(),
            label: "Llama 3.2 — 3B".to_string(),
            size_mb: 2000,
            url: "https://huggingface.co/huggingface-llama/llama-3.2-3b-instruct-gguf/resolve/main/llama-3.2-3b-instruct-q4_k_m.gguf".to_string(),
            filename: "llama-3.2-3b-instruct-q4_k_m.gguf".to_string(),
            description: "Meta Llama 3.2 (~2GB). Ótima qualidade, suporta português bem.".to_string(),
            emoji: "🦙".to_string(),
            recommended_gpu_layers: 14,
        },
        GgufModel {
            id: "qwen2.5-7b".to_string(),
            label: "Qwen 2.5 — 7B".to_string(),
            size_mb: 4500,
            url: "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf".to_string(),
            filename: "qwen2.5-7b-instruct-q4_k_m.gguf".to_string(),
            description: "Melhor qualidade (~4.5GB). Offload pesado CPU/GPU. ~10-20s por resposta.".to_string(),
            emoji: "🎓".to_string(),
            recommended_gpu_layers: 10,
        },
    ])
}

/// Download a .gguf model file
#[tauri::command]
pub async fn llama_download_model(model_url: String, filename: String, app: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let models_dir = app_dir.join("llama").join("models");
    std::fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;
    let model_path = models_dir.join(&filename);

    if model_path.exists() {
        return Ok(model_path.to_string_lossy().to_string());
    }

    // Download via curl with resume support
    let status = Command::new("curl")
        .args(&[
            "-L",
            "-o",
            model_path.to_str().unwrap(),
            "-C",
            "-",  // resume
            &model_url,
        ])
        .status()
        .await
        .map_err(|e| format!("curl failed: {}", e))?;

    if !status.success() {
        let _ = std::fs::remove_file(&model_path);
        return Err(format!("Download failed: {}", status));
    }

    Ok(model_path.to_string_lossy().to_string())
}

/// Start llama-server with a model and GPU offload layers
#[tauri::command]
pub async fn llama_start(
    model_path: String,
    gpu_layers: i32,
    state: State<'_, LlamaState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    // Stop existing server if running
    llama_stop_impl(state.inner()).await;

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let os = std::env::consts::OS;
    let exe_name = if os == "windows" { "llama-server.exe" } else { "llama-server" };
    let binary_path = app_dir.join("llama").join(exe_name);

    if !binary_path.exists() {
        return Err("llama-server não encontrado. Baixe o binário primeiro.".to_string());
    }

    if !std::path::Path::new(&model_path).exists() {
        return Err(format!("Modelo não encontrado: {}", model_path));
    }

    let port = state.port;

    // ★ Start llama-server:
    // --model: path to .gguf
    // --n-gpu-layers: how many layers to offload to GPU (-1 = all, 0 = CPU only)
    // --port: localhost port
    // --host: 127.0.0.1 (security — only local access)
    // --ctx-size: context window (4096 is good for chat)
    // RX470 fix: stderr vai para llama-server.log (antes era descartado, e um
    // arranque falhado — ex. vulkan-1.dll em falta — so dava o timeout generico).
    let log_path = app_dir.join("llama").join("llama-server.log");
    let log_file = std::fs::File::create(&log_path).map_err(|e| e.to_string())?;
    let err_file = log_file.try_clone().map_err(|e| e.to_string())?;
    let child = Command::new(&binary_path)
        .args(&[
            "--model", &model_path,
            "--n-gpu-layers", &gpu_layers.to_string(),
            "--port", &port.to_string(),
            "--host", "127.0.0.1",
            "--ctx-size", "4096",
            "--temp", "0.7",
            "--top-p", "0.9",
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::from(err_file))
        .spawn()
        .map_err(|e| format!("Failed to start llama-server: {}", e))?;

    *state.child.lock().unwrap() = Some(child);
    *state.model_loaded.lock().unwrap() = Some(model_path.clone());

    // Wait for server to be ready (health check)
    let client = reqwest::Client::new();
    let mut ready = false;
    for _ in 0..30 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if let Ok(resp) = client.get(format!("http://127.0.0.1:{}/health", port)).send().await {
            if resp.status().is_success() {
                ready = true;
                break;
            }
        }
    }

    if !ready {
        // RX470 fix: incluir a cauda do log no erro (ex. "vulkan-1.dll nao
        // encontrada" ou "no Vulkan device found") em vez da mensagem generica.
        let tail = std::fs::read_to_string(&log_path).unwrap_or_default();
        let tail: String = tail.chars().rev().take(500).collect::<String>().chars().rev().collect();
        let err = format!(
            "llama-server iniciado mas não respondeu em 15s. Pode estar carregando o modelo. Log ({}): {}",
            log_path.display(),
            tail
        );
        // Don't kill — it might still be loading. Let the user retry.
        return Err(err);
    }

    Ok(format!("llama-server rodando em http://127.0.0.1:{}", port))
}

/// Internal stop logic (callable from other commands without State wrapper)
async fn llama_stop_impl(state: &LlamaState) {
    // ★ v1.8.3: Take child out of mutex in a block scope, then drop guard BEFORE await.
    // MutexGuard is not Send — can't hold it across .await points.
    let child = {
        let mut guard = state.child.lock().unwrap();
        guard.take()
    };
    // Guard is now dropped — safe to await
    if let Some(mut child) = child {
        let _ = child.kill().await;
        let _ = child.wait().await;
    }
    *state.model_loaded.lock().unwrap() = None;
}

/// Stop llama-server
#[tauri::command]
pub async fn llama_stop(state: State<'_, LlamaState>, _app: tauri::AppHandle) -> Result<bool, String> {
    llama_stop_impl(state.inner()).await;
    Ok(true)
}

/// Chat with llama-server (OpenAI-compatible API)
#[derive(Deserialize)]
pub struct LlamaChatRequest {
    pub message: String,
    pub system_prompt: Option<String>,
}

#[derive(Serialize)]
pub struct LlamaChatResult {
    pub text: String,
    pub ok: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn llama_chat(
    req: LlamaChatRequest,
    state: State<'_, LlamaState>,
) -> Result<LlamaChatResult, String> {
    let running = state.child.lock().unwrap().is_some();
    if !running {
        return Ok(LlamaChatResult {
            text: "".to_string(),
            ok: false,
            error: Some("llama-server não está rodando. Inicie o servidor primeiro.".to_string()),
        });
    }

    let port = state.port;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let system = req.system_prompt.unwrap_or_else(|| {
        "Você é a Meggy — uma poodle tutora de estudos brasileira. 🐩 Responda em português, clara e objetiva.".to_string()
    });

    let body = serde_json::json!({
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": req.message }
        ],
        "temperature": 0.7,
        "max_tokens": 2048,
        "stream": false
    });

    let resp = client
        .post(format!("http://127.0.0.1:{}/v1/chat/completions", port))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Ok(LlamaChatResult {
            text: "".to_string(),
            ok: false,
            error: Some(format!("HTTP {}: {}", status, text.chars().take(200).collect::<String>())),
        });
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let text = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    if text.is_empty() {
        return Ok(LlamaChatResult {
            text: "".to_string(),
            ok: false,
            error: Some("Resposta vazia do modelo.".to_string()),
        });
    }

    Ok(LlamaChatResult { text, ok: true, error: None })
}

/// List downloaded .gguf models
#[tauri::command]
pub async fn llama_list_models(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let models_dir = app_dir.join("llama").join("models");
    if !models_dir.exists() {
        return Ok(vec![]);
    }
    let mut models = vec![];
    if let Ok(entries) = std::fs::read_dir(&models_dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if name.ends_with(".gguf") {
                    models.push(name.to_string());
                }
            }
        }
    }
    Ok(models)
}
