-- Sledovátko cloud library, schema version 1.
-- Run once in a Supabase project's SQL Editor as the project database owner.
-- Safe to re-run against THIS schema. Never add sledovatko_private to the Data
-- API's exposed schemas: all browser access goes through public RPC functions.

begin;

create schema if not exists sledovatko_private;
revoke all on schema sledovatko_private from public, anon, authenticated;
grant usage on schema sledovatko_private to authenticated;

create or replace function sledovatko_private.valid_library_snapshot(p_snapshot jsonb)
returns boolean
language plpgsql
immutable
parallel safe
security invoker
set search_path = ''
as $$
declare
  item record;
  media jsonb;
  array_keys constant text[] := array[
    'wm_favorites', 'wm_watched', 'wm_order', 'wm_saved_searches', 'wm_hidden_labels'
  ];
  object_keys constant text[] := array[
    'wm_ratings', 'wm_comments', 'wm_labels', 'wm_watched_episodes',
    'wm_tv_meta', 'wm_media_meta', 'wm_custom_labels'
  ];
begin
  if p_snapshot is null or pg_catalog.jsonb_typeof(p_snapshot) <> 'object'
    or pg_catalog.octet_length(p_snapshot::text) > 2097152
    or p_snapshot -> '_v' is distinct from '2'::jsonb
    or pg_catalog.jsonb_typeof(p_snapshot -> 'wm_favorites') is distinct from 'array'
  then return false; end if;

  for item in select key, value from pg_catalog.jsonb_each(p_snapshot) loop
    if item.key = '_v' then continue;
    elsif item.key = '_t' then
      if pg_catalog.jsonb_typeof(item.value) <> 'number' then return false; end if;
    elsif item.key = any(array_keys) then
      if pg_catalog.jsonb_typeof(item.value) <> 'array' then return false; end if;
    elsif item.key = any(object_keys) then
      if pg_catalog.jsonb_typeof(item.value) <> 'object' then return false; end if;
    else
      -- No auth sessions, passwords, API keys or arbitrary localStorage keys.
      return false;
    end if;
  end loop;

  for media in select value from pg_catalog.jsonb_array_elements(p_snapshot -> 'wm_favorites') loop
    if pg_catalog.jsonb_typeof(media) <> 'object'
      or pg_catalog.jsonb_typeof(media -> 'title') is distinct from 'string'
      or pg_catalog.length(media ->> 'title') > 1000
      or not coalesce((media ->> 'id') ~ '^[0-9]{1,15}$', false)
      or not coalesce(media ->> 'mediaType' in ('movie', 'tv'), false)
      or media ->> 'imdbId' is distinct from
        (case when media ->> 'mediaType' = 'tv' then 'tv:' else '' end || (media ->> 'id'))
    then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function sledovatko_private.valid_library_snapshot(jsonb) from public, anon, authenticated;
grant execute on function sledovatko_private.valid_library_snapshot(jsonb) to authenticated;

create table if not exists sledovatko_private.user_libraries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot jsonb,
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint user_libraries_snapshot_valid check (
    (revision = 0 and snapshot is null)
    or (revision > 0 and sledovatko_private.valid_library_snapshot(snapshot))
  )
);

alter table sledovatko_private.user_libraries enable row level security;
alter table sledovatko_private.user_libraries force row level security;

-- SECURITY INVOKER keeps the authenticated role and therefore these policies
-- in force. There is no client-supplied user ID in either RPC.
drop policy if exists library_owner_select on sledovatko_private.user_libraries;
create policy library_owner_select on sledovatko_private.user_libraries
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists library_owner_insert on sledovatko_private.user_libraries;
create policy library_owner_insert on sledovatko_private.user_libraries
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists library_owner_update on sledovatko_private.user_libraries;
create policy library_owner_update on sledovatko_private.user_libraries
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table sledovatko_private.user_libraries from public, anon, authenticated;
grant select, insert, update on table sledovatko_private.user_libraries to authenticated;
-- No DELETE: clearing a library is another revision, so a stale device cannot
-- resurrect an old snapshot after a revision counter was reset.

create or replace function public.get_library()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  current_library sledovatko_private.user_libraries%rowtype;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  select * into current_library
    from sledovatko_private.user_libraries where user_id = caller_id;
  if not found then
    return pg_catalog.jsonb_build_object('revision', 0, 'snapshot', null, 'updated_at', null);
  end if;
  return pg_catalog.jsonb_build_object(
    'revision', current_library.revision,
    'snapshot', current_library.snapshot,
    'updated_at', current_library.updated_at
  );
end;
$$;

create or replace function public.save_library(p_expected_revision bigint, p_snapshot jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  current_library sledovatko_private.user_libraries%rowtype;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_expected_revision is null or p_expected_revision < 0
    or p_expected_revision > 9007199254740991 then
    raise exception using errcode = '22023', message = 'Invalid expected revision';
  end if;
  if not sledovatko_private.valid_library_snapshot(p_snapshot) then
    raise exception using errcode = '22023', message = 'Invalid library snapshot (version, shape or 2 MiB limit)';
  end if;

  -- An empty placeholder provides a lockable row even on concurrent FIRST saves.
  -- ON CONFLICT waits for the other insert transaction; SELECT FOR UPDATE then
  -- sees its committed revision. Exactly one equal-revision save can succeed.
  insert into sledovatko_private.user_libraries (user_id)
    values (caller_id) on conflict (user_id) do nothing;
  select * into strict current_library
    from sledovatko_private.user_libraries where user_id = caller_id for update;

  if current_library.revision <> p_expected_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'conflict', true,
      'revision', current_library.revision,
      'snapshot', current_library.snapshot,
      'updated_at', current_library.updated_at
    );
  end if;
  if current_library.revision = 9007199254740991 then
    raise exception using errcode = '22003', message = 'Revision limit reached';
  end if;

  update sledovatko_private.user_libraries
    set snapshot = p_snapshot, revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where user_id = caller_id
    returning * into current_library;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'conflict', false,
    'revision', current_library.revision,
    'updated_at', current_library.updated_at
  );
end;
$$;

revoke all on function public.get_library() from public, anon, authenticated;
revoke all on function public.save_library(bigint, jsonb) from public, anon, authenticated;
grant usage on schema public to authenticated;
grant execute on function public.get_library() to authenticated;
grant execute on function public.save_library(bigint, jsonb) to authenticated;

comment on table sledovatko_private.user_libraries is
  'Private per-user Sledovatko snapshot. Keep sledovatko_private OUT of exposed Data API schemas.';
comment on function public.save_library(bigint, jsonb) is
  'Owner-only CAS. Conflict is a successful HTTP response with ok=false; client must not silently overwrite.';

commit;

notify pgrst, 'reload schema';
