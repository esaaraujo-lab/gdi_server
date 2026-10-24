# 🧪 Staging — Meggy Frontend (Estratégia B)

> **Cópia segura do frontend de produção para desenvolvimento da Estratégia B (Split-View Shell)**
> **Data do snapshot:** 2026-10-24
> **Repo público:** \`esaaraujo-lab/gdi_server/staging/\`
> **Repo privado (worker-staging):** \`esaaraujo-lab/student_gdi/staging/\`

## ⚠️ IMPORTANTE — Sem chaves nem secrets

Esta pasta contém **apenas código frontend** (JavaScript, CSS, imagens). Nenhum secret, key, ou credencial existe aqui. Seguro para commit público.

## 📁 Estrutura

```
staging/
├── README.md                          ← este arquivo
├── core/
│   └── app.min.js                     ← GDIndex core (widget interno do shell)
└── modular/
    ├── gdi-extras-loader.js           ← entry point do frontend (carrega módulos)
    ├── gdi-core.js                    ← utils base
    ├── gdi-ui.js                      ← UI helpers
    ├── gdi-study.js                   ← Área do Aluno (será migrado para views/)
    ├── gdi-meggy.js                   ← Meggy AI (será migrado para drawer)
    ├── gdi-pdf.js, gdi-list-worker.js, meggy-pdf-worker.js
    ├── gdi-worker-bridge.js, gdi-player-enhancer.js
    ├── gdi-ai-providers.js, storage.js
    ├── admin/admin-panel.js
    ├── assets/ (imagens meggy-fab)
    ├── study/ (11 arquivos modularizados)
    └── meggy/ (6 arquivos modularizados)
```

## 🔄 Como o staging funciona

1. **Worker-staging** (repo privado `student_gdi/staging/worker-staging.js`) serve HTML que carrega frontend desta pasta
2. URLs internas do worker-staging apontam para `staging/modular/` e `staging/core/` em vez de `modular/` e `core/`
3. Produção (worker.js na raiz do privado) **NÃO é afetada** — continua carregando de `modular/` e `core/` na raiz

## 📋 Workflow de desenvolvimento

### Desenvolver na staging
1. Editar arquivos em `staging/modular/` (este repo público)
2. Deploy do worker-staging: `cd student_gdi/staging && wrangler deploy --config wrangler-staging.toml`
3. Testar em: `https://meggy-staging.educa.workers.dev/`

### Testar com agents + LLMs
- Usar agent-browser para navegar na staging
- Testar todos os fluxos: login, cursos, aulas, player, Meggy AI, questões, flashcards
- Se quebrar: editar staging, redeploy, retestar

### Promover para produção
1. Copiar arquivos de `staging/modular/` → `modular/` (raiz deste repo)
2. Copiar `staging/core/app.min.js` → `core/app.min.js`
3. Copiar `student_gdi/staging/worker-staging.js` → `student_gdi/worker.js`
4. `wrangler deploy` (produção)
5. Monitorar

### Restaurar (rollback)
1. Reverter commits nos repos (ou `git checkout pre-staging -- ...`)
2. `wrangler deploy` (produção)
3. Produção volta ao estado anterior

## 🔗 Links

- **Worker-staging (privado):** `student_gdi/staging/worker-staging.js`
- **Backup do worker (privado):** `student_gdi/backup/worker-v1.0.211-20261024.js`
- **Produção:** `educa.eu.org` (intocada durante staging)
- **Staging URL:** `meggy-staging.educa.workers.dev` (após deploy do worker-staging)

---

*Snapshot criado em 2026-10-24. Estratégia B (Split-View Shell) — ver `docs/PLANO_ACAO_UNIFICACAO.md`.*
