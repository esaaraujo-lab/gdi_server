# VOVÔ FIT — Android TV App

Fitness app for Android TV smart TVs. Built for the VOVÔ FIT brand (grandfather fitness).

## Brand
- **Name**: VOVÔ FIT
- **Package**: `com.vovofit.app`
- **Colors**: Deep Teal `#0F3D3E` + Lime Green `#A3E635`
- **Backend**: https://educa.eu.org (same as Meggy/BiBi)

## Drives (4)
1. **QUEIMA DIÁRIA** (index 12) — High-intensity workouts
2. **TODO DIA** (index 13) — Daily movement routines
3. **CLUBE DE CASA** (index 14) — Home fitness
4. **SAÚDE E FITNESS** (index 15) — Overall wellness

## Build
- **versionName**: 1.0.0
- **versionCode**: 1
- **minSdk**: 21 (Android 5.0)
- **targetSdk**: 34 (Android 14)
- **Keystore**: `vovofit-release.keystore` (alias `vovofit`, password `vovofit2026`)

## Auto-update
- UpdateChecker filters GitHub releases by prefix `vovofit-v*`
- Checks every 6 hours
- Auto-downloads and installs new APK

## Build & Release
Tag pattern: `vovofit-v*` (e.g., `vovofit-v1.0.0`)

GitHub Actions workflow `.github/workflows/vovofit-android-tv.yml` builds on tag push.
