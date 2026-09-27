-- ============================================================================
-- Safe-Her — Supabase schema
-- ============================================================================
-- INSTRUCTIONS
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this whole file and press Run
--   3. It is safe to re-run: every statement is idempotent
--
-- Nothing in this file is executed automatically by the app.
--
-- Creates:
--   * profiles        one row per auth user, keyed on auth.users.id
--   * RLS policies    a user can read/write ONLY their own row
--   * trigger         auto-creates the profile row on signup
-- ============================================================================

-- ── 1. Table ───────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  full_name               text,
  email                   text,
  phone                   text,
  avatar_url              text,

  -- Safety profile
  emergency_contact_name  text default '',
  emergency_contact_phone text default '',
  home_label              text default '',
  home_lat                double precision,
  home_lng                double precision,
  work_label              text default '',
  work_lat                double precision,
  work_lng                double precision,

  -- Role. 'citizen' for everyone. 'government' is granted ONLY by an
  -- administrator after an officer ID check — never set by the client.
  account_type            text not null default 'citizen'
                          check (account_type in ('citizen', 'government')),
  agency                  text default '',

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.profiles is
  'One row per Safe-Her account. Role is server-controlled; clients cannot escalate.';

-- ── 2. Row Level Security ──────────────────────────────────────────────────
-- RLS is enabled. Without it, the publishable key could read every row.
alter table public.profiles enable row level security;

-- Own row: SELECT
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Own row: INSERT (the trigger runs as SECURITY DEFINER, so it is unaffected)
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Own row: UPDATE
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No DELETE policy on purpose: a user cannot delete their own account row
-- through the client. Account removal is an admin action in Supabase Auth.

-- ── 3. Keep updated_at honest ──────────────────────────────────────────────
create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_profiles_updated_at();

-- ── 4. Auto-create a profile when a user signs up ──────────────────────────
-- SECURITY DEFINER so it can insert even though the caller has no INSERT grant
-- on other rows. It only ever creates the caller's own row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, account_type)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    -- Always citizen. Government access is granted later by an admin.
    'citizen'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ── 5. Index for the dashboard-style listing by role ───────────────────────
create index if not exists profiles_account_type_idx
  on public.profiles (account_type);

-- ============================================================================
-- 6. FIRST OFFICER ACCOUNT (run manually, once)
-- ============================================================================
-- Government access is granted by changing one cell in Supabase's table editor.
--
--   1. Sign up the officer normally in the app (they become 'citizen').
--   2. Supabase Dashboard -> Table Editor -> profiles
--   3. Find their row, set  account_type = 'government'
--      and optionally  agency = 'Chennai Police'
--   4. They sign out and back in; the app routes them to the officer dashboard.
--
-- Optional helper — ONLY run this if you are signed in as that officer, or
-- replace the email with their address from the SQL editor (which bypasses RLS
-- as the table owner):
--
--   update public.profiles
--      set account_type = 'government',
--          agency = 'Chennai Police'
--    where email = 'officer@example.com';
--
-- ============================================================================
-- 7. AUTH SETTINGS IN THE SUPABASE DASHBOARD (not SQL)
-- ============================================================================
--   Authentication -> URL Configuration
--     Site URL                       : your deployed web URL
--     Redirect URLs                  : myapp://auth/reset
--                                     myapp://auth/verify-email
--                                     (add http://localhost:8081 for web dev)
--
--   Authentication -> Email
--     Confirm email                  : ON  (recommended — the app shows a
--                                     verification screen when this is on)
--
--   Authentication -> Email Templates -> Confirm signup
--     {{ .ConfirmationURL }}         : keep the default Supabase URL
--
-- ============================================================================
-- VERIFICATION QUERIES (read-only, safe to run)
-- ============================================================================
-- RLS is actually enforced:
--   select count(*) from public.profiles;
--   -- as a signed-in user this must return 1 (their own row), not everyone.
--
-- Trigger fired on signup:
--   select id, email, account_type, created_at
--     from public.profiles
--    order by created_at desc
--    limit 5;
-- ============================================================================
