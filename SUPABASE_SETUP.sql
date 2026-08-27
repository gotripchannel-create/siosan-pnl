create table if not exists public.restaurant_data (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null default 'siosan',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.restaurant_data enable row level security;

drop policy if exists "authenticated users can read restaurant data" on public.restaurant_data;
drop policy if exists "authenticated users can insert restaurant data" on public.restaurant_data;
drop policy if exists "authenticated users can update restaurant data" on public.restaurant_data;

create policy "authenticated users can read restaurant data"
on public.restaurant_data for select to authenticated using (true);

create policy "authenticated users can insert restaurant data"
on public.restaurant_data for insert to authenticated with check (true);

create policy "authenticated users can update restaurant data"
on public.restaurant_data for update to authenticated using (true) with check (true);

insert into public.restaurant_data (restaurant_id, data)
select 'siosan', '{}'::jsonb
where not exists (select 1 from public.restaurant_data where restaurant_id = 'siosan');
