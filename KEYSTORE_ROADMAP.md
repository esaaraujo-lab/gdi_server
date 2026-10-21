# Regras de Keystore + Roadmap — Meggy & BiBi Fit

## 🔑 Regras de Keystore

### Meggy (native-v*)
- **Keystore**: `meggy-release.keystore` (commitado no repo `meggy-native-app/`)
- **Alias**: `meggy`
- **Senha**: definida em `keystore.properties`
- **build.gradle**: `signingConfigs.release` carrega de `keystore.properties`
- **Assinatura**: SEMPRE a mesma em todas as builds
- **Auto-update**: Funciona — APK se atualiza sem desinstalar

### BiBi Fit (bibigyn-v*)
- **Keystore**: `bibigyn-release.keystore` (commitado em `bibigyn-android-tv/app/`)
- **Alias**: `bibigyn`
- **Senha**: `bibigyn2026`
- **build.gradle**: `signingConfigs.release` HARDCODED (sem fallback para debug)
- **Assinatura**: SEMPRE a mesma em todas as builds
- **Auto-update**: Funciona — APK se atualiza sem desinstalar

### ⚠️ Regra CRÍTICA: versionName = Tag
**SEMPRE** atualizar `versionName` no `build.gradle` ANTES de criar a tag:

| App | Tag format | versionName no build.gradle |
|-----|-----------|---------------------------|
| Meggy | `native-v2.7.0` | `versionName "2.7.0"` |
| BiBi Fit | `bibigyn-v2.1.0` | `versionName "2.1.0"` |

Se `versionName` ≠ tag → UpdateChecker detecta falsa atualização → baixa infinitamente.

### UpdateChecker — Regras
- **Meggy**: filtra releases por prefix `native-v*`
- **BiBi Fit**: filtra releases por prefix `bibigyn-v*`
- Verifica a cada **6 horas** (não a cada app open)
- Se `versionName == remoteVersion` → **NÃO FAZ NADA** (silencioso)
- Se `remoteVersion > localVersion` → auto-download + auto-install

---

## 📋 Roadmap dos Apps

### Meggy (educa.eu.org — plataforma completa)

#### Versão Atual: v2.7.0
- 12 drives (todos os cursos)
- Player com ExoPlayer, gestos, playlist, sleep timer
- D-pad UP mostra controles
- Tiles com focus border elegante
- Banner minimalista (purple + pink)
- Login persistente (SharedPreferences)
- Auto-update (filtra native-v*)

#### Próximas Versões
- **v2.8.0**: Meggy Coach no app (análise com IA)
- **v2.9.0**: Download offline de aulas
- **v3.0.0**: UI redesign (Netflix-style v2)

### BiBi Fit (Clube Fit + Hipopressivos)

#### Versão Atual: v2.1.0
- 2 drives (Clube Fit + Hipopressivos)
- Clone perfeito do Meggy (mesmas funções)
- HeroItem.ALL = apenas 2 destaques
- Banner minimalista (navy + orange)
- Ícone: mulher fitness com halteres
- Login persistente
- Auto-update (filtra bibigyn-v*)

#### Próximas Versões
- **v2.2.0**: Sincronizar mudanças do Meggy v2.7.0
- **v2.3.0**: Widget de treino do dia
- **v3.0.0**: UI redesign (igual ao Meggy v3.0.0)

---

## 🔄 Processo de Atualização

### Quando atualizar o Meggy:
1. Fazer mudanças em `meggy-native-app/`
2. Atualizar `versionName` no `build.gradle` (ex: `"2.8.0"`)
3. Atualizar `versionCode` (+1)
4. Push para GitHub
5. Criar tag `native-v2.8.0`
6. Build automático no GitHub Actions
7. Release criada com APK
8. App auto-atualiza nos dispositivos

### Quando atualizar o BiBi Fit:
1. Copiar mudanças do Meggy para `bibigyn-android-tv/`
2. Aplicar diferenças: package, nome, drives (2), keystore, UpdateChecker prefix
3. Atualizar `versionName` no `build.gradle` (ex: `"2.2.0"`)
4. Atualizar `versionCode` (+1)
5. Push para GitHub
6. Criar tag `bibigyn-v2.2.0`
7. Build automático
8. Release criada
9. App auto-atualiza

### Sincronização Meggy → BiBi Fit
Sempre que o Meggy for atualizado, replicar para BiBi Fit:
1. Copiar arquivos modificados do Meggy
2. `sed` para trocar `com.meggy.app` → `com.bibigyn.app`
3. `sed` para trocar `MeggyApp` → `BiBiGynApp`
4. Garantir `Models.kt` tem apenas 2 drives
5. Garantir `HeroItem.ALL` tem apenas 2 itens
6. Garantir `UpdateChecker` filtra `bibigyn-v*`
7. Garantir keystore é `bibigyn-release.keystore`
8. Atualizar `versionName` para bater com a nova tag

---

## 📺 Roku App (Roadmap)

### Versão Atual: v1.0.2 (não buildado)
- Login + Home + Player básico
- Precisa revisão linha-a-linha

### Próximos Passos
- Revisar todo o código BrightScript
- Testar em dispositivo real
- Adicionar mesmas funções dos apps Android
