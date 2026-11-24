# GDI Index — Manual de deploy passo a passo

> **Leia isto antes de expor o worker.** Este manual leva um fork do
> zero até a plataforma no ar: conta Cloudflare, banco D1, KVs, segredos,
> deploy, domínio, cron e os agentes de IA. Nada aqui precisa de chave
> paga: o Workers AI é gratuito e os fallbacks têm opção sem chave.
>
> **Atenção — dados de demonstração:** o worker nasce com um login de
> admin de demonstração (`admin` / `admin`, credencial pública, por
> desenho) + usuários de teste + drives fictícios, só para testar a
> plataforma logo após o deploy. **Troque a senha do admin no passo 7,
> logo após o primeiro deploy e ANTES de divulgar o domínio.** O painel
> `/admin` mostra um aviso enquanto a senha ainda for `admin`.

## O que você precisa

| Item | Para quê |
| --- | --- |
| Conta Cloudflare (gratuita) | Workers, D1, KV, Workers AI |
| Conta GitHub | Fork do repo (o front mora nele) |
| Conta Google | Acesso ao Google Drive (OAuth ou service account) |
| Node.js 18+ e `wrangler` | CLI de deploy: `npm install -g wrangler@4` |
| Um terminal | Todos os comandos abaixo rodam nele |

Confira o login na Cloudflare antes de começar:

```bash
wrangler whoami
```

## Visão geral (10 passos)

1. Fork + `MODULAR_REPO`/`MODULAR_REF`
2. Banco D1 (+ migração do schema)
3. KVs (`MEGGY_CACHE` e `ENV`)
4. `wrangler.toml`
5. Segredos (`wrangler secret put`)
6. Primeiro deploy + verificação
7. Trocar a senha de demonstração do admin (obrigatório antes de expor)
8. Domínio/rotas
9. Cron semanal
10. Agentes de IA da Cloudflare

Arquivos deste repo: `worker.js` (o worker limpo, sem segredos),
`wrangler.toml.example`, `.dev.vars.example`, `migrations/` (schema do
D1), `docs/DEPLOY.md` (este manual), `staging/modular/` (o front),
`.gitignore`. O worker cria o schema do D1 sozinho no primeiro
arranque; a migração existe para setup explícito e auditoria.

---

## Passo 1 — Fork + `MODULAR_REPO`/`MODULAR_REF`

1. No GitHub, faça um **fork** do repo e clone o SEU fork:
   ```bash
   git clone https://github.com/SEU_USUARIO/SEU_REPO.git
   cd SEU_REPO
   ```
2. Copie o exemplo de configuração (o `wrangler.toml` preenchido não
   vai para o repo — está no `.gitignore`):
   ```bash
   cp wrangler.toml.example wrangler.toml
   ```
3. No `wrangler.toml`, em `[vars]`, ponha o SEU fork:
   ```toml
   MODULAR_REPO = "seu-usuario/seu-repo"
   MODULAR_REF = "main"
   ```
   `MODULAR_REPO` + `MODULAR_REF` são a **fonte única de verdade** do
   front: o worker busca os arquivos de `staging/modular/` deste repo,
   primeiro no `raw.githubusercontent.com` e depois no jsDelivr.
   Nenhum outro endereço de repo existe no `worker.js`.

**Tag ou `main`?** Para distribuir com estabilidade, fixe uma **tag de
release** (`MODULAR_REF = "v1.0.0"`) e suba a tag quando publicar uma
versão. O jsDelivr **cacheia arquivos de branch**: uma atualização no
`main` pode demorar a propagar no jsDelivr, por isso a tag é o caminho
certo para distribuir. Use `main` só para desenvolvimento.

## Passo 2 — Banco D1 (+ migração do schema)

```bash
# Cria o banco (anote o database_id que o comando devolve)
wrangler d1 create gdi-index

# Aplica o schema (22 tabelas + 31 índices — idempotente, pode rodar
# mais de uma vez sem erro)
wrangler d1 execute gdi-index --remote --file=migrations/0001_init.sql
```

Confira as tabelas criadas:

