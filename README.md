# GDI Index — Plataforma de Estudos Educa/Meggy 🐩

**Versão:** 1.0.60 · **Build:** 2026-09-23

Plataforma de estudos completa construída sobre o Google Drive Index, com IA integrada (Meggy), scanner de cursos, questões, flashcards, simulados, cronograma, correção de redação e muito mais.

---

## 📖 Manual do Usuário / User Manual

- [Português](#português)
- [English](#english)

---

# Português

## 🎯 O que é o GDI Index?

O GDI Index transforma Google Drives compartilhados (cursos, apostilas, video-aulas) em uma plataforma de estudos profissional. Você navega pelas pastas como num explorador de arquivos, assiste às aulas com player de vídeo, e tem uma tutora de IA (Meggy) que gera resumos, questões e flashcards automaticamente.

### Principais Recursos

| Recurso | Descrição |
|---|---|
| 📂 **Navegação de Drives** | 12 drives organizados por categoria (TRTs, ALFACON, OAB, etc.) |
| 🎬 **Player de Vídeo** | Player integrado com playlist, modos de foco, retomar de onde parou |
| 📄 **Visualizador de Materiais** | PDFs, Markdown, TXT e HTML com painel de materiais lateral |
| 🐩 **Meggy AI** | Tutora de IA que gera resumos, questões, pílulas e flashcards |
| 📊 **Área do Aluno** | Dashboard com estatísticas, cronograma, simulados, conquistas |
| 🔍 **Scanner de Cursos** | Encontra automaticamente todas as aulas (vídeos/PDFs) de um curso |
| 📝 **Correção de Redação** | Meggy corrige redações por banca (CEBRASPE, FGV, ENEM, etc.) |
| 🎯 **Mapa de Fracos** | Identifica disciplinas com baixo aproveitamento |
| 🃏 **Flashcards SRS** | Sistema de repetição espaçada (Leitner 5 boxes) |
| ❓ **Banco de Questões** | Questões geradas + importadas + compartilhadas entre alunos |

---

## 🚀 Como Usar

### 1. Login

1. Acesse o site (educa.eu.org)
2. Digite seu usuário e senha
3. Clique "Entrar"

> Para criar conta: clique "Não tem conta? Criar conta"

### 2. Navegando pelos Drives

A homepage mostra 12 drives (categorias de cursos):
- **RETA FINAL TRTs** — Tribunais Regionais do Trabalho
- **CURSOS - PLATAFORMAS COMPLETAS** — Cursos integrais
- **ENEM e VESTIBULARES** — Preparatórios
- **MUSICA E CANTO** — Música
- **CARREIRAS EDUCACIONAIS** — Magistério
- **CLUBE FIT** — Educação física
- **HIPOPRESSIVOS** — Exercícios hipopressivos
- **SAÚDE E MEDICINA** — Saúde
- **TUDO DE TRIBUNAIS** — Tribunais
- **ALFACON 2026** — Cursos Alfacon
- **PREPARATÓRIO OAB** — Exame da OAB

Clique em qualquer drive para navegar pelas pastas como no Google Drive.

### 3. Assistindo uma Aula

1. Navegue até a pasta da aula
2. Clique no arquivo de vídeo (.mp4)
3. O player abre com:
   - **Vídeo à esquerda** + **materiais à direita** (PDFs, transcrições, etc.)
   - **Botões de modo** (topo): Dividido / Foco na aula / Foco no material
   - **Botão Assistido**: marca como assistido
   - **Playlist**: navega entre aulas da pasta
   - **Resumo automático**: marca como assistido ao chegar em 90%

### 4. Visualizando Materiais (PDF/MD/TXT)

1. Clique em qualquer PDF, Markdown (.md), TXT ou HTML no Drive
2. Abre o **modo foco no material**:
   - Só o painel de materiais à direita
   - Aba do arquivo clicado é **auto-selecionada**
   - Botão "Foco no material" (único botão visível)
   - PDFs scrollam normalmente (iframe)
   - Markdown renderizado com formatação (headings, listas, código)

### 5. Área do Aluno

**Como abrir:** 
- Clique no botão "Área do Aluno" no topo
- Ou use a tecla `C`
- Ou acesse `?central=1` na URL

#### Abas disponíveis:

| Aba | Função |
|---|---|
| 🏠 **Início** | Dashboard com saudação, stats e "continue de onde parou" |
| ❓ **Questões** | Banco de questões com SRS (repetição espaçada) |
| ⏱️ **Simulado** | Simulado cronometrado com questões do curso |
| 📁 **Adicionar matéria** | Adiciona curso (navegando Drive ou manual) |
| 📋 **Resumos** | Resumos gerados pela Meggy |
| 📄 **Provas** | Análise de provas (upload PDF → temas + plano de estudo) |
| ✏️ **Redação** | Correção de redação por banca |
| 📅 **Cronograma** | Plano de estudos até a prova |
| 📊 **Estatísticas** | Heat calendar, horas por curso, streak |
| 🎯 **Mapa de Fracos** | Disciplinas com baixo aproveitamento |
| 🏆 **Conquistas** | Medalhas por marcos alcançados |

### 6. Adicionando um Curso

1. Abra a Área do Aluno
2. Clique "Adicionar matéria"
3. Escolha:
   - **Navegar Drive**: navegue até a pasta do curso → "Selecionar esta pasta"
   - **Manual**: digite o nome (para cursos personalizados)
4. O curso aparece na lista e o **scanner inicia automaticamente** em background

#### Scanner de Cursos

O scanner encontra todas as aulas (vídeos/PDFs/áudios) do curso recursivamente:
- **Incremental**: processa ~40 pastas por batch, salva progresso no Drive
- **Cache compartilhado**: se outro aluno já escaneou o mesmo curso, pega do cache
- **Progresso visível**: barra de progresso no card do curso
- **Sem travamento**: não congela o browser (roda em background)
- **Botão "Escanear agora"**: reinicia o scan se necessário
- **Botão "Reiniciar Scan"**: limpa cache e re-escaneia
- **Botão "Remover"**: remove o curso (com confirmação)

### 7. Meggy AI 🐩

Meggy é uma poodle tutora de IA integrada à plataforma.

#### Chat da Meggy

- **FAB flutuante** (botão rosa com poodle) no canto inferior direito
- Clique para abrir o chat
- Pergunte sobre a aula, peça resumos, tire dúvidas
- Meggy tem **memória**: lembra suas últimas aulas, pontos fracos e tópicos
- **30 mensagens por hora** (rate limit)

#### Gerar Resumo (Aba "Resumo Meggy")

1. Abra uma aula (vídeo)
2. No painel de materiais à direita, clique "Resumo Meggy"
3. Meggy busca **transcrições primeiro** (se houver, usa só elas — mais rápido)
4. Se não houver transcrição, extrai texto dos PDFs
5. Gera resumo profundo com:
   - Conteúdo detalhado
   - Pegadinhas de prova
   - Resumo rápido
6. Salva automaticamente no Drive + localStorage
7. Próxima vez: carrega do cache instantaneamente

#### Gerar Questões (Aba "Questões Meggy")

1. No painel de materiais, clique "Questões Meggy"
2. Gera 10 questões (múltipla escolha + certo/errado CEBRASPE)
3. Cada questão tem: enunciado, opções, resposta correta, explicação, fundamentação legal
4. Questões entram no **banco de questões** (SRS)
5. Clique "Gerar mais 5" para mais questões

#### Pílulas (Aba "Pílulas")

- 15 bullets de revisão ultra-concisos
- Ideal para revisão rápida antes da prova
- Download como PDF disponível

#### Flashcards (Aba "Flashcards")

- Criados automaticamente das questões que você errou
- Organizados por disciplina → tema
- Sistema **SRS Leitner** (5 boxes: 1, 3, 7, 21, 60 dias)
- Cartão 3D flip (clique para virar)
- Atalhos: `Space` vira, `1/2/3/4` classifica

### 8. Banco de Questões

#### Resolver Questões

1. Área do Aluno → Questões
2. Filtre por disciplina (pills no topo)
3. Clique "Resolver revisões" (questões vencidas no SRS)
4. Ou "Caderno de erros" (questões que errou)
5. Responda, veja explicação, classifique

#### Gerar Questões com Meggy

1. Clique "Gerar com Meggy"
2. Digite o tema (ex: "Direito Constitucional")
3. Escolha quantidade (1-10)
4. Meggy gera questões no formato concurso

#### Importar Questões

Cole um array JSON:
```json
[
  {
    "statement": "Pergunta?",
    "options": ["a", "b", "c", "d"],
    "correct": 0,
    "explanation": "Porque...",
    "subject": "Disciplina"
  }
]
```

### 9. Simulado

1. Área do Aluno → Simulado
2. Selecione o curso
3. Escolha N questões (5-50) e tempo (5-180 min)
4. Pool = suas questões + questões compartilhadas de outros alunos
5. **Fisher-Yates shuffle** (embaralhamento justo)
6. Timer com deadline
7. Resultado com % de acerto
8. Salvo no histórico

### 10. Cronograma de Estudos

1. Área do Aluno → Cronograma
2. Digite a data da prova
3. Questões/aulas por dia (1-10)
4. Gera plano automaticamente
5. Revisões agendadas em +1, +7, +30 dias
6. Visualize "Hoje" e "Próximos dias"

### 11. Correção de Redação

1. Área do Aluno → Redação
2. Escolha a banca:
   - **Concurso Público** (CEBRASPE/CESPE, FGV, VUNESP)
   - **ENEM** (5 competências)
   - **Vestibulares Medicina** (FUVEST, UNIFESP)
   - **Outros Vestibulares**
3. Escolha o tipo (dissertativa, narrativa, carta, etc.)
4. Envie: imagem (OCR), PDF, ou cole o texto
5. Meggy retorna:
   - Nota geral
   - Avaliação por critério
   - Comentários por parágrafo
   - Pontos fortes e fracos
   - Sugestões
   - Versão reescrita
6. Salva no histórico + Drive

### 12. Análise de Provas

1. Área do Aluno → Provas
2. Arraste um PDF de prova anterior
3. Meggy analisa:
   - 5 temas mais cobrados
   - Plano de estudo de 100 horas
4. Salva o plano

### 13. Mapa de Fracos

1. Área do Aluno → Mapa de Fracos
2. Visualiza disciplinas por aproveitamento:
   - 🔴 < 40% (crítico)
   - 🟡 40-60% (atenção)
   - 🟢 60-80% (bom)
   - 🟢 > 80% (excelente)
3. Clique numa disciplina para praticar questões dela

### 14. Estatísticas

- **Streak** (dias consecutivos estudando)
- **Minutos hoje/semana/total**
- **Heat calendar** (estilo GitHub — últimos 91 dias)
- **Horas por curso** (gráfico de barras)
- **Conquistas desbloqueadas**

### 15. Modos de Foco

Ao assistir uma aula ou ver um material:

| Modo | Botão | Efeito |
|---|---|---|
| **Dividido** | 🔲 | Vídeo + materiais lado a lado (padrão) |
| **Foco na aula** | ⚡ | Só vídeo (tela cheia) |
| **Foco no material** | 📄 | Só materiais (para PDFs/MDs) |

> Em páginas de material (PDF/MD/TXT/HTML), só aparece "Foco no material"

### 16. Atalhos de Teclado

| Tecla | Ação |
|---|---|
| `C` | Abre/fecha Área do Aluno |
| `Esc` | Fecha painel/modal |
| `Space` | Vira flashcard |
| `1` | Classifica flashcard: "De novo" (+1 dia) |
| `2` | Classifica flashcard: "Difícil" (+3 dias) |
| `3` | Classifica flashcard: "Bom" (+intervalo) |
| `4` | Classifica flashcard: "Fácil" (+intervalo×1.5) |

### 17. Conquistas 🏆

Desbloqueie medalhas por:
- Assistir N aulas
- Criar N flashcards
- Estudar N dias consecutivos
- Fazer N simulados
- Responder N questões
- etc.

---

## ❓ Perguntas Frequentes (FAQ)

### O scanner parou com erro. O que faço?

1. Abra o detalhe do curso
2. Clique "Reiniciar Scan"
3. Se persistir, clique "Remover" e re-adicione o curso navegando até a pasta correta

### O resumo da Meggy não gera.

- Verifique se há transcrição (.md com "transcri" no nome) na pasta da aula
- Meggy prioriza transcrições — se houver, gera em 3-5s
- Se não houver, extrai dos PDFs (pode demorar 30-60s)

### Como compartilho resumos com outros alunos?

Automático! Quando você gera um resumo, ele é compartilhado no pool. Outros alunos veem na aba "Resumos".

### O vídeo travou. O que faço?

O Player-Guard detecta travamentos (15s sem progresso) e oferece "Recarregar" ou "Continuar aguardando".

### Como mudo o tema (dark/light)?

Botão de tema no topo (sol/lua).

---

# English

## 🎯 What is GDI Index?

GDI Index transforms shared Google Drives (courses, textbooks, video lessons) into a professional study platform. You navigate folders like a file explorer, watch lessons with an integrated video player, and have an AI tutor (Meggy) that generates summaries, questions, and flashcards automatically.

### Key Features

| Feature | Description |
|---|---|
| 📂 **Drive Navigation** | 12 drives organized by category |
| 🎬 **Video Player** | Integrated player with playlist, focus modes, resume |
| 📄 **Material Viewer** | PDFs, Markdown, TXT and HTML with side materials panel |
| 🐩 **Meggy AI** | AI tutor that generates summaries, questions, pills, flashcards |
| 📊 **Student Area** | Dashboard with stats, schedule, mock exams, achievements |
| 🔍 **Course Scanner** | Automatically finds all lessons (videos/PDFs) in a course |
| 📝 **Essay Correction** | Meggy corrects essays by examination board |
| 🎯 **Weakness Map** | Identifies subjects with low performance |
| 🃏 **SRS Flashcards** | Spaced repetition system (Leitner 5 boxes) |
| ❓ **Question Bank** | Generated + imported + shared questions |

---

## 🚀 How to Use

### 1. Login

1. Access the site (educa.eu.org)
2. Enter your username and password
3. Click "Entrar" (Login)

> To create an account: click "Não tem conta? Criar conta"

### 2. Navigating Drives

The homepage shows 12 drives (course categories). Click any drive to navigate folders like Google Drive.

### 3. Watching a Lesson

1. Navigate to the lesson folder
2. Click the video file (.mp4)
3. The player opens with:
   - **Video on left** + **materials on right** (PDFs, transcripts, etc.)
   - **Mode buttons** (top): Split / Focus on lesson / Focus on material
   - **Watched button**: marks as watched
   - **Playlist**: navigate between lessons
   - **Auto-watch**: marks as watched at 90% duration

### 4. Viewing Materials (PDF/MD/TXT)

1. Click any PDF, Markdown (.md), TXT or HTML in Drive
2. Opens **focus on material mode**:
   - Only the materials panel on right
   - Clicked file's tab is **auto-selected**
   - "Focus on material" button (only visible button)
   - PDFs scroll normally (iframe)
   - Markdown rendered with formatting

### 5. Student Area

**How to open:**
- Click "Área do Aluno" button at top
- Or press `C`
- Or access `?central=1` in URL

#### Available tabs:

| Tab | Function |
|---|---|
| 🏠 **Home** | Dashboard with greeting, stats and "continue where you left off" |
| ❓ **Questions** | Question bank with SRS (spaced repetition) |
| ⏱️ **Mock Exam** | Timed mock exam with course questions |
| 📁 **Add Subject** | Add course (browsing Drive or manual) |
| 📋 **Summaries** | Meggy-generated summaries |
| 📄 **Exams** | Exam analysis (upload PDF → topics + study plan) |
| ✏️ **Essay** | Essay correction by examination board |
| 📅 **Schedule** | Study plan until exam date |
| 📊 **Statistics** | Heat calendar, hours per course, streak |
| 🎯 **Weakness Map** | Subjects with low performance |
| 🏆 **Achievements** | Medals for milestones |

### 6. Adding a Course

1. Open Student Area
2. Click "Adicionar matéria"
3. Choose:
   - **Navegar Drive**: navigate to course folder → "Selecionar esta pasta"
   - **Manual**: type name (for custom courses)
4. Course appears in list and **scanner starts automatically** in background

#### Course Scanner

The scanner finds all lessons (videos/PDFs/audio) in the course recursively:
- **Incremental**: processes ~40 folders per batch, saves progress to Drive
- **Shared cache**: if another student already scanned the same course, uses cache
- **Visible progress**: progress bar on course card
- **No freezing**: runs in background, doesn't freeze browser
- **"Scan now" button**: restarts scan if needed
- **"Restart Scan" button**: clears cache and re-scans
- **"Remove" button**: removes course (with confirmation)

### 7. Meggy AI 🐩

Meggy is a poodle AI tutor integrated into the platform.

#### Meggy Chat

- **Floating FAB** (pink button with poodle) in bottom-right corner
- Click to open chat
- Ask about the lesson, request summaries, ask questions
- Meggy has **memory**: remembers your last lessons, weaknesses and topics
- **30 messages per hour** (rate limit)

#### Generate Summary ("Resumo Meggy" tab)

1. Open a lesson (video)
2. In the materials panel on right, click "Resumo Meggy"
3. Meggy searches **transcriptions first** (if available, uses only them — faster)
4. If no transcription, extracts text from PDFs
5. Generates deep summary with:
   - Detailed content
   - Exam pitfalls
   - Quick summary
6. Automatically saves to Drive + localStorage
7. Next time: loads from cache instantly

#### Generate Questions ("Questões Meggy" tab)

1. In materials panel, click "Questões Meggy"
2. Generates 10 questions (multiple choice + right/wrong CEBRASPE)
3. Each question has: statement, options, correct answer, explanation, legal basis
4. Questions enter the **question bank** (SRS)
5. Click "Gerar mais 5" for more questions

#### Pills ("Pílulas" tab)

- 15 ultra-concise revision bullets
- Ideal for quick review before exam
- PDF download available

#### Flashcards ("Flashcards" tab)

- Automatically created from questions you missed
- Organized by discipline → theme
- **SRS Leitner** system (5 boxes: 1, 3, 7, 21, 60 days)
- 3D flip card (click to flip)
- Shortcuts: `Space` flips, `1/2/3/4` grade

### 8. Question Bank

#### Solve Questions

1. Student Area → Questions
2. Filter by discipline (pills at top)
3. Click "Resolver revisões" (SRS-due questions)
4. Or "Caderno de erros" (questions you missed)
5. Answer, see explanation, grade

#### Generate Questions with Meggy

1. Click "Gerar com Meggy"
2. Type the topic (e.g., "Constitutional Law")
3. Choose quantity (1-10)
4. Meggy generates exam-format questions

#### Import Questions

Paste a JSON array:
```json
[
  {
    "statement": "Question?",
    "options": ["a", "b", "c", "d"],
    "correct": 0,
    "explanation": "Because...",
    "subject": "Discipline"
  }
]
```

### 9. Mock Exam

1. Student Area → Mock Exam
2. Select course
3. Choose N questions (5-50) and time (5-180 min)
4. Pool = your questions + shared questions from other students
5. **Fisher-Yates shuffle** (fair shuffling)
6. Timer with deadline
7. Result with accuracy %
8. Saved to history

### 10. Study Schedule

1. Student Area → Schedule
2. Enter exam date
3. Questions/lessons per day (1-10)
4. Auto-generates plan
5. Reviews scheduled at +1, +7, +30 days
6. View "Today" and "Upcoming days"

### 11. Essay Correction

1. Student Area → Essay
2. Choose examination board:
   - **Public Contest** (CEBRASPE/CESPE, FGV, VUNESP)
   - **ENEM** (5 competencies)
   - **Medical Schools** (FUVEST, UNIFESP)
   - **Other Vestibulares**
3. Choose type (dissertation, narrative, letter, etc.)
4. Submit: image (OCR), PDF, or paste text
5. Meggy returns:
   - Overall grade
   - Criterion-by-criterion evaluation
   - Paragraph-by-paragraph comments
   - Strengths and weaknesses
   - Suggestions
   - Rewritten version
6. Saves to history + Drive

### 12. Exam Analysis

1. Student Area → Exams
2. Drag a PDF of a past exam
3. Meggy analyzes:
   - 5 most tested topics
   - 100-hour study plan
4. Saves plan

### 13. Weakness Map

1. Student Area → Weakness Map
2. View disciplines by performance:
   - 🔴 < 40% (critical)
   - 🟡 40-60% (attention)
   - 🟢 60-80% (good)
   - 🟢 > 80% (excellent)
3. Click a discipline to practice its questions

### 14. Statistics

- **Streak** (consecutive study days)
- **Minutes today/week/total**
- **Heat calendar** (GitHub-style — last 91 days)
- **Hours per course** (bar chart)
- **Achievements unlocked**

### 15. Focus Modes

When watching a lesson or viewing material:

| Mode | Button | Effect |
|---|---|---|
| **Split** | 🔲 | Video + materials side by side (default) |
| **Focus on lesson** | ⚡ | Video only (full screen) |
| **Focus on material** | 📄 | Materials only (for PDFs/MDs) |

> On material pages (PDF/MD/TXT/HTML), only "Focus on material" appears

### 16. Keyboard Shortcuts

| Key | Action |
|---|---|
| `C` | Open/close Student Area |
| `Esc` | Close panel/modal |
| `Space` | Flip flashcard |
| `1` | Grade flashcard: "Again" (+1 day) |
| `2` | Grade flashcard: "Hard" (+3 days) |
| `3` | Grade flashcard: "Good" (+interval) |
| `4` | Grade flashcard: "Easy" (+interval×1.5) |

### 17. Achievements 🏆

Unlock medals for:
- Watching N lessons
- Creating N flashcards
- Studying N consecutive days
- Taking N mock exams
- Answering N questions
- etc.

---

## ❓ FAQ

### The scanner stopped with an error. What do I do?

1. Open course details
2. Click "Reiniciar Scan"
3. If it persists, click "Remover" and re-add the course by navigating to the correct folder

### Meggy's summary doesn't generate.

- Check if there's a transcript (.md with "transcri" in name) in the lesson folder
- Meggy prioritizes transcripts — if available, generates in 3-5s
- If not, extracts from PDFs (may take 30-60s)

### How do I share summaries with other students?

Automatic! When you generate a summary, it's shared to the pool. Other students see it in the "Summaries" tab.

### The video froze. What do I do?

The Player-Guard detects stalls (15s no progress) and offers "Reload" or "Continue waiting".

### How do I change theme (dark/light)?

Theme button at top (sun/moon).

---

## 📦 For Developers

See [MANUAL_TECNICO.md](./MANUAL_TECNICO.md) for the complete technical manual with architecture, endpoints, functions, and deployment instructions.

### Architecture

- **Backend**: Cloudflare Worker (worker.js) — proxies Google Drive API
- **Frontend**: SPA with jQuery + Bootstrap 5.3.3
- **AI**: Meggy — LLM via NVIDIA NIM / Zhipu GLM / CF Workers AI / OpenAI
- **Modules**: 10 JS files loaded via jsdelivr CDN from public GitHub repo
- **Storage**: Google Drive (`.meggy.ai/` folders) + localStorage + Cloudflare KV

### Repositories

- **Public**: `esaaraujo-lab/gdi_server` — modules + app.min.js + manuals (no secrets)
- **Private**: `esaaraujo-lab/student_gdi` — worker.js (with Google Drive credentials)

### Deploy

```bash
# Full release (sync + commit + purge + verify)
./gdi-release.sh "v1.0.XX: description"

# Just commit to GitHub
./gdi-deploy.sh "message"

# Just purge CDN
./gdi-purge-cdn.sh

# Verify version
./gdi-verify.sh
```

---

**Made with ❤️ by Meggy** 🐩
