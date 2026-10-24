# 🔄 STAGING WORKFLOW — Estratégia B (Split-View Shell)

> **Sistema de staging seguro para desenvolver a unificação da interface sem afetar produção.**
> **Criado em:** 2026-10-24
> **Base:** Plano `docs/PLANO_ACAO_UNIFICACAO.md` + Análise `docs/ANALISE_IMPACTO_RISCOS.md`

---

## 📐 Arquitetura do Staging

```
REPO PÚBLICO (esaaraujo-lab/gdi_server):
├── core/app.min.js                    ← PRODUÇÃO (intocada)
├── modular/*.js                       ← PRODUÇÃO (intocada)
└── staging/                           ← 🧪 STAGING (cópia para desenvolver)
    ├── README.md
    ├── core/app.min.js                ← cópia exata (mesmo blob SHA)
    └── modular/*.js                   ← cópia exata (mesmo blob SHA)
    └── modular/shell/                 ← 🔜 NOVOS arquivos do shell (a criar)
    └── modular/views/                 ← 🔜 NOVOS arquivos de views (a criar)

REPO PRIVADO (esaaraujo-lab/student_gdi):
├── worker.js                          ← PRODUÇÃO (intocada, com secrets)
├── wrangler.toml                      ← PRODUÇÃO (intocada)
├── backup/                            ← 📦 SNAPSHOT para rollback
│   ├── README.md
│   └── worker-v1.0.211-20261024.js    ← cópia exata do worker.js atual
└── staging/                           ← 🧪 STAGING (worker de teste)
    ├── README.md
    ├── worker-staging.js              ← worker.js com 6 linhas mudadas
    └── wrangler-staging.toml          ← config do meggy-staging worker
```

---

## 🔄 Como Funciona

### Produção (intocada durante staging)
```
Usuário → educa.eu.org
  → worker.js (raiz do privado)
    → carrega frontend de gdi_server/main/core/ + gdi_server/main/modular/
    → NÃO é afetada pela staging
```

### Staging (ambiente de teste isolado)
```
Usuário → meggy-staging.educa.workers.dev
  → worker-staging.js (staging/ do privado)
    → carrega frontend de gdi_server/main/staging/core/ + gdi_server/main/staging/modular/
    → usa os MESMOS bindings (D1/KV/AI) de produção → dados reais
```

### Isolamento
- **Frontend:** totalmente isolado (staging/ vs raiz)
- **Backend:** mesmos bindings (D1/KV/AI) → testa com dados reais
- **URL:** subdomínio diferente (meggy-staging vs educa)
- **Produção:** NUNCA é afetada durante staging

---

## 📋 Workflow de Desenvolvimento

### Passo 1 — Desenvolver na staging

```bash
# Editar arquivos na pasta staging/ do repo PÚBLICO
# (via GitHub API, git, ou editor)
# Ex: criar modular/shell/shell.js, modular/views/CoursesView.js, etc.

# Editar worker-staging.js no repo PRIVADO se precisar mudar backend
# (ex: adicionar feature flag, mudar HTML template, etc.)
```

### Passo 2 — Deploy do staging worker

```bash
cd student_gdi/staging

# Configurar secrets (só na primeira vez)
wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler-staging.toml
wrangler secret put GOOGLE_REFRESH_TOKEN --config wrangler-staging.toml
# ... (todos os 7 secrets de produção)

# Editar wrangler-staging.toml: colocar D1_ID e KV_ID de produção

# Deploy
wrangler deploy --config wrangler-staging.toml
```

### Passo 3 — Testar com agents + LLMs

```bash
# URL do staging
STAGING_URL="https://meggy-staging.educa.workers.dev/"

# Testar com agent-browser:
# 1. Login
# 2. Navegar: Home → Cursos → Detalhe → Aula → Player
# 3. Verificar: NUNCA recarrega a página (sem location.href)
# 4. Verificar: Área do Aluno sempre visível (shell persistente)
# 5. Verificar: Meggy AI drawer funciona
# 6. Mobile: sidebar colapsa
# 7. Console: sem erros JavaScript
```

### Passo 4 — Promover para produção (se teste OK)

```bash
# 1. Criar backup ANTES de promover
cp student_gdi/worker.js student_gdi/backup/worker-v1.0.212-$(date +%Y%m%d).js

# 2. Copiar frontend staging → produção (repo público)
#    staging/core/app.min.js → core/app.min.js
#    staging/modular/* → modular/*

# 3. Copiar worker staging → produção (repo privado)
#    staging/worker-staging.js → worker.js
#    REVERTER as 6 mudanças (URLs de volta para /main/modular/ etc.)
#    Ou: usar feature flag shell_enabled para ativar gradualmente

# 4. Deploy produção
cd student_gdi && wrangler deploy

# 5. Monitorar (CF Analytics + console errors)
```

### Passo 5 — Rollback (se quebrar)

```bash
# Restaurar worker do backup
cp student_gdi/backup/worker-v1.0.211-20261024.js student_gdi/worker.js
cd student_gdi && wrangler deploy

# Reverter frontend (repo público)
git checkout pre-staging -- core/ modular/

# Produção volta ao estado de 2026-10-24
```

---

## 🛡️ Segurança

### O que está seguro

| Item | Status | Por quê |
|------|--------|---------|
| Secrets em repo público | ✅ NUNCA | Frontend não tem secrets |
| worker.js em repo público | ✅ NUNCA | Só no privado |
| Produção durante staging | ✅ Intocada | staging/ isolada |
| Backup para rollback | ✅ Feito | backup/worker-v1.0.211-20261024.js |
| Dados do usuário | ✅ Seguros | Estado em D1/localStorage, não no código |

### O que NÃO fazer

- ❌ NUNCA commitar worker.js no repo público (contém secrets)
- ❌ NUNCA commitar wrangler.toml no repo público (contém bindings IDs)
- ❌ NUNCA editar arquivos da raiz (core/, modular/) durante staging — só staging/
- ❌ NUNCA deploy staging sem teste com agents

---

## 📊 Status Atual (2026-10-24)

| Componente | Status | Local |
|-----------|--------|-------|
| Pasta `staging/` no público | ✅ Criada (37 arquivos + README) | `gdi_server/staging/` |
| Pasta `backup/` no privado | ✅ Criada (worker snapshot + README) | `student_gdi/backup/` |
| Pasta `staging/` no privado | ✅ Criada (worker-staging + wrangler + README) | `student_gdi/staging/` |
| worker-staging.js deployado | ❌ Pendente | Precisa `wrangler deploy` |
| Teste com agents | ❌ Pendente | Após deploy |
| Fase 0 (Vite + AppShell) | ❌ Pendente | Após validar staging |

---

## 🔗 Links

- **Plano de ação:** `docs/PLANO_ACAO_UNIFICACAO.md`
- **Análise de impacto:** `docs/ANALISE_IMPACTO_RISCOS.md`
- **Staging público:** https://github.com/esaaraujo-lab/gdi_server/tree/main/staging
- **Backup privado:** https://github.com/esaaraujo-lab/student_gdi/tree/main/backup
- **Staging privado:** https://github.com/esaaraujo-lab/student_gdi/tree/main/staging
- **Produção:** https://educa.eu.org (intocada)

---

*Workflow criado em 2026-10-24. Estratégia B (Split-View Shell) — fase de staging ativa.*
