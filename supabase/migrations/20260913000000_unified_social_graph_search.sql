-- Unified social graph + hashtag + search foundation.
-- This migration is additive/compatibility-first because older Testagram builds
-- already contain partial follows/hashtag/search tables.

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

alter table public.follows add column if not exists status text not null default 'accepted';
alter table public.follows add column if not exists accepted_at timestamptz;
alter table public.follows drop constraint if exists follows_status_check;
alter table public.follows add constraint follows_status_check check (status in ('pending','accepted','rejected'));
create index if not exists follows_follower_status_idx on public.follows(follower_id, status, created_at desc);
create index if not exists follows_following_status_idx on public.follows(following_id, status, created_at desc);

create table if not exists public.hashtag_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  hashtag_id uuid not null references public.hashtags(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.hashtag_follows add column if not exists user_id uuid;
alter table public.hashtag_follows add column if not exists hashtag_id uuid;
alter table public.hashtag_follows add column if not exists created_at timestamptz not null default now();
create unique index if not exists hashtag_follows_user_tag_uidx on public.hashtag_follows(user_id, hashtag_id);
create index if not exists hashtag_follows_tag_idx on public.hashtag_follows(hashtag_id, created_at desc);

-- Compatibility columns used by existing discovery/search clients.
alter table public.hashtags add column if not exists usage_count bigint not null default 0;
alter table public.hashtags add column if not exists follower_count bigint not null default 0;
create index if not exists hashtags_tag_prefix_idx on public.hashtags(tag text_pattern_ops);
create index if not exists hashtags_usage_idx on public.hashtags(usage_count desc, last_used_at desc);

-- Keep hashtag aliases and counts coherent with the canonical post_hashtags graph.
create or replace function public.refresh_hashtag_counts(p_hashtag_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.hashtags h
  set post_count = coalesce((select count(*) from public.post_hashtags ph where ph.hashtag_id = h.id), 0),
      usage_count = coalesce((select count(*) from public.post_hashtags ph where ph.hashtag_id = h.id), 0),
      follower_count = coalesce((select count(*) from public.hashtag_follows hf where hf.hashtag_id = h.id), 0),
      last_used_at = coalesce((select max(ph.created_at) from public.post_hashtags ph where ph.hashtag_id = h.id), h.last_used_at)
  where h.id = p_hashtag_id;
end;
$$;

create or replace function public.sync_post_hashtags()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  source_text text;
  match_row text[];
  tag_value text;
  old_tag_ids uuid[] := array[]::uuid[];
  new_tag_id uuid;
begin
  if tg_op <> 'INSERT' then
    select coalesce(array_agg(hashtag_id), array[]::uuid[])
      into old_tag_ids
    from public.post_hashtags
    where post_id = old.id;
    delete from public.post_hashtags where post_id = old.id;
  end if;

  source_text := coalesce(to_jsonb(new)->>'body','') || ' ' || coalesce(to_jsonb(new)->>'content','');
  for match_row in select regexp_matches(source_text, '#([[:alnum:]_]{1,64})', 'g') loop
    tag_value := lower(match_row[1]);
    if tag_value is null or tag_value = '' then continue; end if;
    insert into public.hashtags(tag, last_used_at)
      values (tag_value, now())
      on conflict (tag) do update set last_used_at = excluded.last_used_at
      returning id into new_tag_id;
    insert into public.post_hashtags(post_id, hashtag_id, created_at)
      values (new.id, new_tag_id, now())
      on conflict do nothing;
  end loop;

  if tg_op <> 'INSERT' then
    update public.hashtags h
      set post_count = coalesce((select count(*) from public.post_hashtags ph where ph.hashtag_id=h.id),0),
          usage_count = coalesce((select count(*) from public.post_hashtags ph where ph.hashtag_id=h.id),0)
      where h.id = any(old_tag_ids);
  end if;

  update public.hashtags h
    set post_count = coalesce((select count(*) from public.post_hashtags ph where ph.hashtag_id=h.id),0),
        usage_count = coalesce((select count(*) from public.post_hashtags ph where ph.hashtag_id=h.id),0),
        last_used_at = coalesce((select max(ph.created_at) from public.post_hashtags ph where ph.hashtag_id=h.id), h.last_used_at)
    where h.id in (select hashtag_id from public.post_hashtags where post_id=new.id);

  return new;
end;
$$;

drop trigger if exists posts_sync_hashtags on public.posts;
create trigger posts_sync_hashtags
after insert or update of body, content or deleted_at on public.posts
for each row execute function public.sync_post_hashtags();

-- Backfill the canonical hashtag graph once, without duplicating existing links.
do $$
declare
  p record;
  match_row text[];
  tag_value text;
  hid uuid;
begin
  for p in select id, coalesce(to_jsonb(posts)->>'body','') || ' ' || coalesce(to_jsonb(posts)->>'content','') as source_text from public.posts loop
    for match_row in select regexp_matches(p.source_text, '#([[:alnum:]_]{1,64})', 'g') loop
      tag_value := lower(match_row[1]);
      insert into public.hashtags(tag, last_used_at) values(tag_value, now()) on conflict(tag) do nothing returning id into hid;
      if hid is null then select id into hid from public.hashtags where tag=tag_value; end if;
      insert into public.post_hashtags(post_id, hashtag_id) values(p.id, hid) on conflict do nothing;
    end loop;
  end loop;
  update public.hashtags h
  set post_count=coalesce((select count(*) from public.post_hashtags ph where ph.hashtag_id=h.id),0),
      usage_count=coalesce((select count(*) from public.post_hashtags ph where ph.hashtag_id=h.id),0),
      follower_count=coalesce((select count(*) from public.hashtag_follows hf where hf.hashtag_id=h.id),0);
end $$;

create or replace function public.set_follow_state(p_following_id uuid, p_follow boolean)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  me uuid := (select auth.uid());
  target_protected boolean := false;
  next_status text := 'accepted';
  row_out public.follows;
begin
  if me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_following_id is null or p_following_id = me then raise exception 'Invalid follow target' using errcode='22023'; end if;
  select coalesce(protected_account,false) into target_protected from public.profiles where id=p_following_id;
  if not found then raise exception 'Profile not found' using errcode='P0002'; end if;
  if p_follow then
    next_status := case when target_protected then 'pending' else 'accepted' end;
    insert into public.follows(follower_id, following_id, status, accepted_at)
      values(me,p_following_id,next_status,case when next_status='accepted' then now() else null end)
      on conflict(follower_id,following_id) do update
        set status=excluded.status,
            accepted_at=excluded.accepted_at;
  else
    delete from public.follows where follower_id=me and following_id=p_following_id;
  end if;
  select * into row_out from public.follows where follower_id=me and following_id=p_following_id;
  return jsonb_build_object(
    'following', coalesce(row_out.status='accepted',false),
    'requested', coalesce(row_out.status='pending',false),
    'status', coalesce(row_out.status,'none'),
    'follower_id', me,
    'following_id', p_following_id
  );
end;
$$;

create or replace function public.get_follow_state(p_following_id uuid)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'following', coalesce(f.status='accepted',false),
    'requested', coalesce(f.status='pending',false),
    'status', coalesce(f.status,'none'),
    'followed_by', exists(select 1 from public.follows r where r.follower_id=p_following_id and r.following_id=(select auth.uid()) and r.status='accepted')
  )
  from (select * from public.follows where follower_id=(select auth.uid()) and following_id=p_following_id) f
  right join (select 1) one on true
  limit 1;
$$;

-- Unified search returns a stable result envelope so the web client does not
-- need separate local/federated search implementations.
create or replace function public.search_everything(p_query text, p_limit integer default 40, p_type text default 'all')
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  q text := lower(trim(coalesce(p_query,'')));
  lim integer := least(greatest(coalesce(p_limit,40),1),80);
  result jsonb := '[]'::jsonb;
begin
  if q='' then return result; end if;

  if p_type in ('all','users') then
    result := result || coalesce((select jsonb_agg(jsonb_build_object('result_type','user','id,payload',p.id,payload)), '[]'::jsonb)
      from (select p.id, jsonb_build_object('result_type','user','id',p.id,'username',p.username,'display_name',p.display_name,'bio',p.bio,'avatar_url',p.avatar_url,'verified',coalesce(p.verified,false),'followers_count',coalesce(p.follower_count,0),'source','native','url','/profile/'||p.username) payload from public.profiles p where lower(coalesce(p.username,'')) like '%'||q||'%' or lower(coalesce(p.display_name,'')) like '%'||q||'%' or lower(coalesce(p.bio,'')) like '%'||q||'%' order by case when lower(p.username)=q then 0 when lower(p.username) like q||'%' then 1 else 2 end, coalesce(p.follower_count,0) desc limit lim) p), '[]'::jsonb);
  end if;

  if p_type in ('all','hashtags') then
    result := result || coalesce((select jsonb_agg(jsonb_build_object('result_type','hashtag','id',h.id,'tag',h.tag,'usage_count',coalesce(h.usage_count,h.post_count,0),'follower_count',coalesce(h.follower_count,0),'source','native','url','/hashtag/'||h.tag)) from public.hashtags h where lower(h.tag) like '%'||replace(q,'#','')||'%' order by coalesce(h.usage_count,h.post_count,0) desc limit lim), '[]'::jsonb);
  end if;

  if p_type in ('all','posts') then
    result := result || coalesce((select jsonb_agg(jsonb_build_object('result_type','post','id',p.id,'content',coalesce(p.content,p.body,''),'created_at',p.created_at,'author_id',p.author_id,'source','native','url','/post/'||p.id)) from public.posts p where lower(coalesce(p.content,p.body,'')) like '%'||q||'%' and coalesce(to_jsonb(p)->>'deleted_at','')='' order by p.created_at desc limit lim), '[]'::jsonb);
  end if;

  if p_type in ('all','communities') then
    result := result || coalesce((select jsonb_agg(jsonb_build_object('result_type','community','id',c.id,'name',c.name,'display_name',coalesce(to_jsonb(c)->>'display_name',c.name),'description',c.description,'member_count',c.member_count,'source','native','url','/c/'||c.name)) from public.communities c where lower(c.name) like '%'||q||'%' or lower(coalesce(c.description,'')) like '%'||q||'%' order by c.member_count desc limit lim), '[]'::jsonb);
  end if;

  if p_type in ('all','products') then
    result := result || coalesce((select jsonb_agg(jsonb_build_object('result_type','product','id',p.id,'name',p.name,'description',p.description,'image_url',p.image_url,'price_cents',p.price_cents,'source','native')) from public.products p where lower(p.name) like '%'||q||'%' or lower(coalesce(p.description,'')) like '%'||q||'%' order by p.created_at desc limit lim), '[]'::jsonb);
  end if;

  if p_type in ('all','fediverse_users') then
    result := result || coalesce((select jsonb_agg(jsonb_build_object('result_type','fediverse_user','id',a.id,'actor_url',coalesce(a.actor_url,a.uri),'username',coalesce(a.username,a.raw_actor->>'preferredUsername'),'display_name',coalesce(a.raw_actor->>'name',a.username),'domain',split_part(replace(coalesce(a.actor_url,a.uri), 'https://',''), '/', 1),'avatar_url',a.raw_actor->'icon'->>'url','source','fediverse')) from public.federated_actors a where lower(coalesce(a.username,'')) like '%'||replace(q,'@','')||'%' or lower(coalesce(a.actor_url,a.uri,'')) like '%'||q||'%' or lower(coalesce(a.raw_actor->>'name','')) like '%'||q||'%' limit lim), '[]'::jsonb);
  end if;

  if p_type in ('all','fediverse_posts') then
    result := result || coalesce((select jsonb_agg(jsonb_build_object('result_type','fediverse_post','id',o.id,'uri',o.uri,'url',coalesce(o.url,o.uri),'content',coalesce(o.content,''),'published_at',o.published_at,'actor_uri',o.actor_uri,'source','fediverse')) from public.federated_objects o where o.object_type='Note' and o.deleted_at is null and lower(coalesce(o.content,'')) like '%'||q||'%' order by o.published_at desc limit lim), '[]'::jsonb);
  end if;

  return result;
