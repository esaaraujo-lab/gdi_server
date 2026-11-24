-- ═══════════════════════════════════════════════════════════════════
-- GDI Index — Migração inicial do D1 (0001_init.sql)
-- Extraída VERBATIM de d1EnsureSchema() do worker v2.15.93 (base limpa).
-- Cria as 22 tabelas + índices do schema atual. Idempotente (IF NOT
-- EXISTS) — pode rodar mais de uma vez sem erro.
-- O worker também cria este schema sozinho no 1º arranque
-- (d1EnsureSchema); esta migração existe p/ setup explícito/auditoria.
-- No 1º arranque, com as tabelas vazias, o worker também semeia os
-- dados de demonstração (admin/admin + usuários de teste + drives
-- fictícios — ver docs/DEPLOY.md, passo 7; DEMO_SEED=false desliga).
--
-- Aplicar:  wrangler d1 execute <NOME-DO-D1> --file=migrations/0001_init.sql
--           (remoto: --remote; local p/ teste: --local)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lessons (id TEXT PRIMARY KEY, course_hash TEXT NOT NULL, course_path TEXT NOT NULL, lesson_path TEXT NOT NULL, lesson_name TEXT NOT NULL, lesson_type TEXT, mime_type TEXT, ext TEXT, size INTEGER, drive_index INTEGER NOT NULL DEFAULT 0, parent_folder_path TEXT, has_summary INTEGER DEFAULT 0, has_questions INTEGER DEFAULT 0, has_flashcards INTEGER DEFAULT 0, has_simulado INTEGER DEFAULT 0, has_pilulas INTEGER DEFAULT 0, scanned_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_lessons_course_hash ON lessons(course_hash);
CREATE INDEX IF NOT EXISTS idx_lessons_lesson_name ON lessons(lesson_name);
CREATE INDEX IF NOT EXISTS idx_lessons_course_path ON lessons(course_path);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lessons_course_lesson ON lessons(course_path, lesson_path);
CREATE TABLE IF NOT EXISTS shared_summaries (id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_name TEXT NOT NULL, summary TEXT NOT NULL, questions TEXT, mindmap TEXT, author TEXT NOT NULL, course_path TEXT, date INTEGER NOT NULL, UNIQUE(lesson_name, author));
CREATE INDEX IF NOT EXISTS idx_ss_lesson_name ON shared_summaries(lesson_name);
CREATE INDEX IF NOT EXISTS idx_ss_author ON shared_summaries(author);
CREATE INDEX IF NOT EXISTS idx_ss_date ON shared_summaries(date DESC);
CREATE TABLE IF NOT EXISTS shared_flashcards (id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT NOT NULL, front TEXT, back TEXT, statement TEXT, options TEXT, correct INTEGER DEFAULT 0, explanation TEXT, legal_text TEXT, fundamentacao TEXT, type TEXT DEFAULT 'mc', author TEXT NOT NULL, date INTEGER NOT NULL, topic TEXT, source TEXT, qfp TEXT);
CREATE INDEX IF NOT EXISTS idx_sf_subject ON shared_flashcards(subject);
CREATE INDEX IF NOT EXISTS idx_sf_author ON shared_flashcards(author);
CREATE TABLE IF NOT EXISTS user_courses (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, course_path TEXT NOT NULL, course_name TEXT, pdf_count INTEGER DEFAULT 0, icon TEXT, color TEXT, added_at INTEGER NOT NULL, UNIQUE(username, course_path));
CREATE INDEX IF NOT EXISTS idx_uc_username ON user_courses(username);
CREATE TABLE IF NOT EXISTS materials_meta (id INTEGER PRIMARY KEY AUTOINCREMENT, course_hash TEXT NOT NULL, lesson_path TEXT NOT NULL, material_type TEXT NOT NULL, file TEXT, generated_at INTEGER NOT NULL, generated_by TEXT, UNIQUE(lesson_path, material_type));
CREATE INDEX IF NOT EXISTS idx_mm_course_hash ON materials_meta(course_hash);
CREATE INDEX IF NOT EXISTS idx_mm_lesson_path ON materials_meta(lesson_path);
CREATE TABLE IF NOT EXISTS concursos (id TEXT PRIMARY KEY, username TEXT NOT NULL, name TEXT NOT NULL, banca TEXT, exam_date TEXT, daily_hours REAL DEFAULT 3, status TEXT DEFAULT 'active', created_at INTEGER NOT NULL, updated_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_concursos_username ON concursos(username);
CREATE TABLE IF NOT EXISTS concurso_disciplinas (id INTEGER PRIMARY KEY AUTOINCREMENT, concurso_id TEXT NOT NULL, nome TEXT NOT NULL, peso INTEGER DEFAULT 0, incidencia TEXT DEFAULT 'media', topicos TEXT);
CREATE INDEX IF NOT EXISTS idx_cd_concurso_id ON concurso_disciplinas(concurso_id);
CREATE TABLE IF NOT EXISTS concurso_lessons (id INTEGER PRIMARY KEY AUTOINCREMENT, concurso_id TEXT NOT NULL, lesson_path TEXT NOT NULL, lesson_name TEXT, disciplina TEXT, topico TEXT, matched_by TEXT, confidence REAL DEFAULT 0, is_intensivo INTEGER DEFAULT 0, matched_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_cl_concurso_id ON concurso_lessons(concurso_id);
CREATE INDEX IF NOT EXISTS idx_cl_disciplina ON concurso_lessons(disciplina);
CREATE TABLE IF NOT EXISTS concurso_sources (id INTEGER PRIMARY KEY AUTOINCREMENT, concurso_id TEXT NOT NULL, course_path TEXT NOT NULL, name TEXT, sort_order INTEGER DEFAULT 0, intensivo INTEGER DEFAULT 0, lesson_count INTEGER DEFAULT 0, disciplinas TEXT, added_at INTEGER NOT NULL, UNIQUE(concurso_id, course_path));
CREATE INDEX IF NOT EXISTS idx_cs_concurso_id ON concurso_sources(concurso_id);
CREATE TABLE IF NOT EXISTS concurso_errors (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, concurso_id TEXT NOT NULL, pergunta TEXT NOT NULL, resposta_certa TEXT, resposta_aluno TEXT, modulo TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ce_user_concurso ON concurso_errors(username, concurso_id);
CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created INTEGER);
CREATE TABLE IF NOT EXISTS app_secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS featured_courses (id INTEGER PRIMARY KEY AUTOINCREMENT, course_path TEXT NOT NULL UNIQUE, course_name TEXT, icon TEXT, color TEXT, cover_url TEXT, sort_order INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS admin_drives (id INTEGER PRIMARY KEY AUTOINCREMENT, drive_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, target_apps TEXT NOT NULL DEFAULT '["meggy"]', cover_url TEXT, sub_cover_url TEXT, subfolder_covers TEXT NOT NULL DEFAULT '{}', source TEXT NOT NULL DEFAULT 'admin', root_index INTEGER, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ad_drive_id ON admin_drives(drive_id);
CREATE INDEX IF NOT EXISTS idx_ad_root_index ON admin_drives(root_index);
CREATE TABLE IF NOT EXISTS scan_status (course_path TEXT PRIMARY KEY, status TEXT NOT NULL, lessons INTEGER DEFAULT 0, completed_at INTEGER, updated_at INTEGER NOT NULL, last_error TEXT, fail_count INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS generation_queue (lesson_path TEXT PRIMARY KEY, course_key TEXT, video_path TEXT, source TEXT NOT NULL DEFAULT 'queue', requested_by TEXT, priority INTEGER NOT NULL DEFAULT 4, status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, next_retry_at INTEGER NOT NULL DEFAULT 0, last_error TEXT, source_text TEXT, result TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_gq_status_priority ON generation_queue(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_gq_requested_by ON generation_queue(requested_by);
CREATE TABLE IF NOT EXISTS banca_profiles (banca TEXT NOT NULL, disciplina TEXT NOT NULL, incidencia TEXT NOT NULL, topicos TEXT NOT NULL, PRIMARY KEY(banca, disciplina));
CREATE TABLE IF NOT EXISTS study_plans (id TEXT PRIMARY KEY, username TEXT NOT NULL, concurso_id TEXT, banca TEXT NOT NULL, name TEXT NOT NULL, exam_date TEXT, daily_hours REAL DEFAULT 2, total_days INTEGER NOT NULL, plan TEXT NOT NULL, origin TEXT DEFAULT 'deterministico', edital_source TEXT, edital_url TEXT, banca_profile TEXT, created_at INTEGER NOT NULL, updated_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_study_plans_username ON study_plans(username);
CREATE INDEX IF NOT EXISTS idx_study_plans_concurso ON study_plans(concurso_id);
CREATE TABLE IF NOT EXISTS user_watched (username TEXT NOT NULL, lesson_path TEXT NOT NULL, lesson_name TEXT, course_path TEXT, watched_at INTEGER, last_position REAL, source TEXT DEFAULT 'drive', updated_at INTEGER NOT NULL, PRIMARY KEY(username, lesson_path));
CREATE INDEX IF NOT EXISTS idx_uw_username ON user_watched(username);
CREATE INDEX IF NOT EXISTS idx_uw_course ON user_watched(course_path);
CREATE TABLE IF NOT EXISTS user_history_events (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, lesson_path TEXT, lesson_name TEXT, course_path TEXT, event_at INTEGER NOT NULL, minutes INTEGER DEFAULT 0, source TEXT DEFAULT 'drive', created_at INTEGER NOT NULL, UNIQUE(username, lesson_path, event_at));
CREATE INDEX IF NOT EXISTS idx_uhe_username ON user_history_events(username);
CREATE INDEX IF NOT EXISTS idx_uhe_event_at ON user_history_events(event_at DESC);
CREATE TABLE IF NOT EXISTS history_migrations (username TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'pending', watched_total INTEGER DEFAULT 0, watched_done INTEGER DEFAULT 0, events_total INTEGER DEFAULT 0, events_done INTEGER DEFAULT 0, source_bytes INTEGER DEFAULT 0, error TEXT, migrated_at INTEGER, updated_at INTEGER NOT NULL, courses_total INTEGER DEFAULT 0, courses_done INTEGER DEFAULT 0, progress_files_total INTEGER DEFAULT 0, progress_files_done INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS user_state_kv (username TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(username, key));
CREATE INDEX IF NOT EXISTS idx_usk_username ON user_state_kv(username);
CREATE INDEX IF NOT EXISTS idx_sf_subject_topic ON shared_flashcards(subject, topic);
CREATE INDEX IF NOT EXISTS idx_sf_subject_qfp ON shared_flashcards(subject, qfp);