```bash
wrangler d1 execute gdi-index --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

O `database_id` vai para o `wrangler.toml` no passo 4 (bindings
`MEGGY_D1` e `MEGGY_D1_PEER`). O worker também cria este schema
sozinho no primeiro arranque (`d1EnsureSchema`); a migração serve
para setup explícito e auditoria — rode-a mesmo assim, para ter a
certeza de que o banco nasceu completo.

## Passo 3 — KVs (`MEGGY_CACHE` e `ENV`)

```bash
wrangler kv namespace create MEGGY_CACHE
wrangler kv namespace create ENV
```

Anote os dois `id` devolvidos — vão para o `wrangler.toml` no passo 4.

| Binding | Guarda o quê |
| --- | --- |
| `MEGGY_CACHE` | Cache da plataforma (listas, resumos, saúde dos modelos de IA) |
| `ENV` | Sessões e estado (o login usa este KV) |

## Passo 4 — `wrangler.toml`

Preencha o arquivo copiado no passo 1:

```toml
name = "gdi-index"                 # nome do SEU worker
account_id = "SEU_ACCOUNT_ID"      # id da SUA conta Cloudflare
main = "worker.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[vars]
MODULAR_REPO = "seu-usuario/seu-repo"
MODULAR_REF = "main"               # ou a tag, ver passo 1
ADMIN_USERS = "admin"                # troque pela sua conta no passo 7
DEMO_SEED = "true"                 # "false" desliga os dados de demonstração
AI_GATEWAY_ID = ""                 # opcional — ver passo 10
CF_ACCOUNT_ID = ""                 # opcional — ver passo 10
```

Bindings (use os IDs dos passos 2 e 3):

```toml
[[kv_namespaces]]
binding = "MEGGY_CACHE"
id = "SEU_KV_MEGGY_CACHE_ID"

[[kv_namespaces]]
binding = "ENV"
id = "SEU_KV_ENV_ID"

[[d1_databases]]
binding = "MEGGY_D1"
database_name = "gdi-index"
database_id = "SEU_D1_ID"

# D1 do par — num deploy único aponta para o MESMO D1. Com dois
# workers (ex. produção + testes), aponte para o D1 do outro worker.
[[d1_databases]]
binding = "MEGGY_D1_PEER"
database_name = "gdi-index"
database_id = "SEU_D1_ID"

# Workers AI — o nome tem de ser "ai" (o código usa env.ai)
[[unsafe.bindings]]
name = "ai"
type = "ai"

[observability]
enabled = true
head_sampling_rate = 1

[triggers]
crons = ["0 0 * * 1"]
```

> **Nunca ponha segredos em `[vars]`** — vars são texto claro e vão
> para o repo se o arquivo for commitado por engano. Segredos só no
> passo 5.

## Passo 5 — Segredos (`wrangler secret put`)

Cada segredo é criado com `wrangler secret put NOME` — o comando pede
o valor de forma interativa (nunca passe o valor na linha de comando,
não o cole em arquivo nem em log). Criar um segredo já faz deploy de
uma nova versão do worker na hora.

| Segredo | Obrigatório? | Como obter |
| --- | --- | --- |
| `CRYPTO_BASE_KEY` | Sim | `openssl rand -hex 32` (chave das sessões) |
| `HMAC_BASE_KEY` | Sim | `openssl rand -hex 32` (assinatura das sessões) |
| `GOOGLE_CLIENT_ID` | Sim (Drive) | Google Cloud Console → APIs e serviços → Credenciais → ID do cliente OAuth 2.0 |
| `GOOGLE_CLIENT_SECRET` | Sim (Drive) | Junto com o client ID acima |
| `GOOGLE_REFRESH_TOKEN` | Sim (Drive) | OAuth 2.0 Playground: autorize com o client ID/secret e troque o código por um refresh token |
| `SERVICE_ACCOUNT_JSON` | Não | Conta de serviço no Google Cloud (JSON completo numa só linha). Sem ela o Drive usa o refresh token |
| `SERVICE_ACCOUNT_JSON_0` / `_1` | Não | Service accounts extras (o worker alterna entre elas) |
| `NVIDIA_API_KEY` (+ `_2`, `_3`) | Não | Conta NVIDIA (build.nvidia.com) — IA de fallback |
| `GROQ_API_KEY` (+ `_2`) | Não | Conta Groq — IA de fallback |
| `ZHIPU_API_KEY` | Não | Conta Zhipu (open.bigmodel.cn) — IA de fallback |
| `OPENROUTER_API_KEY` | Não | Conta OpenRouter — IA de fallback |
| `OPENAI_API_KEY` | Não | Conta OpenAI — IA de fallback |

```bash
wrangler secret put CRYPTO_BASE_KEY
wrangler secret put HMAC_BASE_KEY
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GOOGLE_REFRESH_TOKEN
# ... e as demais que você for usar
```

**O que acontece sem cada um:**
- Sem `CRYPTO_BASE_KEY`/`HMAC_BASE_KEY`: o worker nem sobe o login
  (as sessões não assinam) — **não pule estes dois**.
- Sem as credenciais do Google: o login funciona, mas nada do Drive
  funciona (listas, materiais, resumos do Drive).
- Sem as chaves de IA: o Workers AI continua funcionando (é o
  primeiro da fila e não precisa de chave); a cascata cai no
  Pollinations, que também não precisa de chave (passo 10).

Depois de criar os segredos, você pode persistir uma cópia deles em
KV + D1 pelo painel do admin (`/admin` → Configurações → migração de
segredos). Isso é opcional — o worker lê os segredos do Worker secrets
primeiro, e do KV/D1 como reserva.

> Os dados de demonstração **não** são segredos a criar aqui — o worker
> os cria sozinho no 1º arranque (ver passo 7). São credenciais públicas,
> por desenho.

---

## Passo 6 — Primeiro deploy + verificação

```bash
# Simula o deploy sem publicar (confere config e empacotamento)
wrangler deploy --dry-run

