-- Выполнить один раз в Supabase → SQL Editor.
-- Кеш ИИ-наблюдений по дашборду, чтобы не пересчитывать при каждом заходе —
-- только когда пользователь сам нажал «Обновить наблюдения».

create table if not exists ai_insights_cache (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,                 -- например '2026-08'
  insights jsonb not null,
  generated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

alter table ai_insights_cache enable row level security;

create policy "authenticated can read ai_insights_cache"
  on ai_insights_cache for select
  to authenticated
  using (true);

create policy "authenticated can insert ai_insights_cache"
  on ai_insights_cache for insert
  to authenticated
  with check (true);

create policy "authenticated can update ai_insights_cache"
  on ai_insights_cache for update
  to authenticated
  using (true);

create index if not exists ai_insights_cache_month_idx on ai_insights_cache (month_key, generated_at desc);
