-- Run ONLY in a local or disposable Supabase test database, after setup.sql.
-- No email is sent: the fixtures are SQL rows and this transaction is rolled back.
-- psql -v ON_ERROR_STOP=1 -f backend/tests/library.sql "$TEST_DATABASE_URL"
begin;

insert into auth.users (id, email) values
  ('f6157b0a-0000-4000-8000-000000000001', 'sledovatko-test-a@example.invalid'),
  ('f6157b0a-0000-4000-8000-000000000002', 'sledovatko-test-b@example.invalid');

do $$ begin
  assert not has_function_privilege('anon', 'public.get_library()', 'execute'), 'anon read is granted';
  assert not has_function_privilege('anon', 'public.save_library(bigint,jsonb)', 'execute'), 'anon write is granted';
  assert not has_schema_privilege('anon', 'sledovatko_private', 'usage'), 'anon schema is granted';
  assert not has_table_privilege('authenticated', 'sledovatko_private.user_libraries', 'delete'), 'delete resets revision';
  assert not exists (
    select 1 from pg_proc where oid in ('public.get_library()'::regprocedure, 'public.save_library(bigint,jsonb)'::regprocedure)
      and prosecdef
  ), 'RPC must be SECURITY INVOKER';
  raise notice 'PASS 1: anonymous denied; no elevated RPC or direct deletion';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f6157b0a-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'f6157b0a-0000-4000-8000-000000000001', true);

do $$ declare result jsonb; begin
  result := public.get_library();
  assert result = '{"revision":0,"snapshot":null,"updated_at":null}'::jsonb, 'new account should be empty';
  result := public.save_library(0, '{"_v":2,"wm_favorites":[],"wm_comments":{"123":"account A"}}');
  assert result ->> 'ok' = 'true' and result ->> 'revision' = '1', 'first write failed';
  assert (public.get_library() -> 'snapshot' -> 'wm_comments' ->> '123') = 'account A', 'readback failed';
  raise notice 'PASS 2: new account, initial save, readback';

  result := public.save_library(0, '{"_v":2,"wm_favorites":[],"wm_comments":{"123":"stale"}}');
  assert result ->> 'conflict' = 'true' and result ->> 'revision' = '1', 'stale write must conflict';
  assert result -> 'snapshot' -> 'wm_comments' ->> '123' = 'account A', 'conflict must return latest snapshot';
  assert (public.get_library() -> 'snapshot' -> 'wm_comments' ->> '123') = 'account A', 'stale write changed row';
  raise notice 'PASS 3: stale device cannot overwrite current data';

  begin
    perform public.save_library(1, '{"_v":2,"wm_favorites":[],"sb_session":"secret"}');
    raise exception 'unexpected secret key accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_library(1, '{"_v":2,"wm_favorites":"[]"}');
    raise exception 'JSON encoded field accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_library(1, '{"_v":1,"wm_favorites":[]}');
    raise exception 'old snapshot version accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_library(-1, '{"_v":2,"wm_favorites":[]}');
    raise exception 'negative revision accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_library(null, '{"_v":2,"wm_favorites":[]}');
    raise exception 'null revision accepted';
  exception when invalid_parameter_value then null; end;
  raise notice 'PASS 4: whitelist, native shapes, version, revision validation';

  begin
    perform public.save_library(1, jsonb_build_object('_v', 2, 'wm_favorites', '[]'::jsonb,
      'wm_comments', jsonb_build_object('123', repeat('x', 2097153))));
    raise exception 'oversized snapshot accepted';
  exception when invalid_parameter_value then null; end;
  assert public.get_library() ->> 'revision' = '1', 'invalid writes changed revision';
  raise notice 'PASS 5: 2 MiB bound and rejected writes preserve current row';

  result := public.save_library(1, '{"_v":2,"wm_favorites":[{"id":123,"title":"Film","mediaType":"movie","imdbId":"123"},{"id":123,"title":"Serial","mediaType":"tv","imdbId":"tv:123"}]}');
  assert result ->> 'ok' = 'true' and result ->> 'revision' = '2', 'namespaced media rejected';
  begin
    perform public.save_library(2, '{"_v":2,"wm_favorites":[{"id":123,"title":"Serial","mediaType":"tv","imdbId":"123"}]}');
    raise exception 'colliding identity accepted';
  exception when invalid_parameter_value then null; end;
  raise notice 'PASS 6: movie/TV identity stays separate';
end $$;

select set_config('request.jwt.claims', '{"sub":"f6157b0a-0000-4000-8000-000000000002","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'f6157b0a-0000-4000-8000-000000000002', true);

do $$ declare touched integer; result jsonb; begin
  assert public.get_library() ->> 'revision' = '0', 'account B saw account A library';
  assert not exists (select 1 from sledovatko_private.user_libraries), 'RLS exposed account A row';
  update sledovatko_private.user_libraries set snapshot = '{"_v":2,"wm_favorites":[]}'
    where user_id = 'f6157b0a-0000-4000-8000-000000000001';
  get diagnostics touched = row_count;
  assert touched = 0, 'RLS allowed a cross-account update';
  begin
    insert into sledovatko_private.user_libraries(user_id) values ('f6157b0a-0000-4000-8000-000000000001');
    raise exception 'cross-account insert accepted';
  exception when insufficient_privilege then null; end;
  result := public.save_library(0, '{"_v":2,"wm_favorites":[],"wm_comments":{"123":"account B"}}');
  assert result ->> 'ok' = 'true', 'account B own save failed';
  begin
    update sledovatko_private.user_libraries
      set user_id = 'f6157b0a-0000-4000-8000-000000000001'
      where user_id = 'f6157b0a-0000-4000-8000-000000000002';
    raise exception 'owner reassignment accepted';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS 7: RLS denies cross-account read, insert, update and owner reassignment';
end $$;

select set_config('request.jwt.claims', '{"sub":"f6157b0a-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'f6157b0a-0000-4000-8000-000000000001', true);

do $$ declare result jsonb; begin
  assert jsonb_array_length(public.get_library() -> 'snapshot' -> 'wm_favorites') = 2, 'account B affected account A';
  result := public.save_library(2, '{"_v":2,"wm_favorites":[]}');
  assert result ->> 'ok' = 'true' and result ->> 'revision' = '3', 'clear must advance revision';
  result := public.save_library(2, '{"_v":2,"wm_favorites":[],"wm_comments":{"123":"resurrected"}}');
  assert result ->> 'conflict' = 'true' and result ->> 'revision' = '3', 'old device resurrected data after clear';
  raise notice 'PASS 8: clear retains monotonic revision and rejects old data';
end $$;

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    perform public.get_library();
    raise exception 'missing user read accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_library(0, '{"_v":2,"wm_favorites":[]}');
    raise exception 'missing user write accepted';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS 9: authenticated role still requires a user identity';
end $$;

reset role;
delete from auth.users where id = 'f6157b0a-0000-4000-8000-000000000001';
do $$ begin
  assert not exists(select 1 from sledovatko_private.user_libraries where user_id = 'f6157b0a-0000-4000-8000-000000000001'), 'account deletion left snapshot';
  assert exists(select 1 from sledovatko_private.user_libraries where user_id = 'f6157b0a-0000-4000-8000-000000000002'), 'account deletion removed another user snapshot';
  raise notice 'PASS 10: user deletion cascades only to the deleted library';
end $$;

rollback;
