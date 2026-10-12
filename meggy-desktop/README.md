# 🐩 Meggy Desktop

Aplicativo desktop (Windows + macOS + Linux) da plataforma Meggy, construído com **Tauri 2.0**.

## O que é

O Meggy Desktop abre a plataforma `educa.eu.org` em uma janela nativa — sem barra de endereço, sem abas do browser, com features extras:

- 🪟 **Janela nativa** — parece um app de verdade, não uma aba do browser
- 📌 **System tray** — minimiza para bandeja, abre rapidamente
- ⌨️ **Atalhos globais** — Ctrl+Shift+M mostra/esconde a janela
- 🔔 **Notificações nativas** — alertas do sistema operacional
- 🚀 **Autostart** — abre com o Windows/macOS (opcional)
- ❌ **Fecha para bandeja** — o app continua rodando em segundo plano

## Estrutura

```
meggy-desktop/
├── src-tauri/
│   ├── Cargo.toml              # Dependências Rust
│   ├── tauri.conf.json         # Config do Tauri (janela, bundle, ícone)
│   ├── build.rs                # Build script
│   ├── capabilities/
│   │   └── default.json        # Permissões (shell, notification, etc)
│   ├── src/
│   │   ├── main.rs             # Entry point
│   │   └── lib.rs              # Lógica (tray, janela, plugins)
│   └── icons/                  # Gerados por scripts/generate_icon.py
├── dist/
│   └── index.html              # Loader → redireciona para educa.eu.org
├── scripts/
│   └── generate_icon.py        # Gera ícone 512x512 (Pillow)
├── package.json                # Dependências Node
└── .github/workflows/
    └── build-desktop.yml       # CI: build Win + Mac + Linux
```

## Build local

### Pré-requisitos

- **Node.js** 18+ (`node --version`)
- **Rust** (`rustup default stable`)
- **Tauri CLI** (`npm install`)

#### Linux (deps adicionais)
```bash
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

#### macOS
Nenhuma dep extra (Xcode Command Line Tools).

#### Windows
Nenhuma dep extra (Microsoft C++ Build Tools).

### Gerar ícones
```bash
cd meggy-desktop
pip install Pillow
python scripts/generate_icon.py
npx tauri icon src-tauri/icons/icon.png
```

### Rodar em modo dev
```bash
cd meggy-desktop
npm install
npm run dev
```

### Build de produção
```bash
npm run build
```

Os instaladores ficam em `src-tauri/target/release/bundle/`:
- **Windows:** `.exe` (NSIS) + `.msi`
- **macOS:** `.dmg` (universal ARM+Intel)
- **Linux:** `.AppImage` + `.deb`

## Deploy via GitHub Actions

### 1. Copiar o workflow para `.github/workflows/`
```bash
cp meggy-desktop/.github/workflows/build-desktop.yml .github/workflows/build-meggy-desktop.yml
git add .github/workflows/build-meggy-desktop.yml
git commit -m "ci: add Meggy desktop build workflow"
git push
```

### 2. Criar uma tag
```bash
git tag desktop-v1.0.0
git push origin desktop-v1.0.0
```

### 3. GitHub Actions builda automaticamente
- Build para Windows → `meggy_1.0.0_x64-setup.exe` + `.msi`
- Build para macOS → `meggy_1.0.0_universal.dmg`
- Build para Linux → `meggy_1.0.0_amd64.AppImage` + `.deb`

### 4. Release aparece em
```
https://github.com/esaaraujo-lab/gdi_server/releases/tag/desktop-v1.0.0
```

## Features futuras (roadmap)

- [ ] Downloads offline (baixar aulas para assistir sem internet)
- [ ] Multi-janela (aula + anotações lado a lado)
- [ ] Atalhos de teclado no player (espaço = pause, ← → = seek)
- [ ] Menu nativo (Arquivo / Editar / Ajuda)
- [ ] Associação de arquivo `.meggy` (abrir links do app)
- [ ] Deep linking `meggy://aula/123`

## Tecnologias

- **Tauri 2.0** — framework desktop (Rust + WebView nativa)
- **Rust** — backend (tray, atalhos, plugins)
- **HTML/CSS/JS** — frontend (loader → educa.eu.org)
- **GitHub Actions** — CI/CD multiplataforma
