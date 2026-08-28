-- Выполнить один раз в Supabase → SQL Editor.
-- Таблица для отладки: что ИИ получил на входе и что вернул на выходе.
-- Не участвует в бизнес-логике P&L, только для диагностики, если что-то разобралось не так.

create table if not exists ai_parse_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  input_text text not null,
  ai_output jsonb,
  used_fallback boolean not null default false,
  error text,
  created_by uuid references auth.users(id)
);

alter table ai_parse_logs enable row level security;

-- Любой вошедший пользователь может писать и читать логи (соответствует модели
-- «один аккаунт = один ресторан», как и у остальных таблиц в этом проекте).
create policy "authenticated can insert ai_parse_logs"
  on ai_parse_logs for insert
  to authenticated
  with check (true);

create policy "authenticated can read ai_parse_logs"
  on ai_parse_logs for select
  to authenticated
  using (true);

-- Опционально: автоматически подчищать логи старше 30 дней, чтобы таблица не росла бесконечно.
-- Раскомментируйте и настройте pg_cron, если хотите автоочистку:
-- select cron.schedule('cleanup-ai-parse-logs', '0 3 * * *', $$delete from ai_parse_logs where created_at < now() - interval '30 days'$$);