end;
$$;

create or replace function public.get_unified_hashtag_feed(p_tag text, p_limit integer default 40)
returns jsonb
language sql
security invoker
set search_path = public
as $$
with local_posts as (
  select jsonb_build_object('result_type','post','id',p.id,'content',coalesce(p.content,p.body,''),'created_at',p.created_at,'author_id',p.author_id,'source','native','url','/post/'||p.id) item, p.created_at sort_at
  from public.posts p
  join public.post_hashtags ph on ph.post_id=p.id
  join public.hashtags h on h.id=ph.hashtag_id
  where h.tag=lower(regexp_replace(trim(p_tag),'^#','')) and coalesce(to_jsonb(p)->>'deleted_at','')=''
), remote_posts as (
  select jsonb_build_object('result_type','fediverse_post','id',o.id,'uri',o.uri,'url',coalesce(o.url,o.uri),'content',coalesce(o.content,''),'published_at',o.published_at,'actor_uri',o.actor_uri,'source','fediverse','_is_federated',true) item, o.published_at sort_at
  from public.federated_objects o
  where o.object_type='Note' and o.deleted_at is null
    and exists(select 1 from jsonb_array_elements(coalesce(o.tags,'[]'::jsonb)) t where lower(trim(both '#' from coalesce(t->>'name',t#>>'{}'))) = lower(regexp_replace(trim(p_tag),'^#','')))
)
select coalesce(jsonb_agg(item order by sort_at desc), '[]'::jsonb)
from (select item,sort_at from local_posts union all select item,sort_at from remote_posts order by sort_at desc limit least(greatest(coalesce(p_limit,40),1),80)) x;
$$;

-- Harden exposed objects. Existing policies are left intact where present.
alter table public.follows enable row level security;
alter table public.hashtag_follows enable row level security;

drop policy if exists follows_select_own on public.follows;
create policy follows_select_own on public.follows for select to authenticated using ((select auth.uid())=follower_id or (select auth.uid())=following_id);
drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows for insert to authenticated with check ((select auth.uid())=follower_id and follower_id<>following_id);
drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own on public.follows for delete to authenticated using ((select auth.uid())=follower_id);

drop policy if exists hashtag_follows_select_own on public.hashtag_follows;
create policy hashtag_follows_select_own on public.hashtag_follows for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists hashtag_follows_insert_own on public.hashtag_follows;
create policy hashtag_follows_insert_own on public.hashtag_follows for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists hashtag_follows_delete_own on public.hashtag_follows;
create policy hashtag_follows_delete_own on public.hashtag_follows for delete to authenticated using ((select auth.uid())=user_id);

grant execute on function public.set_follow_state(uuid,boolean) to authenticated;
grant execute on function public.get_follow_state(uuid) to authenticated;
grant execute on function public.search_everything(text,integer,text) to authenticated;
grant execute on function public.get_unified_hashtag_feed(text,integer) to authenticated;
