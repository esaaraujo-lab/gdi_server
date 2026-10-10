# Meggy — App Android Nativo 🐩

App Android nativo (Kotlin) que abre a plataforma de estudos Meggy (educa.eu.org) em uma WebView com:

- ✅ **Android TV / Google TV** — suporte D-pad + leanback launcher
- ✅ **Mobile** — touchscreen + zoom
- ✅ **Login persistente** — cookies salvos entre sessões
- ✅ **Fullscreen** — immersive mode
- ✅ **Dark theme** — fundo preto
- ✅ **APK leve** — ~5MB (vs 20MB do Flutter)

## Build

```bash
cd meggy-app
gradle assembleRelease
```

APK gerado: `app/build/outputs/apk/release/app-release.apk`

## GitHub Actions

Push de tag `meggy-v*` triggera build automático → APK disponível como artifact.