# Publica
wrangler deploy
```

O comando devolve a URL `https://gdi-index.<seu-subdominio>.workers.dev`.
Verifique:

1. A URL abre a página de login (HTTP 200).
2. `https://<sua-url>/login` devolve a página de login (HTTP 200).
3. Uma rota sem sessão devolve 401 em JSON, por exemplo:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://<sua-url>/api/ai/summary-bank/lists
   # esperado: 401
   ```

Se o deploy falhar, veja a mensagem do wrangler — em geral é binding
com ID errado (passos 2–4) ou segredo faltando (passo 5).

## Passo 7 — Trocar a senha de demonstração do admin (OBRIGATÓRIO)

Faça isto **imediatamente após o primeiro deploy e ANTES de divulgar
o domínio**. A senha de demonstração é pública (está neste repo) —
qualquer pessoa que ler este manual a conhece. O painel `/admin` mostra
um aviso em destaque enquanto ela ainda for a senha ativa.

### As credenciais de demonstração

| Usuário | Senha | Papel |
| --- | --- | --- |
| `admin` | `admin` | Admin do site |
| `aluno@teste.example.com` | `aluno123` | Aluno de teste (nome: aluno_teste) |
| `professor@teste.example.com` | `professor123` | Professor de teste (nome: professor_teste) |

Os emails são fictícios (domínio `example.com`). O aluno de teste já
vem com um curso de exemplo, um histórico e um progresso — todos
fictícios, nunca de pessoa real. Os drives de exemplo (`DRIVE_EXEMPLO_01`
"Pasta de Exemplo 1" e `DRIVE_EXEMPLO_02` "Pasta de Exemplo 2") têm IDs
fictícios: substitua-os pelos seus drives reais no passo 11.

O seed só corre no 1º arranque, com as tabelas vazias. Os hashes das
senhas são calculados pelo worker em tempo de execução — nenhuma senha
nem hash aparece como literal no código, fora as credenciais públicas
acima.

### Troca (passo a passo)

1. Abra a URL do worker e entre com o login de demonstração:
   - Usuário: `admin`
   - Senha: `admin`
2. Crie a **sua** conta em `/signup` (usuário e senha só seus).
3. No `wrangler.toml`, troque o admin pela sua conta e faça re-deploy:
   ```toml
   ADMIN_USERS = "seu-usuario"
   ```
   ```bash
   wrangler deploy
   ```
4. Entre com a sua conta e confira que o painel `/admin` abre.
5. No painel, apague o usuário de demonstração (`/admin` → Usuários →
   apagar `admin`) e os usuários de teste, se não os quiser. O aviso
   some quando o `admin` deixa de ter a senha `admin`.
6. Opcional (recomendado): invalide qualquer sessão antiga rodando a
   chave de assinatura — todas as sessões caem e todo mundo precisa
   logar de novo:
   ```bash
   wrangler secret put HMAC_BASE_KEY
   # gere um valor novo com: openssl rand -hex 32
   ```

### Apagar e repor os dados de demonstração

- **Apagar:** depois de criar a sua conta (passo 2 acima), o seed nunca
  mais corre — apague as linhas de demonstração no painel (`/admin` →
  Usuários e Drives) ou por SQL no D1 (`DELETE FROM users WHERE
  username='admin';` etc.). Para não semear nada desde o início, ponha
  `DEMO_SEED = "false"` nas `[vars]` do `wrangler.toml` antes do deploy.
- **Repor:** esvazie as tabelas `users` e `admin_drives` e reinicie o
  worker (qualquer request dispara o seed de novo com as tabelas vazias).
  Atenção: isto apaga também as suas contas — faça backup antes.

**Nunca deixe a tabela `users` vazia em produção sem `DEMO_SEED=false`:**
com a tabela vazia, o seed recria o admin de demonstração no próximo
arranque.

## Passo 8 — Domínio/rotas

No dashboard da Cloudflare (Workers e Pages → seu worker → Domínios
personalizados), adicione o seu domínio (ex. `plataforma.seu-dominio.com`).
A Cloudflare cria o DNS e o certificado sozinho. Depois confira:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://plataforma.seu-dominio.com/login
# esperado: 200
```

