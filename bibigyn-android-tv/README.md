# Meggy — Native Android App

A native Kotlin Android app for the [Meggy / GDI Index](https://educa.eu.org) study platform.
Replaces the previous Flutter WebView wrapper with a proper native experience
built on Material 3 + ExoPlayer + Leanback.

## Highlights

- **Material 3** dark theme with Meggy pink → purple gradient branding
- **Grid UI** for the 12 root drives + enrolled courses (auto-fit columns: 2 on phones, 5–6 on TV)
- **Folder browsing** via the worker.js JSON API, with breadcrumb navigation
- **ExoPlayer / Media3** video player with:
  - Cookie-authenticated streaming (session cookie injected as a request header)
  - Resume position saved per-file (SharedPreferences)
  - 0.5×–2.0× speed control
  - Picture-in-picture (Android 8+)
- **D-pad friendly** — works on phones, tablets, and Android TV / Google TV
  - Optional `leanback` feature (installs on non-TV devices too)
  - `LEANBACK_LAUNCHER` category so it appears in the TV launcher
- **OkHttp 4.x** networking (simpler than Retrofit, fewer deps)
- **Signing config** uses the debug keystore — APK installs alongside other
  sideloaded apps without "pacote inválido" errors

## Project Layout

```
meggy-native-app/
├── settings.gradle
├── build.gradle                  # root (AGP 8.1.4, Kotlin 1.9.10)
├── gradle.properties
├── gradle/wrapper/gradle-wrapper.properties   # Gradle 8.2
├── build-workflow.yml            # GitHub Actions workflow (copy to .github/workflows/)
└── app/
    ├── build.gradle              # app deps: Material3, Media3, OkHttp, Leanback
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/meggy/app/
        │   ├── MeggyApp.kt              # Application class + OkHttp singleton
        │   ├── data/
        │   │   ├── ApiService.kt        # login / listFolder / listCourses
        │   │   └── Models.kt            # DriveItem, FileItem, FolderListing, ...
        │   ├── util/SessionManager.kt   # cookie + resume position storage
        │   └── ui/
        │       ├── splash/SplashActivity.kt
        │       ├── login/LoginActivity.kt
        │       ├── home/{HomeActivity,DriveAdapter}.kt
        │       ├── browse/{BrowseActivity,FileAdapter}.kt
        │       └── player/PlayerActivity.kt
        └── res/
            ├── values/{strings,colors,themes}.xml
            ├── layout/{activity_splash,activity_login,activity_home,
            │          activity_browse,activity_player,item_drive,item_file}.xml
            ├── drawable/{gradient_meggy,ic_launcher_*,banner,...}.xml
            └── mipmap-anydpi-v26/{ic_launcher,ic_launcher_round}.xml
```

## Build

The project is built via GitHub Actions (see `build-workflow.yml`). Locally:

```bash
cd meggy-native-app
# Generate a debug keystore if you don't already have one:
keytool -genkey -v -keystore app/debug.keystore -storepass android \
  -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 \
  -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
# Build:
gradle assembleRelease
# Output: app/build/outputs/apk/release/app-release.apk
```

Requirements: JDK 17, Android SDK 34, Gradle 8.2 (or use the included wrapper).

## API

The app talks to `https://educa.eu.org` via three endpoints:

| Endpoint                  | Method | Description                                       |
|---------------------------|--------|---------------------------------------------------|
| `/login`                  | POST   | Form-encoded username/password → 302 + Set-Cookie |
| `/<driveIdx>:/`           | POST   | JSON body → folder listing                       |
| `/api/courses/list`       | GET    | Enrolled courses (optional, best-effort)         |

The download URL for a file is `https://educa.eu.org` + `file.link` (the `link`
field on a file object is a relative path). ExoPlayer streams it directly with
the session cookie attached as a `Cookie:` header.
