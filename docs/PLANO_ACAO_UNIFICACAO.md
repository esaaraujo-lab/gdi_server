# 🎯 PLANO DE AÇÃO — Unificação da Interface

## Transformar Meggy de "GDI + Overlay" em Plataforma de Estudos Nativa

> **Data:** 2026-10-24
> **Base:** Análise HAR do Alfacon + skills ui-ux-pro-max + diagnóstico do código atual
> **Objetivo:** Área do Aluno sempre visível, como em cursinhos (Alfacon, Estratégia, Gran Cursos)

---

## 📋 RESUMO EXECUTIVO

### O problema atual
Quando o usuário clica em qualquer coisa na Área do Aluno (curso, aula, "continuar assistindo"), **5 pontos do código fazem `location.href = path`** — uma navegação hard que **destrói o overlay** da Área do Aluno e manda o usuário para o Drive Index (URL `/0:/CURSO X/`). Isso acontece porque a Área do Aluno é um **overlay bolt-on** sobre o GDIndex, não uma view integrada.

### A solução (sua ideia está certa ✅)
**Embutir o layout da Área do Aluno DENTRO do GDI** como um **shell persistente** (sidebar + header sempre visíveis), com o conteúdo do drive/carregando na painel principal. É exatamente o padrão que o Alfacon usa (VLE = Virtual Learning Environment, SPA com header + sidebar fixos).

### 3 estratégias avaliadas

| Estratégia | Descrição | Tempo | Risco | Recomendação |
|-----------|-----------|-------|-------|--------------|
| **A — Overlay Persistente** | Manter overlay mas nunca usar `location.href`; navegar via fetch+render inline | 5-7 dias | Baixo | ⚠️ Paliativo |
| **B — Split-View Shell** ⭐ | App shell com sidebar+header+main pane; GDI vira widget dentro do main pane | 10-14 dias | Médio | ✅ **RECOMENDADO** |
| **C — Full SPA Rewrite** | Reescrever como Next.js/Hono SPA; GDI vira API-only | 60-90 dias | Alto | 🔮 Long-term |

### Veredito
**Estratégia B (Split-View Shell)** — transforma a Meggy em plataforma de estudos de verdade em 2 semanas, sem rewrite total. A Área do Aluno vira o shell; o Drive Index vira um widget que carrega pastas via API dentro do painel principal.

---

## 1️⃣ ANÁLISE DO ALFACON (referência)

### 1.1 Arquitetura observada no HAR

| Aspecto | Alfacon | Meggy (atual) |
|---------|---------|---------------|
| **URL principal** | `perfil.alfaconcursos.com.br/vle` (subdomínio próprio) | `educa.eu.org/` (raiz do GDIndex) |
| **Tipo de app** | SPA (VLE = Virtual Learning Environment) | GDIndex + overlay bolt-on |
| **Build** | webpacker com code-splitting (`/packs/js/` com 9 chunks) | Sem build (6 arquivos `.js` por `<script>`) |
| **CSS** | 3 stylesheets (vle main + icon font + nps) | CSS inline + 1 stylesheet |
| **API calls próprios** | 2 apenas (`/nps/presentations` + `/usage_events`) | 70+ endpoints `/api/*` |
| **Navegação drive** | ❌ Nenhuma exposta ao usuário | ✅ Sim — é a navegação principal |
| **Layout** | Header com logo (dark/light) + sidebar + main pane | Overlay full-screen sobre GDIndex |
| **Frameworks** | Rails + webpacker + SPA JS (provável React/Stimulus) | Vanilla JS + GDIndex core |

### 1.2 O que o Alfacon NÃO faz (e por que funciona)

O Alfacon **não expõe a navegação de pastas do Google Drive** ao usuário. O aluno nunca vê URLs como `/0:/CURSO X/Aula 1.mp4`. Em vez disso:

1. O aluno entra no VLE (`/vle`)
2. Vê seus cursos matriculados (cards na home)
3. Clica num curso → vê módulos + aulas (API retorna estrutura)
4. Clica numa aula → player abre inline (não muda de página)
5. Sidebar sempre visível com: Home, Meus Cursos, Progresso, Suporte

