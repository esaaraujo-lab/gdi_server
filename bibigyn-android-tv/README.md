# 📺 BiBi Fit — Android TV App

App Android TV (Leanback) para as plataformas **Clube Fit** e **Hipopressivos** do educa.eu.org.

Baseado no app Meggy, mas com apenas 2 drives (fitness + saúde) e nome/capa diferentes para não conflitar com o app Meggy principal.

## 🎯 Diferenças do Meggy

| Característica | Meggy | BiBi Fit |
|---------------|-------|----------|
| **Nome** | Meggy | BiBi Fit |
| **Package ID** | `com.meggy.app` | `com.bibigyn.app` |
| **Drives** | 12 (todos) | 2 (Clube Fit + Hipopressivos) |
| **Tema** | Poodle (rosa/roxo) | Fitness (teal/rosa + halteres) |
| **Foco** | Estudos geral | Fitness + saúde |

## 📦 Drives Incluídos

1. **Clube Fit** (`/6:/`) — Treinos, aulas de fitness
2. **Hipopressivos** (`/7:/`) — Exercícios hipopressivos

## ✨ Funcionalidades

Mesmas do Meggy.apk:
- ✅ Login (cookie de sessão persistente)
- ✅ Home com grid de drives
- ✅ Navegação de pastas (browse)
- ✅ Player de vídeo (ExoPlayer)
- ✅ Playlist com próxima aula automática
- ✅ Resume (continuar de onde parou)
- ✅ Android TV compatível (D-pad, leanback)
- ✅ Também funciona em smartphones/tablets

## 🚀 Instalação

### Android TV (sideload)
```bash
adb install bibigyn-release.apk
```

### Smartphone/Tablet
```bash
adb install bibigyn-release.apk
```

### Login
- **Usuário**: seu email (ex: `elton@araujo.eu.org`)
- **Senha**: sua senha do educa.eu.org

## 🔨 Build

### Local
```bash
cd bibigyn-android-tv
./gradlew assembleRelease
# APK: app/build/outputs/apk/release/app-release.apk
```

### GitHub Actions (CI/CD)
O workflow `.github/workflows/bibigyn-android-tv.yml` builda automaticamente a cada push. Em tags `v*`, cria GitHub Release com o APK.

## 📁 Estrutura

```
bibigyn-android-tv/
├── app/
│   ├── build.gradle                          # applicationId: com.bibigyn.app
│   └── src/main/
│       ├── AndroidManifest.xml              # LEANBACK_LAUNCHER
│       ├── java/com/bibigyn/app/
│       │   ├── BiBiGynApp.kt               # Application class
│       │   ├── data/
│       │   │   ├── ApiService.kt           # HTTP client
│       │   │   └── Models.kt               # DriveItem.ALL = 2 drives
│       │   ├── ui/
│       │   │   ├── splash/SplashActivity.kt
│       │   │   ├── login/LoginActivity.kt
│       │   │   ├── home/HomeActivity.kt     # Grid de 2 drives
│       │   │   ├── browse/BrowseActivity.kt # Navegação de pastas
│       │   │   └── player/PlayerActivity.kt # ExoPlayer
│       │   └── util/SessionManager.kt
│       └── res/
│           ├── drawable/banner.xml           # TV banner (320x180dp)
│           ├── drawable/ic_launcher_*.xml    # Ícone halteres
│           └── values/strings.xml            # app_name = "BiBi Fit"
├── build-workflow.yml                        # GitHub Actions
└── README.md
```

## 🎨 Identidade Visual

- **Nome**: BiBi Fit
- **Ícone**: Halteres (dumbbell) com coração
- **Cores**: Teal (#5DDEDA) → Rosa (#FF8B9F) — gradiente fitness
- **Banner TV**: 320x180dp com "BiBi Fit" + halteres

## 📞 Suporte

- **Plataforma web**: https://educa.eu.org
- **Drives**: `/6:/` (Clube Fit) + `/7:/` (Hipopressivos)
- **Backend**: Cloudflare Worker (worker.js)

## 📄 Compatibilidade

- ✅ Android TV (Leanback)
- ✅ Android 5.0+ (API 21+)
- ✅ Smartphones e tablets
- ✅ Instalação lado-a-lado com Meggy (package IDs diferentes)
