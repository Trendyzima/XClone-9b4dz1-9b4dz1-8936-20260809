-- Unified social graph, hashtag following, hashtag indexing and search.
-- Additive/compatibility-first: existing Testagram tables are upgraded in place.

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'accepted',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
alter table public.follows add column if not exists status text not null default 'accepted';
alter table public.follows add column if not exists accepted_at timestamptz;
alter table public.follows drop constraint if exists follows_status_check;
alter table public.follows add constraint follows_status_check check (status in ('pending','accepted','rejected'));
create index if not exists follows_follower_status_idx on public.follows(follower_id,status,created_at desc);
create index if not exists follows_following_status_idx on public.follows(following_id,status,created_at desc);

create table if not exists public.hashtag_follows (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, hashtag_id uuid not null references public.hashtags(id) on delete cascade, created_at timestamptz not null default now()
);
alter table public.hashtag_follows add column if not exists id uuid default gen_random_uuid();
alter table public.hashtag_follows add column if not exists user_id uuid;
alter table public.hashtag_follows add column if not exists hashtag_id uuid;
alter table public.hashtag_follows add column if not exists created_at timestamptz not null default now();
create unique index if not exists hashtag_follows_user_tag_uidx on public.hashtag_follows(user_id,hashtag_id);
create index if not exists hashtag_follows_tag_idx on public.hashtag_follows(hashtag_id,created_at desc);

alter table public.hashtags add column if not exists usage_count bigint not null default 0;
alter table public.hashtags add column if not exists follower_count bigint not null default 0;
create index if not exists hashtags_tag_prefix_idx on public.hashtags(tag text_pattern_ops);
create index if not exists hashtags_usage_idx on public.hashtags(usage_count desc,last_used_at desc);

create or replace function public.sync_post_hashtags() returns trigger language plpgsql security invoker set search_path=public as $$
declare source_text text; m text[]; tag_value text; hid uuid;
begin
 if tg_op <> 'INSERT' then delete from public.post_hashtags where post_id=old.id; end if;
 source_text:=coalesce(to_jsonb(new)->>'body','')||' '||coalesce(to_jsonb(new)->>'content','');
 for m in select regexp_matches(source_text,'#([[:alnum:]_]{1,64})','g') loop
  tag_value:=lower(m[1]); if tag_value='' then continue; end if;
  insert into public.hashtags(tag,last_used_at) values(tag_value,now()) on conflict(tag) do update set last_used_at=excluded.last_used_at returning id into hid;
  if hid is null then select id into hid from public.hashtags where tag=tag_value; end if;
  insert into public.post_hashtags(post_id,hashtag_id,created_at) values(new.id,hid,now()) on conflict do nothing;
 end loop;
 update public.hashtags h set post_count=coalesce((select count(*) from public.post_hashtags ph where ph.hashtag_id=h.id),0),usage_count=coalesce((select count(*) from public.post_hashtags ph where ph.hashtag_id=h.id),0),follower_count=coalesce((select count(*) from public.hashtag_follows hf where hf.hashtag_id=h.id),0),last_used_at=coalesce((select max(ph.created_at) from public.post_hashtags ph where ph.hashtag_id=h.id),h.last_used_at) where h.id in (select hashtag_id from public.post_hashtags where post_id=new.id) or (tg_op<>'INSERT' and h.id in (select hashtag_id from public.post_hashtags ph where ph.post_id=old.id));
 return new;
end; $$;
drop trigger if exists posts_sync_hashtags on public.posts;
create trigger posts_sync_hashtags after insert or update on public.posts for each row execute function public.sync_post_hashtags();

do $$
declare p record; m text[]; tag_value text; hid uuid;
begin
 for p in select id,coalesce(to_jsonb(posts)->>'body','')||' '||coalesce(to_jsonb(posts)->>'content','') source_text from public.posts loop
  for m in select regexp_matches(p.source_text,'#([[:alnum:]_]{1,64})','g') loop
   tag_value:=lower(m[1]); insert into public.hashtags(tag,last_used_at) values(tag_value,now()) on conflict(tag) do nothing returning id into hid;
   if hid is null then select id into hid from public.hashtags where tag=tag_value; end if;
   insert into public.post_hashtags(post_id,hashtag_id) values(p.id,hid) on conflict do nothing;
  end loop;
 end loop;
 update public.hashtags h set post_count=coalesce((select count(*) from public.post_hashtags ph where ph.hashtag_id=h.id),0),usage_count=coalesce((select count(*) from public.post_hashtags ph where ph.hashtag_id=h.id),0),follower_count=coalesce((select count(*) from public.hashtag_follows hf where hf.hashtag_id=h.id),0);
end $$;

