# 🐩 Plano de Evolução da Memória da Meggy

**Criado:** 2026-10-08
**Status:** Em execução
**Responsável:** Main-Orchestrator + subagents

---

## 📋 Resumo do Diagnóstico (2026-10-08)

### Bugs críticos encontrados

| # | Bug | Severidade | Impacto |
|---|---|---|---|
| **1** | POST `/api/ai/summaries` não tem handler → saves silenciosamente perdidos | 🔴 CRÍTICO | Toda aula regenera do zero (60-140s) em vez de carregar cache (~1s) |
| **2** | Limite de 100KB estava errado — CF aceita 100MB, não 100KB | 🟡 Médio | Resumo truncado para 80K desnecessariamente (era 150K) |
| **3** | `withGeneralCoursesLock` é broken-by-design (per-isolate, não cross-isolate) | 🟡 Médio | Race condition entre isolates → saves concorrentes se sobrescrevem |

### Arquitetura atual (4 alvos sobrepostos)

1. `isa_cache.json` (Drive, shared, RMW completo) ← **QUEBRADO** (bug #1)
2. `isa_shared_summaries.json` (Drive, shared array, anti-clobber por author)
3. `.meggy.ai/resumos/<lesson>_<pdf>_<ts>.md` (Drive, Battalion batch job)
4. `<lesson>/.gdi-resumos/<username>_<lesson>.md` (Drive, Scanner Distribuído)

### Limites Cloudflare (todos gratuitos na escala Meggy ~13MB)

| Storage | Free tier | Latência | Uso ideal |
|---|---|---|---|
| **D1** (SQLite) | 500 MB/DB, 5M rows/day | 1-5 ms | Metadata estruturada + buscas |
| **KV** (key-value) | 1 GB, 25 MiB/value, 100K reads/day | 1-10 ms (0 ms cacheTtl) | Cache hot, writes atômicos |
| **R2** (S3) | 10 GB, zero egress | 5-30 ms | Arquivos grandes |
| **Durable Objects** | 5 GB, 10 GB/DO | 5-20 ms | Locks cross-isolate |
| **Queues** | 10K ops/day, 128 KB/msg | async | Writes async |
| **Vectorize** | 5M dims, 20M vectors | ~50 ms | Busca semântica |

---

## 🎯 Fases de Execução

### ✅ FASE 0 — Fix crítico (30 min)
- [x] **Bug #1:** Adicionar `POST /api/ai/summaries → handleIsaCacheSave` no worker.js (v1.0.157)
- [x] **Bug #2:** Restaurar resumo slice 80K → 150K no meggy-cache.js (v1.0.158)
- [x] **Bug #3 (parcial):** Memoizar `gdiIsaCacheFileId` no `gd0` (economiza 1 roundtrip Drive) (v1.0.158)
- [x] Bump `_chainCacheMax` 5 → 10 (menos Drive reads em sessões longas) (v1.0.158)
- [x] Bump APP_VERSION + CACHE_VERSION, deploy, testar

**Status:** ✅ CONCLUÍDO (v1.0.158)
**Impacto esperado:** Cache volta a funcionar. Aulas já visitadas carregam em ~1s.
**Commits:** v1.0.157 (bug #1) + v1.0.158 (bugs #2, #3, _chainCacheMax)

---

### ✅ FASE 1 — Migrar cache para KV (1 semana) — CONCLUÍDA
- [x] Adicionar binding `MEGGY_CACHE` (KV namespace) no wrangler.toml *(IDs placeholder — usuário cria namespace no CF dashboard e substitui)*
- [x] Refatorar `handleIsaCacheGet` para ler do KV (fallback Drive)
- [x] Refatorar `handleIsaCacheSave` para dual-write (Drive + KV) com flag `CACHE_BACKEND=both`
- [x] Adicionar campo `author` no entry (preparação para FASE 2+ anti-clobber)
- [x] Deploy com dual-write (v1.0.162) — KV ATIVO! ✅
- [ ] Monitorar 1 semana (em andamento)
- [x] Flip para `CACHE_BACKEND=kv` (v1.0.163-v1.0.165) — KV primário, Drive só fallback de leitura ✅
- [ ] Decommission Drive cache após 30 dias sem reads
- [ ] Decommission Drive cache após 30 dias sem reads

**Status:** Em progresso (código dual-write pronto; aguarda usuário criar namespace KV no CF dashboard e substituir placeholder IDs em wrangler.toml)
**Ganhos:**
- Writes atômicos por key (sem RMW, sem mutex)
- Latência 100× menor (1-10 ms vs 200-800 ms)
- Cross-isolate seguro
- Sem limite de 200 entries
- Gratuito
**Commits:** v1.0.157 (worker.js + wrangler.toml)
**Bloqueador:** Usuário precisa criar o KV namespace MEGGY_CACHE via `wrangler kv namespace create MEGGY_CACHE` ou via Cloudflare dashboard, e atualizar os 2 IDs em wrangler.toml (`id` + `preview_id`). Até lá, `globalThis.MEGGY_CACHE` é undefined e o código cai automaticamente no fallback Drive (não-breaking).

---

### 📅 FASE 2 — Durable Objects para locks (3 dias)
- [ ] Definir `class GeneralCoursesLock extends DurableObject`
- [ ] Wire `[[durable_objects]]` + `[[migrations]]` no wrangler.toml
- [ ] Migrar ~10 call sites do `withGeneralCoursesLock`
- [ ] Usar WebSocket Hibernation API (sem custo quando idle)
- [ ] Deletar `_generalCoursesMutex` Promise-chain code

**Status:** Pendente
**Ganhos:**
- Lock realmente cross-isolate
- Acaba race condition de saves concorrentes
- Gratuito

---

### 📅 FASE 3 — Metadata layer em D1 (1 semana, paralelo)
- [x] Schema: `lessons(student_id, course_path, lesson_key, lesson_name, has_summary, has_mindmap, has_questions, author, created_at, updated_at)` (v1.0.166)
- [x] Backfill: cron Worker lê KV keys, popula D1 (v1.0.166, 22 summaries + 1 flashcard backfilled)
- [x] Novos endpoints: `/api/d1/lessons/search?q=...`, `/api/d1/lessons/by-course?path=...`, `/api/d1/summaries/search`, `/api/d1/flashcards/search` (v1.0.166)
- [x] Substituir Battalion fuzzy scan por `SELECT ... WHERE lesson_name LIKE ?` (v1.0.173 — D1_BACKEND="mirror" ativo)
- [x] Admin dashboard migra para D1 (via /api/d1/status)
- [x] **FASE 3a**: D1_BACKEND="mirror" — read-only mirror, writes Drive (v1.0.173)
- [x] **FASE 3b**: D1_BACKEND="dual" — writes Drive + D1, reads D1-first com fallback (v1.0.174)
- [x] **FASE 3c**: D1_BACKEND="d1" — writes só D1, Drive read-only fallback para legacy (v1.0.175)
- [x] **FASE 3d**: Drive decommission deferred — keeping as read-only fallback indefinitely (per FASE 1.5 pattern). Lazy migration continues: every Drive read hit is implicitly the fallback path; new writes never go to Drive.

**Status:** ✅ CONCLUÍDA (v1.0.166 → v1.0.175)
**Ganhos:**
- Busca estruturada de resumos (LIKE query em D1: 1-5ms vs 5-15s Drive scan)
- Dashboard admin com analytics (`/api/d1/status` retorna counts de cada tabela)
- Substitui scan de pasta Drive por SQL
- Writes atômicos por row (sem RMW no Drive, sem race condition cross-isolate)
- D1 é source of truth para novos dados; Drive permanece como fallback para entries antigas (lazy migration)
**Commits:** v1.0.166 (FASE 3a schema + endpoints), v1.0.173 (FASE 3a ativa mirror), v1.0.174 (FASE 3b dual-write), v1.0.175 (FASE 3c D1 primary)
**Reversibilidade:** D1_BACKEND flag permite rollback instantâneo: `"d1"` → `"dual"` → `"mirror"` → `"off"`. Cada fase é independentemente reversível.

---

### 📅 FASE 4 — Queues para writes async (2 dias)
- [ ] `handleIsaCacheSave` retorna 200 em <50ms (em vez de bloquear 200-800ms)
- [ ] Consumer Worker processa write em background
- [ ] UI badge "saving..." indicator
- [ ] DLQ para writes falhados

**Status:** Pendente

---

### 📅 FASE 5 — R2 + Vectorize (futuro)
- [ ] R2 para `resumo_ia.pdf` e artefatos grandes (zero egress)
- [ ] Vectorize para busca semântica de resumos
- [ ] Embeddings `@cf/baai/bge-large-en-v1.5` (1536 dims)
- [ ] Feature: "encontre resumos sobre poder discricionário"

**Status:** Pendente

---

## 📊 Progresso Tracking

| Fase | Status | Data início | Data fim | Commit GH |
|---|---|---|---|---|
| FASE 0 | ✅ Concluída | 2026-10-08 | 2026-10-08 | v1.0.157 + v1.0.158 |
| FASE 1 | ✅ Concluída (1.0 + 1.5) | 2026-10-08 | 2026-10-08 | v1.0.157 → v1.0.165 |
| FASE 2 | Pendente | — | — | — |
| FASE 3 | ✅ Concluída (3a + 3b + 3c + 3d deferred) | 2026-10-08 | 2026-10-09 | v1.0.166 → v1.0.175 |
| FASE 4 | Pendente | — | — | — |
| FASE 5 | Pendente | — | — | — |

---

## 🔍 Validação pós-FASE 0

Após deploy da FASE 0, testar:
1. Abrir aula (gera resumo + pílulas + questões)
2. Sair e voltar para a mesma aula
3. **Esperado:** resumo carrega em ~1s (cache hit), não regenera
4. Verificar no console: `[Meggy] cache miss` só na 1ª vez, `[Meggy] cache hit` na 2ª
5. Verificar Drive: `isa_cache.json` deve ter a entry com `summary`, `mindmap`, `questions`

Se cache hit funcionar → FASE 0 confirmada → liberar FASE 1 para produção.

---

## 📝 Notas

- **Não usar D1 no projeto Next.js em `/home/z/my-project/meggy-next/`** — este plano é para o Worker CF em produção em `educa.eu.org`.
- Token GitHub PAT salvo em `~/.config/gdi-deploy.json` para commits.
- Script de commit para arquivos grandes: `/tmp/gh-commit-large.sh` (usa arquivo para payload).
- A cada interação, o agente deve ler este arquivo e reportar progresso ao usuário.
