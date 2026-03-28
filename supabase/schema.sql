-- VoiceDo 데이터베이스 스키마

-- users 테이블
CREATE TABLE IF NOT EXISTS users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username         text UNIQUE NOT NULL,
  push_subscription jsonb,
  created_at       timestamptz DEFAULT now()
);

-- todos 테이블
CREATE TABLE IF NOT EXISTS todos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  username     text NOT NULL,
  content      text NOT NULL,
  deadline     date,
  is_completed boolean DEFAULT false,
  priority     text DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  created_at   timestamptz DEFAULT now(),
  notified_at  timestamptz
);

-- RLS 활성화
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- todos 정책: Supabase Auth 기반 (auth.uid() = user_id)
-- 본인 데이터만 읽기/쓰기/삭제 가능

-- 기존 정책 제거 후 재생성 (중복 방지)
DROP POLICY IF EXISTS "todos_username_isolation" ON todos;
DROP POLICY IF EXISTS "todos_select" ON todos;
DROP POLICY IF EXISTS "todos_insert" ON todos;
DROP POLICY IF EXISTS "todos_update" ON todos;
DROP POLICY IF EXISTS "todos_delete" ON todos;

CREATE POLICY "todos_select" ON todos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "todos_insert" ON todos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "todos_update" ON todos
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "todos_delete" ON todos
  FOR DELETE USING (auth.uid() = user_id);

-- users 정책: 본인 레코드만 접근 (id = auth.uid())
DROP POLICY IF EXISTS "users_all" ON users;
CREATE POLICY "users_self" ON users
  FOR ALL USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- pg_cron 등록 (Supabase SQL Editor에서 실행)
-- 먼저 pg_net 확장이 활성화되어 있어야 합니다.
-- SELECT cron.schedule(
--   'send-deadline-reminders',
--   '30 4 * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-reminders',
--     headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
--   );
--   $$
-- );
