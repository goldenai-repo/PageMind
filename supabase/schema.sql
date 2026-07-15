-- PageMind: per-user library isolation.
--
-- Currently `public.books` has RLS disabled and no `user_id` column, and the
-- `books` Storage bucket has blanket "anyone can read/write" policies — so
-- every signed-in account sees every other account's books. This migration
-- adds ownership and scopes access to it. Run the whole thing once in the
-- Supabase SQL editor (Dashboard → SQL Editor).

-- ============================================================
-- 1. Add user_id to public.books
-- ============================================================

-- Nullable at first — existing rows (uploaded before isolation existed)
-- have no owner yet and would violate a NOT NULL constraint immediately.
alter table public.books
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public.books
  alter column user_id set default auth.uid();

-- ------------------------------------------------------------
-- 2. Resolve existing NULL rows before locking the column down.
--
-- As of this writing there's exactly one: id=2 "第二本电子书", stored at
-- the Storage bucket ROOT (not inside a user folder). Backfilling its
-- user_id alone won't make the file itself readable again once the
-- storage policies below key off the <user_id>/ path prefix — so the
-- simplest fix is to delete it now and re-upload it after this migration
-- (the app will place it in the correct folder automatically):
--   delete from public.books where id = 2;
-- then in Storage → books, delete c354d444-f629-41ec-ab05-14961b19e3fc.epub
-- from the bucket root.
--
-- If you'd rather keep old rows instead of deleting, assign them to your
-- account (find your id in Dashboard → Authentication → Users) — just know
-- the underlying file will still need to be re-uploaded into that folder:
--   update public.books set user_id = '<your-user-uuid>' where user_id is null;
-- ------------------------------------------------------------

-- Run this only after step 2 leaves zero NULL rows:
alter table public.books
  alter column user_id set not null;

-- ============================================================
-- 3. Re-enable RLS on public.books (it was disabled for early testing)
--    and scope every policy to the row's owner.
-- ============================================================

alter table public.books enable row level security;

drop policy if exists "Users can view their own books" on public.books;
create policy "Users can view their own books"
  on public.books for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own books" on public.books;
create policy "Users can insert their own books"
  on public.books for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own books" on public.books;
create policy "Users can delete their own books"
  on public.books for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- 4. Storage: replace the old blanket policies with folder-scoped ones.
--    Files now upload to books/<user_id>/<filename>; these key off that
--    first path segment matching the caller's auth.uid().
--
--    NOTE: pre-existing files uploaded to the bucket ROOT (before this
--    migration) have no user folder, so `(storage.foldername(name))[1]`
--    is NULL for them and they'll become unreadable under these policies.
--    Re-upload anything you still need, or move it into a user folder.
-- ============================================================

drop policy if exists "Public can upload to books bucket" on storage.objects;
drop policy if exists "Public can read books bucket" on storage.objects;

create policy "Users can upload to their own folder in books bucket"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'books'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can read their own files in books bucket"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'books'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own files in books bucket"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'books'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
