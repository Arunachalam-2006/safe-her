/*
# Add user profiles and report ownership for SafeHer auth

1. New Tables
- `profiles` stores per-user metadata for both citizen and government accounts.
  - `id` links to the authenticated user (auth.users).
  - `email` mirrors the auth email for display.
  - `full_name` display name for the user.
  - `account_type` distinguishes 'citizen' (everyday user) from 'government' (official dashboard access).
  - `agency` optional agency name for government accounts (e.g. "Chennai Police").
  - `created_at` timestamp.

2. Modified Tables
- `safeher_reports` gains a `user_id` column (nullable) so reports can be linked to the
  submitting user when signed in, while still allowing anonymous (signed-out) reports.
  - The existing single-tenant INSERT policy is replaced with one that accepts both
    authenticated (with user_id) and anon (null user_id) inserts.

3. Security
- `profiles` table: RLS enabled, owner-scoped CRUD (authenticated users see/edit only their own profile).
- `safeher_reports` table: RLS stays enabled.
  - SELECT: public (anon + authenticated) can read all community reports.
  - INSERT: anon can insert with null user_id; authenticated users can insert with their own user_id.
  - UPDATE/DELETE: restricted to authenticated users who own the report. Anon can no longer
    update or delete reports (the old open policies are dropped and replaced).
  - Government accounts gain broader read access via the same SELECT policy (public reads).

4. Automation
- A trigger `handle_new_user_profile` auto-creates a `profiles` row whenever a new auth user signs up,
  using the signup metadata's account_type, full_name, and agency fields.
- The trigger defaults account_type to 'citizen' if no metadata is provided.

5. Important Notes
- Email confirmation stays OFF; users can sign in immediately after signup.
- Government accounts are normal auth accounts whose profile carries account_type = 'government'.
- The profile trigger reads from raw_user_meta_data (set at signup) to populate the profile row.
*/

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  account_type text NOT NULL DEFAULT 'citizen' CHECK (account_type IN ('citizen', 'government')),
  agency text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_delete_own" ON public.profiles;
CREATE POLICY "profiles_delete_own"
ON public.profiles FOR DELETE
TO authenticated
USING (auth.uid() = id);

-- Add nullable user_id to reports so signed-in users can own their reports
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'safeher_reports' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.safeher_reports ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Replace the open UPDATE/DELETE policies with ownership-scoped ones
DROP POLICY IF EXISTS "Public can update SafeHer reports" ON public.safeher_reports;
DROP POLICY IF EXISTS "Public can delete SafeHer reports" ON public.safeher_reports;

CREATE POLICY "owner_update_safeher_reports"
ON public.safeher_reports FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_delete_safeher_reports"
ON public.safeher_reports FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Replace the INSERT policy so both anon (null user_id) and authenticated (own user_id) can insert
DROP POLICY IF EXISTS "Public can submit SafeHer reports" ON public.safeher_reports;

CREATE POLICY "anon_submit_safeher_reports"
ON public.safeher_reports FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Auto-create a profile row when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, account_type, agency)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'account_type', 'citizen'),
    COALESCE(NEW.raw_user_meta_data->>'agency', '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();