create or replace function public.set_follow_state(p_following_id uuid,p_follow boolean) returns jsonb language plpgsql security invoker set search_path=public as $$
declare me uuid:=(select auth.uid()); protected boolean:=false; s text; begin
 if me is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_following_id is null or p_following_id=me then raise exception 'Invalid follow target' using errcode='22023'; end if;
 select coalesce(protected_account,false) into protected from public.profiles where id=p_following_id;
 if not found then raise exception 'Profile not found' using errcode='P0002'; end if;
 if p_follow then s:=case when protected then 'pending' else 'accepted' end; insert into public.follows(follower_id,following_id,status,accepted_at) values(me,p_following_id,s,case when s='accepted' then now() else null end) on conflict(follower_id,following_id) do update set status=excluded.status,accepted_at=excluded.accepted_at;
 else delete from public.follows where follower_id=me and following_id=p_following_id; end if;
 select status into s from public.follows where follower_id=me and following_id=p_following_id;
 return jsonb_build_object('following',s='accepted','requested',s='pending','status',coalesce(s,'none'),'following_id',p_following_id);
end $$;

create or replace function public.get_follow_state(p_following_id uuid) returns jsonb language sql security invoker set search_path=public as $$
select jsonb_build_object('following',coalesce((select f.status='accepted' from public.follows f where f.follower_id=(select auth.uid()) and f.following_id=p_following_id),false),'requested',coalesce((select f.status='pending' from public.follows f where f.follower_id=(select auth.uid()) and f.following_id=p_following_id),false),'followed_by',coalesce((select f.status='accepted' from public.follows f where f.follower_id=p_following_id and f.following_id=(select auth.uid())),false),'status',coalesce((select f.status from public.follows f where f.follower_id=(select auth.uid()) and f.following_id=p_following_id),'none')); $$;

-- Existing production RPC has a different return type. PostgreSQL 42P13 forbids changing it with CREATE OR REPLACE, so replace the exact signature.
drop function if exists public.search_everything(text,integer,text);
create function public.search_everything(p_query text,p_limit integer default 40,p_type text default 'all') returns jsonb language plpgsql security invoker set search_path=public as $$
declare q text:=lower(trim(coalesce(p_query,''))); lim integer:=least(greatest(coalesce(p_limit,40),1),80); r jsonb:='[]'::jsonb; x jsonb; begin
 if q='' then return r; end if;
 if p_type in ('all','users') then select coalesce(jsonb_agg(jsonb_build_object('result_type','user','id',p.id,'username',p.username,'display_name',p.display_name,'bio',p.bio,'avatar_url',p.avatar_url,'verified',coalesce(p.verified,false),'followers_count',coalesce(p.follower_count,0),'source','native','url','/profile/'||p.username)),'[]'::jsonb) into x from (select * from public.profiles where lower(coalesce(username,'')) like '%'||q||'%' or lower(coalesce(display_name,'')) like '%'||q||'%' or lower(coalesce(bio,'')) like '%'||q||'%' order by case when lower(username)=q then 0 when lower(username) like q||'%' then 1 else 2 end,coalesce(follower_count,0) desc limit lim) p; r:=r||x; end if;
 if p_type in ('all','hashtags') then select coalesce(jsonb_agg(jsonb_build_object('result_type','hashtag','id',h.id,'tag',h.tag,'usage_count',coalesce(h.usage_count,h.post_count,0),'follower_count',coalesce(h.follower_count,0),'source','native','url','/hashtag/'||h.tag)),'[]'::jsonb) into x from (select * from public.hashtags where lower(tag) like '%'||replace(q,'#','')||'%' order by coalesce(usage_count,post_count,0) desc limit lim) h; r:=r||x; end if;
 if p_type in ('all','posts') then select coalesce(jsonb_agg(jsonb_build_object('result_type','post','id',p.id,'content',coalesce(p.content,p.body,''),'created_at',p.created_at,'author_id',p.author_id,'source','native','url','/post/'||p.id)),'[]'::jsonb) into x from (select * from public.posts where lower(coalesce(content,body,'')) like '%'||q||'%' order by created_at desc limit lim) p; r:=r||x; end if;
 if p_type in ('all','communities') then select coalesce(jsonb_agg(jsonb_build_object('result_type','community','id',c.id,'name',c.name,'display_name',coalesce(to_jsonb(c)->>'display_name',c.name),'description',c.description,'member_count',c.member_count,'source','native','url','/c/'||c.name)),'[]'::jsonb) into x from (select * from public.communities where lower(name) like '%'||q||'%' or lower(coalesce(description,'')) like '%'||q||'%' order by member_count desc limit lim) c; r:=r||x; end if;
 if p_type in ('all','products') then select coalesce(jsonb_agg(jsonb_build_object('result_type','product','id',p.id,'name',p.name,'description',p.description,'image_url',p.image_url,'price_cents',p.price_cents,'source','native')),'[]'::jsonb) into x from (select * from public.products where lower(name) like '%'||q||'%' or lower(coalesce(description,'')) like '%'||q||'%' order by created_at desc limit lim) p; r:=r||x; end if;
 if p_type in ('all','fediverse_users') then select coalesce(jsonb_agg(jsonb_build_object('result_type','fediverse_user','id',a.id,'actor_url',coalesce(a.actor_url,a.uri),'username',coalesce(a.username,a.raw_actor->>'preferredUsername'),'display_name',coalesce(a.raw_actor->>'name',a.username),'domain',split_part(replace(coalesce(a.actor_url,a.uri),'https://',''), '/', 1),'avatar_url',a.raw_actor->'icon'->>'url','source','fediverse')),'[]'::jsonb) into x from (select * from public.federated_actors where lower(coalesce(username,'')) like '%'||replace(q,'@','')||'%' or lower(coalesce(actor_url,uri,'')) like '%'||q||'%' or lower(coalesce(raw_actor->>'name','')) like '%'||q||'%' limit lim) a; r:=r||x; end if;
 if p_type in ('all','fediverse_posts') then select coalesce(jsonb_agg(jsonb_build_object('result_type','fediverse_post','id',o.id,'uri',o.uri,'url',coalesce(o.url,o.uri),'content',coalesce(o.content,''),'published_at',o.published_at,'actor_uri',o.actor_uri,'source','fediverse','_is_federated',true)),'[]'::jsonb) into x from (select * from public.federated_objects where object_type='Note' and deleted_at is null and lower(coalesce(content,'')) like '%'||q||'%' order by published_at desc limit lim) o; r:=r||x; end if;
 return r; end $$;

