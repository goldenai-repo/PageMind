-- PageMind: current Supabase setup for the 'books' feature.
--
-- Table `public.books` and the `books` Storage bucket already exist (created
-- via the Supabase dashboard), and RLS on the `books` table is disabled for
-- local testing.
--
-- Upload policy (already applied — uploads are confirmed working):
--   create policy "Public can upload to books bucket"
--     on storage.objects for insert
--     to public
--     with check (bucket_id = 'books');
--
-- Read/open still fails: a live check against a real uploaded file's public
-- URL (".../object/public/books/<file>") returned 400 "Bucket not found" —
-- the standard response Supabase's public-serving endpoint gives when a
-- bucket's `public` flag isn't actually set to true, despite the dashboard
-- toggle. Rather than depend on that flag, the reader now downloads through
-- the authenticated Storage API instead of a plain fetch() of the public
-- URL — which only needs a SELECT policy (same pattern as the insert one
-- above) and works regardless of the bucket's public/private setting.
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor) so books
-- can actually be opened:

create policy "Public can read books bucket"
  on storage.objects for select
  to public
  using (bucket_id = 'books');

-- Optional, not required by the app: if you'd still like the "public"
-- toggle itself to work (e.g. for embedding files directly via <img src>
-- or sharing links), double-check Storage → books → bucket settings — the
-- "Public bucket" switch may not have saved, since the 400 above indicates
-- it's currently reading as false.

-- NOTE (security): with table RLS disabled and these policies in place, ANY
-- caller — including unauthenticated ones — can read, write, and list every
-- row/file in this bucket and table. That's fine for local testing, but
-- before this ships beyond your own machine it needs per-user scoping (e.g.
-- a user_id column + RLS policies keyed on auth.uid()) so one person's
-- library isn't visible/writable by everyone else.
