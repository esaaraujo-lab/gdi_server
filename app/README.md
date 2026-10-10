# GDI Index — App (Educa/Meggy) 🐩

App multiplataforma (Android, Android TV, Windows, macOS) que abre a plataforma de estudos Educa/Meggy em uma WebView com suporte a controle remoto (D-pad).

## 📱 Plataformas

| Plataforma | Status | CI/CD |
|---|---|---|
| 📱 Android (celular) | ✅ | GitHub Actions → APK/AAB |
| 📺 Android TV / Google TV | ✅ | GitHub Actions → APK |
| 🖥️ Windows | ✅ | GitHub Actions → EXE |
| 🖥️ macOS | ✅ | GitHub Actions → DMG |
| 📱 iOS | ⚠️ Futuro | Precisa Apple Developer $99/ano |
| 📺 Apple TV (tvOS) | ⚠️ Futuro | Mesma conta Apple |

## 🚀 Como usar

### Pré-requisitos
- Flutter 3.24+ (`flutter doctor`)
- Para Android: Android Studio + SDK
- Para Windows: Visual Studio com C++ workload
- Para macOS: Xcode

### Build local

```bash
# Instalar dependências
flutter pub get

# Android (APK)
flutter build apk --release

# Windows
flutter config --enable-windows-desktop
flutter build windows --release

# macOS
flutter config --enable-macos-desktop
flutter build macos --release
```

### Deploy via GitHub Actions

1. Tag uma release: `git tag v1.0.0 && git push origin v1.0.0`
2. GitHub Actions builda automaticamente
3. APK/EXE/DMG aparecem na seção Releases

## 🎮 Android TV — Controle Remoto (D-pad)

| Botão | Ação |
|---|---|
| ⬆️ Up | Scroll para cima |
| ⬇️ Down | Scroll para baixo |
| ⬅️ Left | Scroll para esquerda |
| ➡️ Right | Scroll para direita |
| ✅ Enter/Select | Click no elemento focado |
| 🔙 Back/Escape | Voltar na história |

## 🏗️ Arquitetura

```
gdi-app/
├── lib/
│   └── main.dart              ← WebView wrapper + D-pad handler
├── pubspec.yaml               ← Dependências Flutter
├── .github/workflows/
│   ├── build-android.yml      ← CI: Android APK/AAB
│   ├── build-windows.yml      ← CI: Windows EXE
│   └── build-macos.yml        ← CI: macOS DMG
└── README.md                  ← Este arquivo
```

O app é um **shell wrapper** — abre `educa.eu.org` em uma WebView. Toda a lógica da plataforma (login, drives, Meggy AI, scanner, etc.) roda no site. O app apenas:
1. Exibe a WebView em tela cheia
2. Intercepts D-pad para navegação com controle remoto
3. Persiste cookies entre sessões (mantém login)

## 🔧 Configuração

Para mudar a URL do site, edite `lib/main.dart`:

```dart
const String SITE_URL = 'https://educa.eu.org/';
```

## 📦 Requisitos para iOS/tvOS (futuro)

1. Conta Apple Developer Program ($99/ano)
2. Adicionar `ios/` e `tvos/` ao projeto: `flutter create . --platforms=ios`
3. Workflow GitHub Actions com Fastlane para signing
4. App Store Connect para distribuição

---

**Made with ❤️ by Meggy** 🐩
