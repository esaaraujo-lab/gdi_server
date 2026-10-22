# OpenMac × Meggy — Análise de Compatibilidade

> Documento gerado pela tarefa **3-OPENMAC-DEEP-RESEARCH**.
> Foco: avaliar em profundidade o repositório [`echosoar/openmac`](https://github.com/echosoar/openmac) e a sua viabilidade como parte da plataforma **Meggy** (web app em `educa.eu.org`, backend em Cloudflare Workers, app desktop Tauri 2.0).

---

## 1. O que é o OpenMac

**OpenMac** é um aplicativo desktop **macOS-only**, escrito em **Swift / SwiftUI**, que executa um **servidor HTTP local** (porta padrão `8080`) e expõe, como endpoints REST, capacidades nativas do sistema operacional Apple — **OCR**, **tradução**, **fetch de página web renderizada**, **busca web agregada**, **detecção de faces**, **leitura de QR/barcode** e **text-to-speech (TTS)**.

| Metadado | Valor |
|---|---|
| Repositório | https://github.com/echosoar/openmac |
| Autor | Soar / codersoar |
| Licença | **MIT** (Copyright 2026 Soar) |
| Versão atual | `0.5` (`version.txt`) |
| Linguagem | Swift (100 % do código) |
| Plataforma | **macOS 15+** (Translation framework exige macOS 15+) |
| Stars / forks | ~128 ★ / 7 forks (ativo; última atualização 2026-10-09) |
| Releases | Nenhuma release GitHub publicada ainda (apenas código-fonte) |
| Build | `xcodebuild -project openmac.xcodeproj -scheme openmac -configuration Debug CODE_SIGNING_ALLOWED=NO build` |
| Entitlements | Plist vazio (sem sandbox) |
| Dependências | **Zero externas** (sem Vapor, sem Kitura, sem Perfect — só frameworks Apple) |

A proposta central do projeto é oferecer uma **alternativa gratuita e local** a serviços cloud pagos de visão/linguagem. Toda a "inteligência" vem de frameworks do próprio macOS: **Vision**, **Translation**, **AVFoundation**, **WebKit**, **ImageIO**, **ServiceManagement** e **Network.framework**. Não há chamada a OpenAI, Anthropic, Google Cloud, etc.

### Estrutura do repositório

```
echosoar/openmac
├── Sources/openmac/
│   ├── openmac.swift                 (427 B)   @main SwiftUI entry, #if os(macOS)
│   ├── OpenMacCore.swift             (1 115 linhas / 43.6 KB)
│   └── OpenMacServer_macOS.swift     (1 704 linhas / 66.3 KB)
├── Tests/
├── openmac.xcodeproj/
├── openmac.entitlements              (vazio)
├── README.md                         (359 linhas, bilíngue EN/中文)
├── DEVELOPMENT.md                    (build instructions)
├── LICENSE                           (MIT)
├── version.txt                       (0.5)
├── assets/                           (AppIcon128.png)
└── .github/
```

Apenas **3 arquivos Swift** compõem todo o código. O projeto é deliberadamente minimalista.

---

## 2. Arquitetura do OpenMac

### 2.1 Diagrama textual

```
┌─────────────────────────────────────────────────────────────────────┐
│  App SwiftUI (@main OpenMacApp)                                     │
│  └── OpenMacView                                                    │
│        ├── campo Port (default 8080)                                │
│        ├── toggle Enable / Disable                                  │
│        ├── toggle Launch at Login  (SMAppService.mainApp)           │
│        ├── botão Check for Updates  (GitHub Releases API)           │
│        ├── Config → multiselect Search Engines                      │
│        └── lista APIEndpointRow (documentação inline)               │
│                                                                     │
│  OpenMacAppModel (ObservableObject, @Published)                     │
│        portText · isEnabled · launchAtLogin · enabledSearchEngines  │
│        isCheckingUpdate · updateInfo · errorMessage                 │
└──────────────┬──────────────────────────────────────────────────────┘
               │ toggleServer(true) → startServer(port)
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  OpenMacHTTPServer  (Network.framework · NWListener TCP cru)        │
│  ├── queue DispatchQueue("openmac.server")                          │
│  ├── listener: NWListener(.tcp, port)                              │
│  └── connections: [ObjectIdentifier: ConnectionHandler]             │
└──────────────┬──────────────────────────────────────────────────────┘
               │ newConnection → ConnectionHandler
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ConnectionHandler  (parse HTTP request → route → JSON response)    │
│  └── OpenMacRequestRouter.switch request.path                       │
└──────────────┬──────────────────────────────────────────────────────┘
               │
       ┌───────┴────────┬──────────┬──────────┬──────────┬──────────┐
       ▼                ▼          ▼          ▼          ▼          ▼
  OCRService     FaceDetect   Barcode     TTS      WebContent    WebSearch
  (Vision        Service      Detect      Service  Renderer       Service
  VNDetect       VNDetect     VNDetect    AVSpeech (WKWebView     (6 engines
  TextRequest)   FaceLand-    Barcodes)   Synthes.  headless,     em paralelo
                 marks                    izer     waitUntil)    3 por vez)
                                                                                  │
                                          ▼
                              TranslationService
                              (TranslationSession — macOS 15+)
                              TranslationBridge / TranslationBridgeView
```

**Servidor HTTP**: o OpenMac **não usa Vapor/Kitura/Perfect**. O `OpenMacHTTPServer` cria um `NWListener` (TCP cru via Network.framework), gerencia conexões manualmente com `ConnectionHandler`, parseia o HTTP request à mão e produz respostas HTTP também manualmente. Tudo corre em `DispatchQueue(label: "openmac.server")` dedicada.

### 2.2 Endpoints HTTP expostos (8 no total)

Todo endpoint `/api/*` retorna o envelope uniforme:

```json
{ "success": true, "timeCost": 42, "data": { ... }, "message": "" }
```

Em erro: `success=false`, `data={}`, `message` explica. `timeCost` é o tempo de processamento no servidor em milissegundos.

| # | Método | Path | Framework nativo | Descrição |
|---|--------|------|------------------|-----------|
| 1 | `GET` | `/SKILL.md` | (gerado em runtime) | Documento Markdown auto-gerado descrevendo todos os endpoints; reflete host:porta atuais. Retorna `text/markdown`, **não** o envelope JSON. |
| 2 | `POST`\|`GET` | `/api/ocr` | **Vision** (`VNDetectTextRectangles` + `VNRecognizeTextRequest`) | OCR de imagem. Input: `url` \| `base64` \| `file` (exatamente um). Output: `data.text` (todas as linhas concatenadas) + `data.lines` (array por linha). |
| 3 | `POST`\|`GET` | `/api/translate` | **Translation framework** (macOS 15+) | Tradução via `TranslationSession.Configuration`. Input: `text` + `to` (obrigatório), `from` (opcional, auto-detectado). Output: `data.text` traduzido. |
| 4 | `POST`\|`GET` | `/api/web-content` | **WebKit** (`WKWebView` headless) | Carrega URL em WKWebView invisível e retorna HTML renderizado. `waitUntil`: `domcontentloaded` (default) \| `networkidle0` \| `networkidle2`. `timeout` default 30 000 ms. Output: `data.html`. |
| 5 | `POST`\|`GET` | `/api/search` | **WebKit** + scraping | Busca em paralelo nos engines habilitados em Config (Bing, Google, DuckDuckGo, Brave, Wikipedia, arXiv). Máx. 3 engines simultâneos, 10 s cada, tolerante a falhas parciais. Output: `data.list` = `[{title, description, url}, ...]`. |
| 6 | `POST`\|`GET` | `/api/face` | **Vision** (`VNDetectFaceLandmarksRequest`) | Detecção de faces: bounding box, roll/yaw/pitch, landmarks (olhos, nariz, boca) e featureVector (print facial). `draw=true` retorna `data.image` (PNG base64) com anotações. |
| 7 | `POST`\|`GET` | `/api/qrcode` | **Vision** (`VNDetectBarcodesRequest`) | Detecta QR codes e barcodes. Output: `data.barcodes` = `[{payload, symbology, boundingBox}, ...]`. Symbologies: `VNBarcodeSymbologyQR`, `VNBarcodeSymbologyEAN13`, etc. |
| 8 | `POST`\|`GET` | `/api/tts` | **AVFoundation** (`AVSpeechSynthesizer`) | Síntese de fala. Parâmetros: `text` (obrigatório), `language` (BCP-47), `voice`, `rate` (0–1), `pitch` (0.5–2), `volume` (0–1). Output: `data.audio` = WAV em base64. |

### 2.3 Funcionamento da app

- **Enable toggle**: liga/desliga o `OpenMacHTTPServer`. Se a porta já estiver ocupada, o `stateHandler` reporta `.failed("Address already in use")` e a UI mostra erro.
- **Launch at Login**: implementado via `SMAppService.mainApp.register()` / `.unregister()` (ServiceManagement framework, macOS 13+). Toggle persiste em sistema.
- **Update Checker**: enum `UpdateChecker` faz `URLSession.shared.data(from: https://api.github.com/repos/echosoar/openmac/releases/latest)`, parseia `name` ou `tag_name` com regex `\d+\.\d+(?:\.\d+)?`, compara com `Bundle.main.CFBundleShortVersionString`, e em caso de versão mais nova, abre `https://github.com/echosoar/openmac/releases` no navegador via `NSWorkspace`. **Não há auto-update binário** — apenas avisa e direciona ao navegador.
- **Config de search engines**: `SearchEngineConfiguration` persiste engines habilitados em `UserDefaults` (`"enabledSearchEngines"`). Default: Bing, Google, DuckDuckGo, Brave.
- **SKILL.md generator**: o endpoint `GET /SKILL.md` monta o documento Markdown em runtime a partir da estrutura `APIEndpoint` em `OpenMacCore.swift`. Os exemplos de URL refletem o host:porta atuais (ex.: `http://localhost:8080/api/ocr`), então se o usuário trocar a porta, o doc auto-ajusta.

---

## 3. Stack Tecnológica — OpenMac × Meggy

| Camada | OpenMac | Meggy |
|--------|---------|-------|
| **Plataforma-alvo** | macOS 15+ (cliente desktop) | Web (workers edge) + Desktop Win/Linux/Mac (Tauri) + Android + Roku |
| **Linguagem backend** | Swift 5.9+ | JavaScript (Cloudflare Workers V8) |
| **Runtime** | Processo nativo no macOS (binário Mach-O) | V8 isolate gerenciado pela Cloudflare (edge network) |
| **Servidor HTTP** | `NWListener` TCP cru (Network.framework), parse manual | O próprio runtime CF Workers recebe HTTP via handler `fetch(request, env, ctx)` |
| **UI** | SwiftUI nativa (WindowGroup, OpenMacView, ConfigView) | HTML/CSS/JS vanilla no web; Tauri (WebView2/WKWebView) no desktop |
| **Persistência** | `UserDefaults` (preferências), sem DB | D1 (SQLite), R2 (objetos), KV (key-value), Durable Objects |
| **OCR** | Vision (`VNDetectTextRequest`) | CF Workers AI (binding `env.ai`); endpoint `POST /api/ai/ocr` |
| **Tradução** | Translation framework (macOS 15+) | Não implementado; poderia usar `@cf/meta/m2m100-1.2b` ou LLM |
| **TTS** | `AVSpeechSynthesizer` (offline, vozes do sistema) | Não implementado; poderia usar CF Workers AI speech (`@cf/myshell-ai/melotts`) ou API externa |
| **Fetch web renderizado** | `WKWebView` headless com `waitUntil` (idle 0/2, DOM ready) | `fetch()` direto no worker (sem JS runtime de navegador); para render JS pesado, seria necessário Browser Rendering API da CF |
| **Busca web** | Scraping via `WKWebView` em 6 engines | Não há agregador nativo; poderia usar `fetch()` em APIs (Brave Search API, Bing API, DDG API) |
| **Detecção facial** | Vision (`VNDetectFaceLandmarksRequest`) | Sem equivalente; poderia usar modelos de visão da Workers AI |
| **QR / barcode** | Vision (`VNDetectBarcodesRequest`) | Sem equivalente; seria necessário WASM com zxing ou similar |
| **Auto-update** | `UpdateChecker` (GitHub Releases API + regex + abrir navegador) | `tauri-plugin-updater` (downloads binário assinado de `latest.json`) no desktop; sem update server-side |
| **Launch at login** | `SMAppService.mainApp` (macOS 13+) | `tauri-plugin-autostart` (Win/Linux/Mac, multiplataforma) |
| **Single-instance** | Não tratado (SwiftUI WindowGroup permite múltiplas) | `tauri-plugin-single-instance` |
| **Custo de execução** | Zero (tudo offline, no hardware do usuário) | Pago por request pela Cloudflare (Free tier: 100k req/dia) + Workers AI por token |
| **Latência** | Local (~1–50 ms típico) | Edge (~10–80 ms) + tempo de modelo de IA |
| **Disponibilidade** | Só funciona com o Mac ligado e a app aberta | 24/7, multi-região, escalar horizontalmente |
| **Privacidade** | Dados nunca saem do Mac do usuário | Dados transitam pelo edge CF; Workers AI roda na rede CF |
| **Multiplataforma** | ❌ macOS-only | ✅ Web + Win + Linux + Mac + Android + Roku |

---

## 4. Compatibilidade Direta — ❌ INCOMPATÍVEL

O OpenMac **não pode ser instalado, executado, linkado, embutido ou portado de forma direta** para dentro do stack Meggy. As razões técnicas são estruturais e não negotiáveis:

### 4.1 Binário Swift vs V8 isolate

O OpenMac é compilado para **binário Mach-O** (formato executável do macOS) usando toolchain Xcode + Swift. Ele é linkado contra frameworks dinâmicos do sistema:
- `/System/Library/Frameworks/Vision.framework`
- `/System/Library/Frameworks/Translation.framework`
- `/System/Library/Frameworks/AVFoundation.framework`
- `/System/Library/Frameworks/WebKit.framework`
- `/System/Library/Frameworks/Network.framework`
- `/System/Library/Frameworks/ServiceManagement.framework`
- `/System/Library/Frameworks/ImageIO.framework`

**Cloudflare Workers rodam em V8 isolates** que aceitam **apenas JavaScript e WebAssembly**. Não há:
- runtime Swift,
- runtime Objective-C,
- linkagem dinâmica de `.framework` Apple,
- runtime Objective-C runtime (`objc_msgSend`, etc.),
- ABI Mach-O.

Não existe "compilar Swift para Workers". A linguagem Swift compila para: (a) binário nativo (macOS/iOS/Linux/Windows), ou (b) WASM via `swiftwasm` toolchain — mas mesmo no caso WASM, **os frameworks Apple (Vision, Translation, AVFoundation, WebKit) não existem em WASM**, são APIs nativas do macOS. Portanto mesmo recompilando o código Swift para WASM, todo o `OpenMacServer_macOS.swift` falharia ao importar esses frameworks.

### 4.2 Frameworks Apple indisponíveis fora do macOS

| Framework do OpenMac | Disponibilidade fora de macOS | Disponibilidade no Cloudflare Workers |
|---|---|---|
| Vision (`VNImageRequestHandler`, `VNDetect*Request`) | ❌ iOS/tvOS apenas (não é cross-platform) | ❌ Inexistente |
| Translation (`TranslationSession`) | ❌ macOS 15+ apenas | ❌ Inexistente |
| AVFoundation (`AVSpeechSynthesizer`) | ⚠️ Parcial em iOS, não em Linux/Windows | ❌ Inexistente |
| WebKit (`WKWebView` headless) | ❌ macOS/iOS apenas | ❌ Workers não têm engine de navegador |
| Network.framework (`NWListener`) | ❌ Apple-only | ❌ Workers não abrem sockets TCP listening |
| ServiceManagement (`SMAppService`) | ❌ macOS 13+ apenas | ❌ Inexistente |
| ImageIO (`CGImage`) | ❌ Apple-only | ❌ Inexistente |

### 4.3 Localhost vs edge

O OpenMac escuta em `localhost:8080` — é um servidor **na máquina do usuário**. Workers da Cloudflare **são servidores no edge** que recebem HTTP via handler `fetch()`. Um worker **não pode**:
- chamar `localhost` do usuário (browser security: CORS + mixed content),
- abrir um `NWListener` (não há socket server API),
- bindar uma porta TCP.

Mesmo a hipótese "um Meggy worker chama o OpenMac do usuário via HTTP" falha: o OpenMac está em `http://localhost:8080` na máquina do usuário, **inacessível pela internet**. Para isso funcionar, o usuário teria que expor a porta 8080 via tunnel público (Cloudflare Tunnel, ngrok, etc.), o que adiciona complexidade e risco de segurança.

### 4.4 CPU time limits e persistência

- OpenMac: processo longo, stateful, sem limite de CPU. Pode carregar `WKWebView`, esperar 30 s de `networkidle0`, persistir estado em memória.
- Cloudflare Workers: **10 s** de CPU time no plano Free (30 s no Bundled). Sem `setTimeout` maior que ~30 s. Sem filesystem persistente. Sem estado em memória entre requests (a menos que use Durable Objects, pagos à parte).

Vários endpoints do OpenMac (`/api/web-content` com `networkidle0` e `timeout=30000`, `/api/search` com 10 s por engine) **estourariam o limite de CPU do worker**.

### 4.5 Conclusão de §4

Não há caminho de portabilidade direta. **OpenMac é, por construção, incompatível com o runtime do Cloudflare Workers** — não é uma questão de engineering effort, é uma impossibilidade técnica fundamental.

---

## 5. Compatibilidade Indireta — ⚠️ PARCIAL

Apesar de incompatível como código, o OpenMac apresenta **3 padrões de design** que podem ser emprestados como referência arquitetural. Todos eles já têm equivalente (ou superior) no Meggy:

### 5.1 `UpdateChecker` (GitHub Releases API)

**Padrão OpenMac** (`OpenMacServer_macOS.swift:169-215`):
```swift
enum UpdateChecker {
    static let apiURL = URL(string:
        "https://api.github.com/repos/echosoar/openmac/releases/latest")!
    static func fetchLatestRelease() async throws -> UpdateInfo {
        let (data, response) = try await URLSession.shared.data(from: apiURL)
        // ... parse JSON
        let version = parseVersion(from: name) ?? parseVersion(from: tag)
        // regex: \d+\.\d+(?:\.\d+)?
        return UpdateInfo(version: version, htmlURL: htmlURL)
    }
}
```

**No Meggy**: o `meggy-desktop` Tauri já tem **melhor** — `tauri-plugin-updater` que baixa e instala binário assinado via `latest.json` em `https://github.com/esaaraujo-lab/gdi_server/releases/latest/download/latest.json`. Não precisa abrir navegador; instala sozinho.

### 5.2 `LaunchAtLoginService` (SMAppService)

**Padrão OpenMac** (`OpenMacServer_macOS.swift:139-156`):
```swift
enum LaunchAtLoginService {
    static var isEnabled: Bool {
        SMAppService.mainApp.status == .enabled
    }
    static func setEnabled(_ enabled: Bool) {
        if enabled { try SMAppService.mainApp.register() }
        else { try SMAppService.mainApp.unregister() }
    }
}
```

**No Meggy**: `tauri-plugin-autostart` (Rust) já cubre Windows (registry `HKCU\...\Run`), Linux (`~/.config/autostart/*.desktop`) e macOS (`SMAppService`/LaunchAgent). Multiplataforma, mesma UX.

### 5.3 Padrão `SKILL.md` (auto-documentação)

**Padrão OpenMac**: endpoint `GET /SKILL.md` que **gera em runtime** um documento Markdown descrevendo todos os endpoints, com as URLs refletindo host:porta atuais. Útil para agentes de IA que descobrem a API do serviço sozinhos.

**No Meggy**: o worker.js tem ~70 endpoints. Escrever um `GET /SKILL.md` equivalente que os liste com método + path + schema + exemplo **seria genuinamente útil** — é um padrão emprestável. Implementação trivial:
```js
// em worker.js
if (url.pathname === '/SKILL.md') {
  return new Response(renderSkillMarkdown(req.url), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
  });
}
```

### 5.4 Padrão "shell nativo sem framework"

OpenMac prova que dá pra fazer um app desktop útil **sem Vapor/Kitura/Perfect** (só `NWListener` cru). No Windows/Linux equivaleria a `tiny_http`/`axum` (Rust) ou `HttpListener` (.NET). **No Meggy isso não é necessário** — o desktop Tauri já fornece WebView2/WKWebView como UI, então um servidor HTTP local extra seria redundante.

### 5.5 Padrão envelope JSON uniforme

OpenMac usa `{success, timeCost, data, message}` em **todos** os `/api/*`. O worker.js do Meggy já usa padrão similar (`{ok, response, error, provider}` etc.) — apenas menos consistente. **Padrão a unificar** no Meggy, mas não depende do OpenMac.

### 5.6 Veredito de §5

Nada que valha a pena "emprestar" do OpenMac está **ausente** no Meggy. Os padrões 5.1, 5.2 e 5.4 já existem em versão superior no `meggy-desktop` Tauri. Restam apenas:
- **5.3** (`/SKILL.md` auto-gerado) — vale implementar no worker.js, independente do OpenMac.
- **5.5** (uniformizar envelope JSON no worker) — tarefa interna de refactor.

---

## 6. Instalar OpenMac no Cloudflare Workers? — ❌ NÃO

Esta pergunta tem resposta **definitiva negativa** por motivos estruturais:

### 6.1 Não existe "instalar" no modelo do Workers

Cloudflare Workers é **serverless edge compute**: você faz upload do bundle JS/WASM via `wrangler deploy` e o runtime executa o handler `fetch(request, env, ctx)`. Não há:
- sistema operacional hospedeiro acessível,
- instalação de pacotes `.app` / `.deb` / `.msi`,
- execução de binários externos (sem `fork()`, sem `exec()`, sem `system()`),
- acesso a `/Applications/` ou `/usr/local/bin/`,
- permissão para subir processo filho.

### 6.2 O OpenMac é um binário, não uma biblioteca

O OpenMac é um **app SwiftUI** que abre janela, ícone na Dock, toggle em UI. Não foi projetado como library linkável. Não tem `Package.swift` (não é Swift Package). Não expõe API C-ABI. Mesmo que existisse um runtime Swift em Workers (não existe), você não conseguiria importar `openmac.app` como módulo.

### 6.3 Comparação lado a lado

| Pergunta | OpenMac | CF Workers (Meggy backend) |
|---|---|---|
| Onde roda? | Máquina do usuário (cliente) | Edge da Cloudflare (servidor) |
| O que executa? | Binário Mach-O Swift | Bytecode JavaScript/WASM em V8 isolate |
| Como é deployado? | Usuário arrasta `.app` para `/Applications/` | `wrangler deploy` faz upload do bundle |
| Cobre que plataformas? | macOS 15+ apenas | Todas (qualquer cliente HTTP) |
| Quem paga o custo? | Usuário (CPU/energia do próprio Mac) | Cloudflare (Free tier 100k req/dia + Workers AI por token) |
| Tem UI? | Sim (SwiftUI nativa) | Não (só endpoints HTTP) |

**Analogia**: é como perguntar "posso instalar Photoshop dentro do Gmail?". São camadas diferentes, runtimes diferentes, propósitos diferentes.

### 6.4 Tentativas viáveis e por que falham

| Tentativa | Por que falha |
|---|---|
| Cross-compilar Swift para WASM e subir como worker | Frameworks Apple (Vision/Translation/WebKit/AVFoundation) não existem em WASM |
| Reescrever OpenMac em JS usando libs npm equivalentes | Não há `tesseract.js` no caminho de Vision quality; sem `WKWebView` em worker; sem `AVSpeechSynthesizer` em V8 |
| Embeddar OpenMac via Docker/Cloudflare Containers | CF Workers ≠ CF Containers; Containers é produto pago separado, roda Linux x86 (não macOS), não tem Vision/Translation/AVFoundation |
| Usar OpenMac como subprocesso via `child_process` | Workers não têm `child_process` (sem Node.js API; só Web APIs) |
| Tunnel reverso do OpenMac local até o worker | Worker chamaria `https://usuario-tunnel.dev/...` — adiciona latência, exige tunnel rodando, não escala para múltiplos usuários |

---

## 7. Cenário Alternativo: OpenMac como servidor local do desktop Meggy

A pergunta interessante: **e se o `meggy-desktop` (Tauri 2.0) chamasse o OpenMac localmente em vez do Workers AI para OCR/TTS?**

### 7.1 Hipótese de uso

O desktop Tauri, rodando em macOS, detectaria que o usuário tem o OpenMac instalado (`http://localhost:8080`) e o usaria como **backend local** para:
- `POST /api/ocr` → substituir `POST https://educa.eu.org/api/ai/ocr`
- `POST /api/tts` → substituir chamada cloud
- `POST /api/translate` → substituir LLM cloud

### 7.2 Prós (em macOS apenas)

- ✅ **Zero custo cloud** — não consome Workers AI tokens nem requests do worker
- ✅ **Baixa latência** — OCR/TTS local é ~1–50 ms vs ~200–2000 ms via cloud
- ✅ **Funciona offline** — sem internet, OCR/TTS continuam funcionando
- ✅ **Privacidade absoluta** — imagens nunca saem do Mac do usuário
- ✅ **Qualidade de OCR** — Vision é geralmente superior a `@cf/llava-...` para texto impresso

### 7.3 Contras (críticos)

- ❌ **macOS-only**: o `meggy-desktop` Tauri 2.0 é multiplataforma (Win + Linux + Mac). O OpenMac **não funciona em Windows nem em Linux**. Adotar OpenMac como backend quebra a estratégia multi-OS do desktop.
- ❌ **Usuário precisa instalar o OpenMac separadamente** — mais um app para o usuário baixar, atualizar, manter. Friction de onboarding.
- ❌ **Duplicação de manutenção** — duas fontes de verdade para OCR/TTS/translate: o worker.js (CF Workers AI) e o OpenMac. Bugs, schemas, contratos têm que ser mantidos em sincronia.
- ❌ **Sem versão estável** — OpenMac está em `0.5`, sem release GitHub publicada, autor único, sem SLA.
- ❌ **Sem autenticação** — OpenMac escuta em `0.0.0.0:8080` sem auth; qualquer app na rede local pode chamar. Risco de segurança em LANs compartilhadas.
- ❌ **Requer macOS 15+** para `/api/translate` (Translation framework). Usuários em macOS 14 ou anterior não teriam tradução.
- ❌ **Não cobre face/QR** — Meggy não usa esses endpoints hoje, então é capacidade desperdiçada.
- ❌ **Sem métricas/observabilidade** — OpenMac não tem logs estruturados nem dashboard de uso; Meggy depende de CF Analytics + D1 queries.

### 7.4 Veredito

**Para o `meggy-desktop` multiplataforma (Win+Linux+Mac), NÃO vale a pena integrar o OpenMac.**

- O Tauri já tem tudo que precisa (WebView2/WKWebView + Rust + plugin autostart + plugin updater).
- A integração introduziria uma dependência **macOS-only** num produto **multi-OS**, criando dois paths de código (Mac usa OpenMac, Win/Linux usa Workers AI) — isso é exatamente o anti-pattern "platform-specific fork".
- A economia de custo cloud seria marginal: o Meggy está no Free tier da CF (100k req/dia) e os tokens do Workers AI são baratos.
- A latência cloud via edge CF é ~10–80 ms, aceitável para UX de OCR/TTS em desktop com internet.

**Exceção viável**: se no futuro o Meggy quiser uma feature offline-first robusta **somente em macOS** (ex.: modo "kiosk" para escolas sem internet), aí o OpenMac seria uma opção de estudo — mas mesmo assim, re-implementar OCR/TTS em Rust cross-platform (via `tesseract-rs` + `coqui-tts` WASM) seria mais alinhado com a stack Tauri.

---

## 8. O que o Meggy JÁ tem equivalente ao OpenMac

| Funcionalidade OpenMac | Endpoint OpenMac | Equivalente no Meggy/CF Workers | Status |
|---|---|---|---|
| OCR de imagens | `POST /api/ocr` (Vision) | `POST /api/ai/ocr` (Workers AI, binding `env.ai`) | ✅ Já existe (desde v1.0.196) |
| Tradução | `POST /api/translate` (Translation fw) | LLM (`@cf/meta/llama-3.1-8b-instruct`) via prompt "traduza para X" | ✅ Já existe via `/api/ai/*` chat; modelo dedicado `@cf/meta/m2m100-1.2b` disponível se quiser |
| Web content fetch | `POST /api/web-content` (WKWebView) | `fetch()` direto no worker (sem JS rendering) | ⚠️ Parcial — Workers não renderizam JS; para JS rendering real, usar CF Browser Rendering API |
| Web search | `POST /api/search` (6 engines) | Não há agregador; could use Brave Search API / Bing API | ❌ Ausente — mas baixa prioridade |
| Detecção facial | `POST /api/face` (Vision) | Sem equivalente; poderia usar `@cf/llava-...` com prompt visual | ❌ Ausente — não é caso de uso do Meggy |
| QR / barcode | `POST /api/qrcode` (Vision) | Sem equivalente; seria necessário `zxing-wasm` | ❌ Ausente — não é caso de uso do Meggy |
| TTS | `POST /api/tts` (AVSpeech) | Não implementado; `@cf/myshell-ai/melotts` ou `@cf/meta/m2m100-1.2b` (não é TTS, é translation) | ❌ Ausente — poderia adicionar |
| Auto-update | `UpdateChecker` (GitHub Releases) | `tauri-plugin-updater` (download + verify + install auto) | ✅ Já existe, **superior** |
| Launch at login | `SMAppService` (macOS) | `tauri-plugin-autostart` (Win/Linux/Mac) | ✅ Já existe, **multiplataforma** |
| SKILL.md auto-doc | `GET /SKILL.md` | Não há | ❌ Ausente — **padrão vale implementar** |
| Envelope JSON uniforme | `{success, timeCost, data, message}` | Misto (`{ok, response, error, provider}` etc.) | ⚠️ Parcial — vale padronizar |
| Shell nativo sem framework | `NWListener` cru | `tauri::Builder` (Rust) | ✅ Já existe, com WebView incluso |

### 8.1 Modelos CF Workers AI atualmente usados pelo Meggy

Conforme `worker.js` (v1.0.185+):
- `@cf/meta/llama-3.1-8b-instruct` — chat principal, OCR (via prompt), resumos
- `@cf/meta/llama-3.2-1b-instruct` — fallback rápido
- `@cf/meta/llama-3.2-3b-instruct` — equilibrado
- `@cf/meta/llama-3.1-70b-instruct` — qualidade alta
- `@cf/meta/llama-3.3-70b-instruct` — maior qualidade
- `@cf/qwen/qwq-32b` — questões
- `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` — matemática
- `@cf/meta/infire-llama-3.1-8b-instruct` — variantes

### 8.2 Modelos CF Workers AI que cobririam o resto do OpenMac

| Capacidade OpenMac | Modelo CF equivalente |
|---|---|
| Tradução dedicada (estilo Translation fw) | `@cf/meta/m2m100-1.2b` (translation model) |
| OCR visual (estilo Vision) | `@cf/llava-1.5-7b-hf` ou `@cf/unum/uform-gen2-qwen-500m` (vision-language) |
| TTS (estilo AVSpeechSynthesizer) | `@cf/myshell-ai/melotts` (multilingual TTS) |
| Detecção facial | Sem modelo direto; LLaVA com prompt visual "describe face positions" |
| QR / barcode | Sem modelo direto; usar `zxing-wasm` em vez de IA |

Todos os modelos acima rodam **no mesmo V8 isolate do worker** via `env.ai.run(model, params)` — sem servidor local, sem macOS, sem binário extra.

---

## 9. Recomendação Final

### 9.1 Decisão principal

> **NÃO adotar o OpenMac** na plataforma Meggy — nem como dependência do worker, nem como servidor local do desktop, nem como template para novos apps.

Justificativa resumida:
1. **Incompatível com CF Workers** por construção (binário Swift + frameworks Apple vs V8 isolate JS/WASM). Impossibilidade técnica fundamental, não de engineering.
2. **macOS-only**, enquanto o Meggy é multiplataforma (Web + Win + Linux + Mac + Android + Roku). Adotar OpenMac quebraria a estratégia multi-OS.
3. **Todos os padrões úteis do OpenMac** (auto-update, launch-at-login, shell nativo) **já existem em versão superior** no `meggy-desktop` Tauri.
4. **Toda a capacidade funcional do OpenMac** (OCR, translate, TTS, visão) **tem equivalente ou superior** no CF Workers AI — que já é o backend do Meggy.
5. **Sem release estável** (v0.5, autor único, sem SLA) — risco de adoção.

### 9.2 Itens aproveitáveis (independentes do OpenMac)

Mesmo não adotando o OpenMac, dois padrões observados nele valem implementar no Meggy:

| Item | Onde implementar | Esforço | Valor |
|---|---|---|---|
| `GET /SKILL.md` auto-gerado listando endpoints do worker.js | `worker.js` | ~2 h | Alto — facilita onboarding de IA agents e devs |
| Uniformizar envelope JSON em todos os `/api/*` do worker.js | `worker.js` refactor | ~4 h | Médio — consistência, menor código cliente |

### 9.3 Próximos passos sugeridos (não bloqueantes)

1. **Adicionar `@cf/meta/m2m100-1.2b`** ao worker.js como endpoint `POST /api/ai/translate` dedicado a tradução (melhor que usar LLM para isso).
2. **Adicionar `@cf/myshell-ai/melotts`** ao worker.js como endpoint `POST /api/ai/tts` (cobre a única capacidade OpenMac que o Meggy não tem hoje).
3. **Implementar `GET /SKILL.md` no worker.js** — Markdown auto-gerado a partir de uma tabela de rotas interna. Padrão OpenMac, ~30 linhas de JS.
4. **Não** investir em face/QR/barcode detection — não há caso de uso no Meggy.

### 9.4 Veredito final

OpenMac é um **excelente projeto de referência** para quem quer construir um app macOS-only de IA local. Para o Meggy — que é cloud-first, multiplataforma, baseado em CF Workers — ele é **incompatível por design** e desnecessário como dependência. O único aproveitamento real é o **padrão `/SKILL.md`**, que deve ser implementado independentemente.

---

## 10. Links

- **OpenMac (repo)**: https://github.com/echosoar/openmac
- **OpenMac (README raw)**: https://raw.githubusercontent.com/echosoar/openmac/main/README.md
- **OpenMac (OpenMacServer_macOS.swift raw)**: https://raw.githubusercontent.com/echosoar/openmac/main/Sources/openmac/OpenMacServer_macOS.swift
- **OpenMac (OpenMacCore.swift raw)**: https://raw.githubusercontent.com/echosoar/openmac/main/Sources/openmac/OpenMacCore.swift
- **Meggy (web app)**: https://educa.eu.org
- **Meggy Desktop (release v1.4.0)**: https://github.com/esaaraujo-lab/gdi_server/releases/tag/desktop-v1.4.0
- **Cloudflare Workers AI — lista de modelos**: https://developers.cloudflare.com/workers-ai/models/
- **Cloudflare Workers — limites (CPU, memória, runtime)**: https://developers.cloudflare.com/workers/platform/limits/
- **Cloudflare Browser Rendering API (para web-content com JS)**: https://developers.cloudflare.com/browser-rendering/
- **Tauri 2.0 (stack do meggy-desktop)**: https://v2.tauri.app/

---

*Documento gerado em 2026-10-22 pela tarefa 3-OPENMAC-DEEP-RESEARCH. Pesquisa via `curl` + GitHub API + raw.githubusercontent.com. Não modificou código do Meggy — apenas produziu este documento + apêndice ao worklog.md.*
