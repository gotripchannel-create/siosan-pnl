# СИОСАН — Управленческий P&L (Supabase)

React/Vite-приложение с общей облачной базой Supabase и входом по email/паролю.

## Vercel Environment Variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Обе переменные в Vercel можно хранить как `Config`.

## Supabase

1. Выполнить `SUPABASE_SETUP.sql` в Supabase SQL Editor.
2. В Authentication убедиться, что Email provider включён.
3. При включённом Confirm email новый пользователь сначала подтверждает почту.

## GitHub

В корне репозитория должны быть `package.json`, `index.html`, `vercel.json`, а `App.jsx` и `main.jsx` — внутри папки `src`.