Se preferir rotas por padrão (ex. só `/*` de um domínio), use a
seção `routes` do `wrangler.toml` ou o dashboard (Workers e Pages →
seu worker → Domínios → Adicionar rota). Uma rota apontando para o
worker antigo continua valendo até você mudá-la — confira qual worker
responde no domínio depois de cada deploy.

## Passo 9 — Cron semanal

O `[triggers]` do `wrangler.toml` já vem com o cron semanal:

```toml
[triggers]
crons = ["0 0 * * 1"]   # toda segunda-feira, 00:00 UTC
```

Ele dispara a varredura/backfill dos cursos registrados (só o que
está na área do aluno e nos destaques do admin — nunca o Drive
inteiro). Para mudar o horário, edite a expressão cron e faça
re-deploy. Para acompanhar uma execução, use `wrangler tail` ou os
logs no dashboard (Workers e Pages → seu worker → Logs). Sem o bloco
`[triggers]` o worker funciona, mas o cron nunca dispara.

## Passo 10 — Agentes de IA da Cloudflare (os SEUS)

O binding `ai` já vem no `wrangler.toml.example` (passo 4) — não há
nada a instalar. O funcionamento:

- **Workers AI primeiro, sem chave.** Cada função (resumo, questões,
  flashcards, correção, OCR de manuscrito, voz) resolve o modelo na
  hora, por função (`resolveCfModel`): o worker tenta os modelos da
  função em ordem e guarda o que funciona no KV (`cfmodel:<função>`).
  Se um modelo for descontinuado, o sistema avança sozinho para o
  próximo modelo adequado — sem mudança de código e sem deploy.
- **Resposta ruim não conta como sucesso.** Resposta curta demais ou
  texto de erro faz o worker tentar o próximo modelo, em vez de
  devolver lixo.
- **Cota diária:** quando a cota gratuita do Workers AI esgota, a
  cascata cai nos fallbacks com as suas chaves (passo 5, nesta ordem:
  OpenRouter, depois Pollinations sem chave). Sem as chaves, cai
  direto no Pollinations.
- **AI Gateway (opcional):** se quiser cache e limite de taxa no
  gateway, crie um gateway no dashboard (AI → AI Gateway) e ponha o
  ID e o account ID nas vars `AI_GATEWAY_ID` e `CF_ACCOUNT_ID`.

Teste na aba **IA** do painel do admin (`/admin`): ela lista os
provedores, o modelo resolvido por função e o estado da cota. Limites
do plano gratuito (confira os valores atuais no dashboard, pois a
Cloudflare os ajusta): Workers AI por neurônios/dia por conta, D1 por
linhas lidas/escritas por dia, KV por escritas por dia.

## Passo 11 — Drives do admin

1. Entre com a sua conta de admin e abra `/admin` → **Drives**.
2. Adicione as pastas do Google Drive que a plataforma vai servir
   (o ID é o trecho final da URL da pasta no Drive — no painel, use o
   ID real da SUA pasta, nunca um ID de exemplo).
