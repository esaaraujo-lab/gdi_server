# Meggy Desktop — App Nativo (Tauri 2.0 + Rust + React)

App nativo para Windows/Linux/macOS da plataforma Meggy (educa.eu.org).

## Stack
- **Backend**: Rust (Tauri 2.0) — reqwest, rusqlite, mpv FFI
- **Frontend**: React 19 + TypeScript + Tailwind CSS + shadcn/ui
- **Player**: libmpv (4K/HDR, speed 0.25x-16x)
- **Database**: SQLite WAL (cache offline)
- **Auto-update**: BLAKE3 + GitHub Releases

## Features
- Login persistente (cookie no OS Keychain)
- Home Netflix-style com rails de drives
- Player mpv com speed, resume, playlist, sleep timer
- AI: Chat, Coach, Resumos, Questões, Flashcards, Redação
- 14 abas da Área do Aluno
- Scanner (scan-progress, scan-and-save)
- D1 busca (lessons, summaries, flashcards)
- Download offline de vídeos
- Atalhos globais, multi-janela, system tray
- Auto-update via GitHub Releases

## Build
```bash
cd meggy-desktop
npm install
npm run tauri build
```
