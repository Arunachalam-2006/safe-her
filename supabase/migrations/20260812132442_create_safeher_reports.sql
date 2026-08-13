/*
# Create SafeHer community reports

1. New Tables
- `safeher_reports` stores anonymous community safety observations submitted from the mobile app.
- `id` identifies each report.
- `category` stores the incident type shown in the report form.
- `location_label` stores the user-provided area or landmark without requiring precise coordinates.
- `details` stores optional context for safety analysis.
- `created_at` records when the report was received.

2. Security
- Row-level security is enabled.
- The app intentionally has no sign-in flow, so anonymous and authenticated app sessions can create and read community reports.
- Separate CRUD policies are used for the shared, non-account-specific report feed.

3. Important Notes
- Reports are designed for community trend analysis, not as a replacement for emergency services.
- No personal contact information is collected by this table.
*/

CREATE TABLE IF NOT EXISTS public.safeher_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('Poor lighting', 'Harassment', 'Theft', 'Broken CCTV', 'Unsafe stop', 'Suspicious activity', 'Other')),
  location_label text NOT NULL CHECK (char_length(location_label) BETWEEN 2 AND 120),
  details text NOT NULL DEFAULT '' CHECK (char_length(details) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.safeher_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read SafeHer reports" ON public.safeher_reports;
CREATE POLICY "Public can read SafeHer reports"
ON public.safeher_reports FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Public can submit SafeHer reports" ON public.safeher_reports;
CREATE POLICY "Public can submit SafeHer reports"
ON public.safeher_reports FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Public can update SafeHer reports" ON public.safeher_reports;
CREATE POLICY "Public can update SafeHer reports"
ON public.safeher_reports FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public can delete SafeHer reports" ON public.safeher_reports;
CREATE POLICY "Public can delete SafeHer reports"
ON public.safeher_reports FOR DELETE
TO anon, authenticated
USING (true);

CREATE INDEX IF NOT EXISTS safeher_reports_created_at_idx ON public.safeher_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS safeher_reports_category_idx ON public.safeher_reports (category);