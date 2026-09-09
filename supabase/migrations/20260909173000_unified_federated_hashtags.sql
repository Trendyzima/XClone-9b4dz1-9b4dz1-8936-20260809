begin;

-- Canonical hashtag identity is the existing native hashtags table. Native tags are
-- lowercase by contract, so federated ActivityPub tag names are normalized into the
-- same namespace before they are attached to federated objects.
create unique index if not exists hashtags_tag_lower_key on public.hashtags (lower(tag));

create table if not exists public.federated_object_hashtags (
  object_id uuid not null references public.federated_objects(id) on delete cascade,
  hashtag_id uuid not null references public.hashtags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (object_id, hashtag_id)
);

create index if not exists federated_object_hashtags_hashtag_idx
  on public.federated_object_hashtags (hashtag_id, object_id);

create index if not exists federated_object_hashtags_object_idx
  on public.federated_object_hashtags (object_id, hashtag_id);

-- Extract ActivityPub Hashtag tags from the stored JSON-LD/ActivityStreams tags
-- array. Supports the normal object form {type:Hashtag,name:#tag} and string tags.
create or replace function public.sync_federated_object_hashtags(p_object_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  obj jsonb;
  tag_value text;
  normalized text;
  hid uuid;
begin
  select tags into obj
  from public.federated_objects
  where id = p_object_id;

  if not found then
    return;
  end if;

  delete from public.federated_object_hashtags
  where object_id = p_object_id;

  if jsonb_typeof(coalesce(obj, '[]'::jsonb)) <> 'array' then
    return;
  end if;

  for tag_value in
    select nullif(trim(both ' ' from coalesce(x->>'name', x->>'tag', case when jsonb_typeof(x) = 'string' then trim(both '"' from x::text) else null end)), '')
    from jsonb_array_elements(obj) as t(x)
  loop
    normalized := lower(regexp_replace(tag_value, '^#+', ''));
    normalized := regexp_replace(normalized, '[^[:alnum:]_\-]', '', 'g');

    if normalized = '' or length(normalized) > 100 then
      continue;
    end if;

    insert into public.hashtags(tag, post_count, last_used_at)
    values (normalized, 0, now())
    on conflict (tag) do update
      set last_used_at = greatest(public.hashtags.last_used_at, excluded.last_used_at)
    returning id into hid;

    insert into public.federated_object_hashtags(object_id, hashtag_id)
    values (p_object_id, hid)
    on conflict do nothing;
  end loop;
end;
$$;

-- Keep the shared hashtag namespace synchronized whenever a federated object is
-- inserted or its ActivityPub tags change. This makes ingestion paths converge on
-- one invariant instead of requiring every federation transport implementation to
-- duplicate hashtag parsing logic.
create or replace function public.trg_sync_federated_object_hashtags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_federated_object_hashtags(new.id);
  return new;
end;
$$;

drop trigger if exists federated_objects_sync_hashtags on public.federated_objects;
create trigger federated_objects_sync_hashtags
after insert or update of tags on public.federated_objects
for each row execute function public.trg_sync_federated_object_hashtags();

-- Rebuild the association for objects already cached before this migration.
do $$
declare
  r record;
begin
  for r in select id from public.federated_objects where tags is not null loop
    perform public.sync_federated_object_hashtags(r.id);
  end loop;
end;
$$;

-- Unified hashtag lookup: native post_hashtags + federated_object_hashtags share
-- the same canonical hashtag row and therefore the same search identity/count.
create or replace function public.search_everything(
  p_query text,
  p_limit integer default 40,
  p_type text default 'all'
)
returns table(
  kind text,
  id text,
  score real,
  title text,
  subtitle text,
  content text,
  url text,
  source text,
  created_at timestamptz,
  actor_uri text
)
language sql
security definer
set search_path = public
as $$
with s as (
  select trim(regexp_replace(coalesce(p_query,''),'\\s+',' ','g')) q,
         least(greatest(coalesce(p_limit,40),1),80) lim,
         lower(coalesce(nullif(trim(p_type),''),'all')) filter
),
t as (
  select q,lim,filter,
         case when q='' then null else websearch_to_tsquery('simple',q) end query,
         lower(regexp_replace(q,'^#','')) hashtag_query
  from s
),
r as (
  select 'user'::text kind,p.id::text id,
    (coalesce(ts_rank_cd(to_tsvector('simple',coalesce(p.username,'')||' '||coalesce(p.display_name,'')||' '||coalesce(p.bio,'')),t.query),0)+case when lower(p.username)=lower(t.q) then 5 when lower(p.username) like lower(t.q)||'%' then 1 else 0 end)::real score,
    coalesce(nullif(p.display_name,''),p.username) title,'@'||p.username subtitle,coalesce(p.bio,'') content,null::text url,'testagram'::text source,p.created_at,null::text actor_uri
  from public.profiles p cross join t
  where t.q<>'' and (t.filter='all' or t.filter='users')
    and (to_tsvector('simple',coalesce(p.username,'')||' '||coalesce(p.display_name,'')||' '||coalesce(p.bio,'')) @@ t.query or lower(p.username) like lower(t.q)||'%')
  union all
  select 'post',p.id::text,coalesce(ts_rank_cd(to_tsvector('simple',coalesce(p.content,'')),t.query),0)::real,
    coalesce(nullif(pr.display_name,''),pr.username,'Testagram'),case when pr.username is null then null else '@'||pr.username end,p.content,null,'testagram',p.created_at,null
  from public.posts p cross join t left join public.profiles pr on pr.id=coalesce(p.author_id,p.user_id)
  where t.q<>'' and (t.filter='all' or t.filter='posts') and p.visibility='public'
    and to_tsvector('simple',coalesce(p.content,'')) @@ t.query
  union all
  select 'hashtag',h.id::text,
    (case when lower(h.tag)=t.hashtag_query then 5 else 1 end + least(coalesce(n.native_count,0)+coalesce(f.fed_count,0),1000)/100000.0)::real,
    '#'||h.tag,
    (coalesce(n.native_count,0)+coalesce(f.fed_count,0))::text||' posts',
    null,null,'unified',greatest(h.last_used_at,coalesce(f.last_fed_at,h.last_used_at)),null
  from public.hashtags h cross join t
  left join (select hashtag_id,count(*)::bigint native_count from public.post_hashtags group by hashtag_id) n on n.hashtag_id=h.id
  left join (select hashtag_id,count(*)::bigint fed_count,max(fo.published_at) last_fed_at from public.federated_object_hashtags foh join public.federated_objects fo on fo.id=foh.object_id where not fo.sensitive and fo.deleted_at is null group by hashtag_id) f on f.hashtag_id=h.id
  where t.q<>'' and (t.filter='all' or t.filter='hashtags') and h.tag like '%'||t.hashtag_query||'%'
  union all
  select 'community',c.id::text,coalesce(ts_rank_cd(to_tsvector('simple',coalesce(c.name,'')||' '||coalesce(c.slug,'')||' '||coalesce(c.description,'')),t.query),0)::real,c.name,c.slug,c.description,null,'testagram',c.created_at,null
  from public.communities c cross join t where t.q<>'' and (t.filter='all' or t.filter='communities') and not c.is_private and to_tsvector('simple',coalesce(c.name,'')||' '||coalesce(c.slug,'')||' '||coalesce(c.description,'')) @@ t.query
  union all
  select 'product',p.id::text,coalesce(ts_rank_cd(to_tsvector('simple',coalesce(p.name,'')||' '||coalesce(p.description,'')),t.query),0)::real,p.name,p.currency,p.description,p.external_url,'testagram',p.created_at,null
  from public.products p cross join t where t.q<>'' and (t.filter='all' or t.filter='products') and to_tsvector('simple',coalesce(p.name,'')||' '||coalesce(p.description,'')) @@ t.query
  union all
  select 'fediverse_user',a.id::text,(coalesce(ts_rank_cd(to_tsvector('simple',coalesce(a.preferred_username,'')||' '||coalesce(a.display_name,'')||' '||coalesce(a.summary,'')),t.query),0)+.25)::real,coalesce(nullif(a.display_name,''),a.preferred_username,'Fediverse user'),'@'||coalesce(a.preferred_username,'')||case when i.domain is null then '' else '@'||i.domain end,a.summary,a.uri,'fediverse',a.created_at,a.uri
  from public.federated_actors a cross join t left join public.federated_instances i on i.id=a.instance_id where t.q<>'' and (t.filter='all' or t.filter='fediverse_users' or t.filter='users') and a.discoverable and not a.suspended and to_tsvector('simple',coalesce(a.preferred_username,'')||' '||coalesce(a.display_name,'')||' '||coalesce(a.summary,'')) @@ t.query
  union all
  select 'fediverse_post',o.id::text,coalesce(ts_rank_cd(to_tsvector('simple',coalesce(o.content,'')||' '||coalesce(o.summary,'')),t.query),0)::real,coalesce(a.display_name,a.preferred_username,'Fediverse post'),coalesce(i.domain,'Fediverse'),o.content,coalesce(o.url,o.uri),'fediverse',coalesce(o.published_at,o.created_at),o.actor_uri
  from public.federated_objects o cross join t left join public.federated_actors a on a.uri=o.actor_uri left join public.federated_instances i on i.id=o.instance_id
  where t.q<>'' and (t.filter='all' or t.filter='fediverse_posts' or t.filter='posts') and not o.sensitive and o.deleted_at is null and to_tsvector('simple',coalesce(o.content,'')||' '||coalesce(o.summary,'')) @@ t.query
  union all
  select 'instance',i.id::text,(coalesce(ts_rank_cd(to_tsvector('simple',coalesce(i.domain,'')||' '||coalesce(i.software_name,'')),t.query),0)+.5)::real,i.domain,coalesce(i.software_name,'ActivityPub'),i.software_version,null,'fediverse',i.created_at,null
  from public.federated_instances i cross join t where t.q<>'' and (t.filter='all' or t.filter='instances') and i.status<>'blocked' and to_tsvector('simple',coalesce(i.domain,'')||' '||coalesce(i.software_name,'')) @@ t.query
)
select r.* from r where r.score>0 order by r.score desc,r.created_at desc nulls last limit (select lim from s);
$$;

-- Hashtag feed is deliberately unified at the database boundary so clicking a tag
-- never needs to know whether a post originated locally or from ActivityPub.
create or replace function public.get_unified_hashtag_feed(p_tag text, p_limit integer default 40)
returns table(
  kind text,
  id text,
  content text,
  url text,
  actor_uri text,
  created_at timestamptz,
  source text
)
language sql
security definer
set search_path = public
as $$
with q as (
  select lower(regexp_replace(trim(coalesce(p_tag,'')),'^#+','')) tag,
         least(greatest(coalesce(p_limit,40),1),80) lim
), native_posts as (
  select 'post'::text kind,p.id::text id,p.content,null::text url,null::text actor_uri,p.created_at,'testagram'::text source
  from public.post_hashtags ph join public.hashtags h on h.id=ph.hashtag_id join public.posts p on p.id=ph.post_id cross join q
  where h.tag=q.tag and p.visibility='public' and p.deleted_at is null
), fed_posts as (
  select 'fediverse_post'::text kind,fo.id::text id,fo.content,coalesce(fo.url,fo.uri) url,fo.actor_uri,coalesce(fo.published_at,fo.created_at),'fediverse'::text source
  from public.federated_object_hashtags foh join public.hashtags h on h.id=foh.hashtag_id join public.federated_objects fo on fo.id=foh.object_id cross join q
  where h.tag=q.tag and not fo.sensitive and fo.deleted_at is null
)
select * from native_posts union all select * from fed_posts
order by created_at desc nulls last limit (select lim from q);
$$;

revoke all on function public.sync_federated_object_hashtags(uuid) from public;
revoke all on function public.trg_sync_federated_object_hashtags() from public;
revoke all on function public.search_everything(text,integer) from public;
revoke all on function public.search_everything(text,integer,text) from public;
revoke all on function public.get_unified_hashtag_feed(text,integer) from public;
grant execute on function public.search_everything(text,integer) to authenticated;
grant execute on function public.search_everything(text,integer,text) to authenticated;
grant execute on function public.get_unified_hashtag_feed(text,integer) to authenticated;

commit;
