/*
# Add user detail columns to profiles

Adds optional personal-detail columns to the profiles table so users can store
emergency contact info and saved locations (home, work). All columns are nullable
and default to empty string so existing rows remain valid.

New columns on public.profiles:
- phone text — contact phone number
- emergency_contact_name text — name of an emergency contact
- emergency_contact_phone text — phone for the emergency contact
- home_label text — saved home location label (e.g. "Adyar, Chennai")
- home_lat numeric, home_lng numeric — home coordinates for route estimation
- work_label text — saved work/destination label
- work_lat numeric, work_lng numeric — work coordinates

No RLS policy changes needed — the existing owner-scoped CRUD policies on profiles
already cover SELECT/INSERT/UPDATE/DELETE for these new columns.
*/

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_contact_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS home_label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS home_lat double precision,
  ADD COLUMN IF NOT EXISTS home_lng double precision,
  ADD COLUMN IF NOT EXISTS work_label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS work_lat double precision,
  ADD COLUMN IF NOT EXISTS work_lng double precision;