3. Cada drive tem um nome a mostrar e os apps que o veem.

O worker já traz dois drives de exemplo (`DRIVE_EXEMPLO_01` "Pasta de
Exemplo 1" e `DRIVE_EXEMPLO_02` "Pasta de Exemplo 2", com IDs fictícios)
— apague-os e ponha os seus no lugar. O seed de drives do `worker.js`
nasce só com esses dois exemplos: nenhum Drive real vem embutido. O que
você cadastrar no painel fica na tabela `admin_drives` do D1 e passa a
valer na hora.

## Passo 12 — O front (onde mora e como publica)

- O front mora em `staging/modular/` no repo (ex. `shell/shell.js`,
  os módulos `gdi-*.js`, `study/*`, `meggy/*`). O worker busca esses
  arquivos do repo em `MODULAR_REPO` @ `MODULAR_REF` (passo 1).
- **Publicar uma versão nova do front = commitar no repo.** O worker
  busca o arquivo de novo após o cache de 300 s — não precisa de
  deploy do worker para atualizar o front.
- Para distribuir com estabilidade, fixe `MODULAR_REF` numa tag
  (passo 1). Para desenvolver, use `main`.
- O worker serve os arquivos do front na rota `/modular/<arquivo>`
  (só os arquivos da lista permitida — o worker não serve qualquer
  coisa do repo).

## Passo 13 — Operação e backup

```bash
# Logs ao vivo
wrangler tail

# Backup do D1 num só arquivo SQL (só leitura — não escreve no D1)
wrangler d1 export gdi-index --remote --output backup.sql
```

Faça o backup com regularidade e guarde-o fora da Cloudflare. Para
restaurar num D1 novo, crie o banco (passo 2) e aplique o arquivo com
`wrangler d1 execute <banco> --remote --file=backup.sql`.

## Solução de problemas

| Sintoma | Causa provável | Correção |
| --- | --- | --- |
| `wrangler deploy` falha com binding | ID de D1/KV errado ou inexistente | Confira os IDs dos passos 2–3 no `wrangler.toml` |
| `/login` abre, mas o login falha | `CRYPTO_BASE_KEY`/`HMAC_BASE_KEY` ausentes | `wrangler secret put` dos dois (passo 5) e re-deploy |
| Login ok, mas Drive vazio / erro | Credenciais do Google ausentes ou refresh token expirado | Recrie `GOOGLE_CLIENT_ID`/`SECRET`/`REFRESH_TOKEN` (passo 5) |
| Front desatualizado após commit | Cache de 300 s do worker ou cache do jsDelivr | Aguarde 5 min; se fixou `MODULAR_REF` em tag, suba a tag nova |
| IA responde "não disponível" | Cota do Workers AI esgotada e sem fallback | Aguarde a virada da cota ou crie uma chave de fallback (passo 5) |
| Cron não roda | Bloco `[triggers]` ausente | Adicione o bloco (passo 4) e faça re-deploy |
| `/admin` devolve 403 | Seu email não está em `ADMIN_USERS` | Edite a var (passo 7) e faça re-deploy |

## Segurança — resumo

- **Segredo nunca entra em código, commit, log ou arquivo.** Só via
  `wrangler secret put` (ou `.dev.vars` local, nunca commitado).
- **Troque a senha de demonstração do admin** (passo 7) antes de expor.
- **Rode as chaves** (`CRYPTO_BASE_KEY`, `HMAC_BASE_KEY`, chaves de
  IA) se alguma vazar — e invalide as sessões rodando o `HMAC_BASE_KEY`.
- **`.dev.vars` e `wrangler.toml` não vão para o repo** (`.gitignore`).
- **Backups do D1** não contêm segredos em texto claro fora da tabela
  `app_secrets` — guarde-os como guardaria qualquer backup com dados.

## Apêndice — o que o worker faz sozinho

- Cria o schema do D1 no primeiro arranque (`d1EnsureSchema`).
- Resolve os modelos do Workers AI por função e guarda o que funciona
  no KV.
- Migra os segredos correntes para KV + D1 pelo painel do admin
  (opcional — o Worker secrets continua sendo a fonte principal).
- Serve o front de `staging/modular/` com cache de 300 s.