create or replace function public.get_unified_hashtag_feed(p_tag text,p_limit integer default 40) returns jsonb language sql security invoker set search_path=public as $$
with lp as (select jsonb_build_object('result_type','post','id',p.id,'content',coalesce(p.content,p.body,''),'created_at',p.created_at,'author_id',p.author_id,'source','native','url','/post/'||p.id) item,p.created_at sort_at from public.posts p join public.post_hashtags ph on ph.post_id=p.id join public.hashtags h on h.id=ph.hashtag_id where h.tag=lower(regexp_replace(trim(p_tag),'^#',''))), rp as (select jsonb_build_object('result_type','fediverse_post','id',o.id,'uri',o.uri,'url',coalesce(o.url,o.uri),'content',coalesce(o.content,''),'published_at',o.published_at,'actor_uri',o.actor_uri,'source','fediverse','_is_federated',true) item,o.published_at sort_at from public.federated_objects o where o.object_type='Note' and o.deleted_at is null and exists(select 1 from jsonb_array_elements(coalesce(o.tags,'[]'::jsonb)) t where lower(trim(both '#' from coalesce(t->>'name',''))) = lower(regexp_replace(trim(p_tag),'^#','')))) select coalesce(jsonb_agg(item order by sort_at desc),'[]'::jsonb) from (select item,sort_at from lp union all select item,sort_at from rp order by sort_at desc limit least(greatest(coalesce(p_limit,40),1),80)) z; $$;

alter table public.follows enable row level security;
alter table public.hashtag_follows enable row level security;
drop policy if exists follows_select_own on public.follows; create policy follows_select_own on public.follows for select to authenticated using ((select auth.uid())=follower_id or (select auth.uid())=following_id);
drop policy if exists follows_insert_own on public.follows; create policy follows_insert_own on public.follows for insert to authenticated with check ((select auth.uid())=follower_id and follower_id<>following_id);
drop policy if exists follows_delete_own on public.follows; create policy follows_delete_own on public.follows for delete to authenticated using ((select auth.uid())=follower_id);
drop policy if exists hashtag_follows_select_own on public.hashtag_follows; create policy hashtag_follows_select_own on public.hashtag_follows for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists hashtag_follows_insert_own on public.hashtag_follows; create policy hashtag_follows_insert_own on public.hashtag_follows for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists hashtag_follows_delete_own on public.hashtag_follows; create policy hashtag_follows_delete_own on public.hashtag_follows for delete to authenticated using ((select auth.uid())=user_id);

grant execute on function public.set_follow_state(uuid,boolean) to authenticated;
grant execute on function public.get_follow_state(uuid) to authenticated;
grant execute on function public.search_everything(text,integer,text) to authenticated;
grant execute on function public.get_unified_hashtag_feed(text,integer) to authenticated;