**O Google Drive é um detail de implementação backend — invisível ao usuário.**

### 1.3 Padrões de UI/UX identificados (per skill ui-ux-pro-max)

Da análise do HAR + skills:

| Padrão | Implementação Alfacon | Aplicável à Meggy |
|--------|----------------------|-------------------|
| **Sticky Navigation** (UX guideline #2) | Header fixo no topo | ✅ Sim — header com logo + user menu |
| **Active State** (UX guideline #3) | Item ativo destacado na sidebar | ✅ Sim — curso/aula atual |
| **Back Button** (UX guideline #4) | History.pushState preservado | ❌ **Meggy quebra isso** com `location.href` |
| **Deep Linking** (UX guideline #5) | URL reflete estado (curso/aula) | ❌ Meggy usa URLs do GDIndex |
| **Breadcrumbs** (UX guideline #6) | Implícitos na sidebar | ✅ Sim |
| **Z-Index Management** (UX guideline #15) | Layers controlados | ❌ Meggy usa z-index arbitrários |
| **Content Jump** (UX guideline #19) | Espaço reservado para async | ✅ Sim |

### 1.4 Style recommendation (per ui-reasoning.csv — Education row)

| Atributo | Recomendação skill |
|----------|-------------------|
| **Pattern** | Feature-Rich Showcase |
| **Style** | Claymorphism + Micro-interactions |
| **Colors** | Playful + Clear hierarchy |
| **Typography** | Friendly + Engaging |
| **Animations** | Soft press (200ms) + Fluffy elements |
| **If gamification** | add-progress-animation |
| **Avoid** | Dark modes + Complex jargon |

> ⚠️ **Nota:** Meggy já usa tema dark (por escolha da marca). A skill recomenda evitar dark mode para educação, mas Meggy tem identidade visual própria (rosa #ff8b9f + ciano #5ddeda sobre #0d1119). Manter o dark mas aplicar os outros princípios (clear hierarchy, friendly typography, progress animations).

---

## 2️⃣ DIAGNÓSTICO — POR QUE CLICAR MANDA PARA O INDEX

### 2.1 Os 5 pontos de `location.href` (a causa raiz)

| # | Arquivo:linha | Contexto | O que faz |
|---|--------------|----------|-----------|
| 1 | `gdi-study.js:1583` | Botão "Continuar" no card de curso | `location.href=target+'?a=view'` → abre pasta no GDIndex |
| 2 | `gdi-study.js:1847` | Botão "Continuar" (variant) | `location.href=c.key` → vai para `/0:/CURSO/` |
| 3 | `gdi-study.js:1853` | Botão "Continuar" (variant 2) | `location.href=tg+'?a=view'` |
| 4 | `gdi-study.js:2748` | Botão "Continuar" no detalhe do curso | `location.href=target+'?a=view'` |
| 5 | `gdi-study.js:2760` | Abrir pasta da disciplina | `location.href=p` → vai para pasta GDIndex |

**Efeito:** cada `location.href` causa um **full page reload** que:
1. Destrói o overlay da Área do Aluno (position:fixed)
2. Carrega a página do GDIndex (app.min.js + gdi-study.js + gdi-meggy.js novamente)
3. O usuário "cai" no Drive Index, perdendo o contexto da Área do Aluno

### 2.2 A função `navigate()` JÁ EXISTE como padrão correto

```javascript
// gdi-study.js:2087 — JÁ EXISTE o padrão correto
async function navigate(path){
  currentPath = normalizeNavPath(normPath(path));
  renderBreadcrumb();
  loadingEl.style.display = 'block';
  // ...
  const result = await window.gdiListAllFiles(currentPath, pw);  // fetch via API
  // render inline — NÃO faz location.href
}
```

**MAS** essa função `navigate()` só é usada no modal "Adicionar Curso" (linhas 2184, 2408, 2413) — **NUNCA** no fluxo principal de navegação de cursos.

### 2.3 O overlay é frágil

```javascript
// gdi-study.js:1248 — o overlay
function openPanel(t) {
  // cria <div class="gdi-central-box" style="position:fixed;inset:0">
}
```

O overlay é `position:fixed; inset:0` — cobre a tela toda. Mas como ele é **renderizado em cima** do GDIndex (que continua carregado embaixo), qualquer `location.href` o destrói.

### 2.4 Por que o Alfacon não tem esse problema

O Alfacon **não tem GDIndex exposto**. O VLE é a única UI. Não há "mandar para o index" porque o index **não existe** para o usuário. O Google Drive é acessado via API no backend, nunca via URL na barra de endereços.

---

## 3️⃣ AS 3 ESTRATÉGIAS AVALIADAS

### Estratégia A — Overlay Persistente (paliativo)

**O que:** Manter o overlay atual, mas substituir TODOS os `location.href` por chamadas fetch+render inline (usando o padrão da função `navigate()` existente).

**Como:**
```javascript
// ANTES (quebra o overlay):
contBtn.onclick = () => { location.href = target + '?a=view'; };

// DEPOIS (mantém overlay):
contBtn.onclick = async () => {
  const files = await window.gdiListAllFiles(target, '');
  renderFolderInline(files, target);  // renderiza no overlay
};
```

| Pró | Contra |
|-----|--------|
| Menor esforço (5-7 dias) | Não resolve a fragmentação (overlay + GDIndex) |
| Mantém código existente | UX ainda confusa (overlay sobre GDIndex) |
| Risco baixo | Não vira "plataforma nativa" — continua sendo "GDI melhorado" |

**Veredito:** ⚠️ **Paliativo.** Resolve o bug do redirecionamento mas não transforma a Meggy em plataforma de estudos.

### Estratégia B — Split-View Shell ⭐ RECOMENDADA

**O que:** Criar um **app shell persistente** (header + sidebar + main pane) que SEMPRE está visível. A Área do Aluno vira o shell. O GDIndex vira um **widget** que carrega pastas via API dentro do main pane.

**Layout proposto:**

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER (fixo) — logo Meggy | busca | user menu | tema      │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│ SIDEBAR  │  MAIN PANE (carrega conteúdo dinamicamente)      │
│ (fixa)   │                                                  │
│          │  ┌─────────────────────────────────────────────┐ │
│ ▸ Home   │  │ Breadcrumb: Drives > Curso X > Módulo 1     │ │
│ ▸ Cursos │  ├─────────────────────────────────────────────┤ │
│   - Curso│  │                                             │ │
│   - Curso│  │  [Conteúdo carregado aqui]                  │ │
│ ▸ Progress│ │  - Grid de pastas (era GDIndex)             │ │
│ ▸ Questões│ │  - Player de vídeo (era GDIndex)            │ │
│ ▸ Flashcards│ │  - PDF viewer (era GDIndex)                │ │
│ ▸ Meggy AI│ │  - Questões (era gdi-study)                 │ │
│ ▸ Config │  │  - Resumos (era gdi-meggy)                  │ │
│          │  │                                             │ │
│ ──────── │  └─────────────────────────────────────────────┘ │
│ 🐩 Meggy │                                                  │
│ [drawer] │  ← Meggy AI pode ser drawer lateral direito      │
└──────────┴──────────────────────────────────────────────────┘
```

**Como funciona:**
1. Usuário loga → vê o **shell** (não o GDIndex)
2. Sidebar sempre visível: Home, Cursos, Progresso, Questões, Flashcards, Meggy AI, Config
3. Clica em "Cursos" → main pane mostra grid de cursos (via `/api/courses/list`)
4. Clica num curso → main pane mostra aulas do curso (via `/api/courses/scan-progress`)
5. Clica numa aula → main pane mostra player de vídeo (via `gdiListAllFiles` + link de download)
6. **NUNCA** muda de URL de forma a destruir o shell — usa `history.pushState` para deep linking
7. Meggy AI = drawer lateral direito (desliza da direita, não cobre o main pane)

**Pró | Contra**
| Menor esforço para virar "plataforma nativa" (10-14 dias) | Reescrever o frontend (não o backend) |
| Shell sempre visível = UX de cursinho de verdade | Precisa de build step (Vite) |
| GDIndex vira widget (invisível ao usuário) | Migração incremental dos módulos |
| Deep linking funciona (history.pushState) | Testes needed para cada fluxo |
| Meggy AI integrado, não overlay | |

**Veredito:** ✅ **RECOMENDADA.** Transforma a Meggy em plataforma de estudos de verdade, mantém o backend (worker.js), reescreve só o frontend.

### Estratégia C — Full SPA Rewrite (long-term)

**O que:** Reescrever tudo como Next.js 16 + Hono + Prisma SPA. GDI vira API-only (sem servir HTML). Área do Aluno é a única UI.

**Como:**
- Backend: Hono router (Cloudflare Workers) + Prisma (D1) + OpenAPI spec
- Frontend: Next.js 16 + React Server Components + shadcn/ui + Tailwind 4
- GDI: vira endpoint `/api/gdi/list?path=...` (JSON only, sem HTML)
- Build: Vite + TypeScript estrito
- Auth: NextAuth.js com D1 adapter

| Pró | Contra |
|-----|--------|
| Arquitetura limpa do zero | 60-90 dias de trabalho |
| Type-safety total (TypeScript) | Risco alto (rewrite) |
| Performance superior (RSC) | Pode quebrar features existentes |
| Mantém todo o backend | Precisa retestar tudo |

**Veredito:** 🔮 **Long-term.** É o destino final, mas não o próximo passo. Fazer B primeiro, evoluir para C gradualmente.

---

## 4️⃣ PLANO DE AÇÃO — ESTRATÉGIA B (Split-View Shell)

### Fase 0 — Preparação (1 dia)

```bash
# 1. Backup já feito (checkpoint-20261024)
# 2. Instalar Vite no frontend
cd /home/z/my-project/DEPLOY_FINAL
npm install -D vite @vitejs/plugin-react typescript

# 3. Criar estrutura de módulos ES
mkdir -p src/{shell,sidebar,mainpane,player,api,utils}
```

### Fase 1 — App Shell (3-4 dias)

**Objetivo:** Criar o shell persistente (header + sidebar + main pane).

**Entregáveis:**
- `src/shell/AppShell.tsx` — layout root com header + sidebar + main pane
- `src/shell/Header.tsx` — logo + busca + user menu + theme toggle
- `src/shell/Sidebar.tsx` — navegação lateral (Home, Cursos, Progresso, Questões, Flashcards, Meggy AI, Config)
- `src/shell/MainPane.tsx` — container que carrega views dinamicamente
- Router client-side (history.pushState, sem location.href)

**Critério de aceite:**
- Shell renderiza em qualquer URL sob `/`
- Sidebar sempre visível (responsiva: colapsa em mobile)
- Navegação entre seções NUNCA recarrega a página
- URL atualiza via pushState (deep linking funciona)

### Fase 2 — Migração Cursos (3-4 dias)

**Objetivo:** Migrar o módulo de cursos do `gdi-study.js` para o shell.

**Entregáveis:**
- `src/mainpane/CoursesView.tsx` — grid de cursos (era `renderCursos`)
- `src/mainpane/CourseDetailView.tsx` — detalhe do curso (era `openCourseDetail`)
- `src/mainpane/FolderBrowserView.tsx` — navegador de pastas (era `navigate()`)
- **Substituir TODOS os 5 `location.href`** por navegação no-shell

**Critério de aceite:**
- Clicar num curso → abre detalhe NO main pane (não recarrega)
- Clicar numa aula → abre player NO main pane
- Clicar em "Continuar" → retoma de onde parou, no main pane
- Breadcrumb funciona (volta para qualquer nível)
- **Zero `location.href`** no fluxo de cursos

### Fase 3 — Migração Player (2-3 dias)

**Objetivo:** Player de vídeo integrado ao shell (não overlay).

**Entregáveis:**
- `src/player/VideoPlayer.tsx` — player HTML5 integrado ao main pane
- Playlist lateral (aulas do curso atual)
- Resume tracking (salva posição a cada 10s)
- Atalhos: espaço (play/pause), setas (seek 10s), F (fullscreen)

**Critério de aceite:**
- Player abre no main pane (não em overlay separado)
- Sidebar continua visível durante reprodução
- Trocar de aula não recarrega o shell
- Resume funciona entre sessões

### Fase 4 — Migração Meggy AI (2-3 dias)

**Objetivo:** Meggy AI como drawer lateral direito (não overlay full-screen).

**Entregáveis:**
- `src/shell/MeggyAIDrawer.tsx` — drawer que desliza da direita
- Toggle (botão na header) abre/fecha drawer
- Chat, Resumos, Flashcards, Questões como tabs no drawer
- Drawer NÃO cobre o main pane (empurra o conteúdo)

**Critério de aceite:**
- Drawer abre sem cobrir o conteúdo principal
- Pode usar Meggy AI enquanto assiste aula (lado a lado)
- Drawer colapsa em mobile (vira modal bottom sheet)

### Fase 5 — Migração Outros Módulos (2-3 dias)

**Objetivo:** Migrar Questões, Flashcards, Progresso, Config para o shell.

**Entregáveis:**
- `src/mainpane/QuestionsView.tsx` — questões/simulado
- `src/mainpane/FlashcardsView.tsx` — flashcards/SRS
- `src/mainpane/ProgressView.tsx` — dashboard de progresso
- `src/mainpane/SettingsView.tsx` — configurações

### Fase 6 — Limpeza + Deploy (1-2 dias)

**Objetivo:** Remover código legado e deployar.

**Entregáveis:**
- Remover `gdi-study.js` e `gdi-meggy.js` antigos (substituídos pelos módulos ES)
- Remover overlay `gdi-central-box` (substituído pelo shell)
- Manter `app.min.js` como widget interno (folder browser, player core)
- Deploy para `educa.eu.org`

**Tempo total: 14-19 dias**

---

## 5️⃣ O QUE AS SKILLS SUGEREM

### 5.1 Skill `ui-ux-pro-max` — recomendações aplicadas

| Recomendação skill | Aplicação na Meggy |
|--------------------|--------------------|
| **Sticky Navigation** (UX #2) | Header fixo no topo do shell |
| **Active State** (UX #3) | Item ativo destacado na sidebar (curso/aula atual) |
| **Back Button** (UX #4) | `history.pushState` em vez de `location.href` — preserva histórico |
| **Deep Linking** (UX #5) | URL reflete estado: `/cursos/curso-x/aula-1` |
| **Breadcrumbs** (UX #6) | Breadcrumb no main pane (Drives > Curso > Módulo > Aula) |
| **Z-Index Management** (UX #15) | Scale system: shell=10, sidebar=20, drawer=30, modal=40, toast=50 |
| **Content Jump** (UX #19) | Reservar espaço para conteúdo async (skeleton screens) |
| **Loading States** (UX #10) | Skeleton screens durante fetch de cursos/aulas |
| **Error Feedback** (UX #33) | Toast + retry em falhas de API |
| **Success Feedback** (UX #34) | Toast ao salvar progresso/resumo |

### 5.2 Skill `design` — design system

| Token | Valor recomendado |
|-------|-------------------|
| `--shell-bg` | `#0d1119` (já é da marca) |
| `--shell-sidebar-bg` | `#161b22` |
| `--shell-header-bg` | `#0d1119` com blur |
| `--shell-border` | `#21262d` |
| `--shell-accent` | `#ff8b9f` (rosa Meggy) |
| `--shell-accent-2` | `#5ddeda` (ciano Meggy) |
| `--shell-text` | `#e6edf3` |
| `--shell-text-muted` | `#7d8590` |
| `--shell-sidebar-width` | `260px` (desktop), `0` collapsed |
| `--shell-header-height` | `56px` |
| `--shell-drawer-width` | `380px` (Meggy AI drawer) |
| `--shell-radius` | `12px` (cards), `8px` (buttons) |

### 5.3 Skill `fullstack-dev` — padrões de implementação

| Padrão | Aplicação |
|--------|-----------|
| Next.js 16 App Router | Se escolher Estratégia C (long-term) |
| shadcn/ui components | Sidebar, Drawer, Toast, Tabs, Breadcrumb |
| TanStack Query | Cache de cursos/aulas (substitui `GDIStorage` LRU) |
| Zustand | State global do shell (current view, current course, drawer open) |
| Tailwind CSS 4 | Styling (substitui CSS inline) |

### 5.4 Skills ClawHub recomendadas para instalar

| Skill | Aplicação |
|-------|-----------|
| `ui-ux-pro-max` (já instalada) | Design system + layout patterns |
| `fullstack-dev` (já instalada) | Padrões Next.js se for Estratégia C |
| `coding-agent` (já instalada) | Code generation para os módulos ES |
| `improve-codebase-architecture` (já instalada) | Refactor deep/shallow modules |
| `safe-refactor` (@dennisrongo) | Refactor seguro das 5 `location.href` |
| `content-strategy` (@coreyhaines31) | Roadmap de features pós-unificação |

---

## 6️⃣ O QUE EU SUGERIO (recomendação final)

### 6.1 Sobre sua ideia (embed Área do Aluno dentro do GDI)

**✅ ESTÁ CERTA.** Sua intuição está perfeita. A Área do Aluno deve ser o **shell persistente**, e o GDIndex deve virar um **widget** dentro dela — não o contrário (que é hoje).

**Mas com uma correção importante:** não é "embed dentro do GDI" — é o **oposto**: o GDI é que vira um widget DENTRO da Área do Aluno. A Área do Aluno passa a ser o app principal (shell), e o GDIndex só aparece como um navegador de pastas dentro do main pane, quando o usuário precisa explorar o drive.

### 6.2 Por que a Estratégia B e não A

A Estratégia A (overlay persistente) é paliativa — resolve o bug do redirecionamento mas mantém a fragmentação (overlay + GDIndex). O usuário ainda fica confuso: "estou na Área do Aluno ou no Drive Index?"

A Estratégia B (split-view shell) resolve a raiz: **só existe uma UI** (o shell). O GDIndex some como conceito visível — vira um widget de navegação de pastas, como um "file picker" interno.

### 6.3 Por que não pular direto para C

A Estratégia C (full SPA rewrite) é o destino final, mas **pular direto** é arriscado:
- 60-90 dias é muito tempo sem releases
- Pode quebrar features existentes que funcionam
- O backend (worker.js) está estável — não precisa reescrever

**Melhor abordagem:** Fazer B agora (2 semanas), evoluir para C gradualmente nos meses seguintes (migrar módulos um a um para Next.js quando fizer sentido).

### 6.4 Recomendação concreta — por onde começar

**Semana 1 (Fases 0-1):**
1. Instalar Vite + TypeScript no frontend
2. Criar `AppShell.tsx` com header + sidebar + main pane
3. Migrar APENAS a navegação cursos→detalhe→aula (o fluxo crítico)
4. Substituir os 5 `location.href` por navegação no-shell
5. **Testar:** clicar num curso não pode mais mandar para o index

**Semana 2 (Fases 2-4):**
6. Migrar player de vídeo para o main pane
7. Migrar Meggy AI para drawer lateral
8. Migrar Questões/Flashcards/Progresso
9. Limpeza + deploy

**Marco de sucesso:** quando o usuário conseguir navegar de Home → Curso → Aula → Player → Meggy AI → Voltar para Curso **sem nunca recarregar a página** e **sem nunca sair do shell**.

### 6.5 Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Quebrar features existentes durante migração | Migração incremental + feature flags |
| Perder resume tracking (posição do vídeo) | Manter `GDIUser` state intacto |
| Quebrar Meggy AI (overlay → drawer) | Migrar por último, testar isoladamente |
| Mobile quebra (sidebar muito larga) | Sidebar colapsa em mobile (hamburger menu) |
| SEO/performance piora (SPA) | SSR gradual na Estratégia C |

---

## 7️⃣ COMPARAÇÃO — ANTES vs DEPOIS

| Aspecto | Hoje (GDI + Overlay) | Depois (Split-View Shell) |
|---------|----------------------|--------------------------|
| **UI principal** | GDIndex (drive browser) | Shell da Área do Aluno |
| **Navegação** | `location.href` (recarrega) | `history.pushState` (SPA) |
| **Área do Aluno** | Overlay bolt-on | Shell persistente |
| **GDIndex** | App principal | Widget interno (navegador de pastas) |
| **Meggy AI** | Overlay full-screen | Drawer lateral direito |
| **Player de vídeo** | Página do GDIndex | Integrado ao main pane |
| **URLs** | `/0:/CURSO/Aula.mp4` | `/cursos/curso-x/aula-1` |
| **Build** | Sem build (script tags) | Vite + ES modules |
| **State** | `window.*` + Bus | Zustand + TanStack Query |
| **UX** | Fragmentada (2 apps) | Unificada (1 shell) |
| **Referência** | GDIndex fork | Alfacon VLE / Estratégia / Gran |

---

## 8️⃣ PRÓXIMOS PASSOS

### Hoje (decisão)
1. ✅ Backup checkpoint feito (`backup-20261024`)
2. ✅ Análise HAR Alfacon feita
3. ✅ Plano de ação criado (este documento)
4. 🔜 **Decidir:** Estratégia B (recomendada) ou A (paliativo)?

### Se aprovar Estratégia B — amanhã
1. Instalar Vite + TypeScript no frontend
2. Criar `AppShell.tsx` (header + sidebar + main pane)
3. Migrar fluxo cursos→detalhe→aula (substituir 5 `location.href`)
4. Testar: clicar num curso não manda para o index

### Em 2 semanas
- Meggy é uma plataforma de estudos nativa (não mais "GDI melhorado")
- Pronta para próximas features: gamificação, cronograma IA, provas simuladas

---

## 📎 APÊNDICE

### A. Evidências do código (file:line)

**Os 5 `location.href` que causam o redirecionamento:**
```
gdi-study.js:1583 — contBtn.onclick → location.href=target+'?a=view'
gdi-study.js:1847 — contBtn.onclick → location.href=c.key
gdi-study.js:1853 — contBtn.onclick → location.href=tg+'?a=view'
gdi-study.js:2748 — contBtn.onclick → location.href=target+'?a=view'
gdi-study.js:2760 — if(p) location.href=p  // abre pasta da disciplina
```

**A função `navigate()` que JÁ É o padrão correto:**
```
gdi-study.js:2087 — async function navigate(path) { fetch + render inline }
```

**O overlay frágil:**
```
gdi-study.js:1248 — function openPanel(t) { position:fixed; inset:0 }
```

### B. Skills usadas neste plano

| Skill | Versão | Contribuição |
|-------|--------|--------------|
| `ui-ux-pro-max` | (instalada) | UX guidelines (navigation, layout) + design system tokens |
| `design` | (instalada) | Design system reference |
| `fullstack-dev` | (instalada) | Padrões Next.js/Hono para Estratégia C |
| `improve-codebase-architecture` | 1.1.1 | Deep/shallow modules — identifica o overlay como shallow |
| `code-security-audit` | 2.1.0 | Garantir que migração não introduz vulnerabilidades |

### C. Referências

- **Alfacon (HAR analisado):** `perfil.alfaconcursos.com.br/vle` — VLE SPA
- **GDIndex origem:** `@googledrive/index` por Parveen Bhadoo (GitLab)
- **Análise arquitetural:** `docs/ANALISE_ARQUITETURA.md`
- **Relatório executivo:** `docs/RELATORIO_EXECUTIVO_PLATAFORMA.md`
- **Backup checkpoint:** `backup/phase1-checkpoint-20261024-134317/`

---

**Fim do plano.** Próxima ação: decidir Estratégia B (recomendada) e começar Fase 0 (Vite + AppShell).

---

*Plano criado em 2026-10-24 com base em análise HAR do Alfacon + skills ui-ux-pro-max/design/fullstack-dev + diagnóstico do código Meggy (gdi-study.js:1583,1847,1853,2748,2760).*
