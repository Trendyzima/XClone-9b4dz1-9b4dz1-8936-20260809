-- XClone compatibility layer for the shared Testagram Supabase project.
-- Core social data stays in the native platform tables (profiles, posts,
-- follows, notifications, messages, reels, etc.). These objects cover the
-- legacy XClone live-stream UI without introducing a second backend.

create or replace view public.user_profiles
with (security_invoker = true)
as
select
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.cover_url,
  p.bio,
  (p.verified_tier <> 'none') as verified,
  p.verified_tier,
  p.follower_count,
  p.following_count,
  p.website,
  p.location,
  p.created_at,
  p.updated_at
from public.profiles p;

grant select on public.user_profiles to anon, authenticated;

create table if not exists public.live_streams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  thumbnail_url text,
  stream_url text,
  is_live boolean not null default false,
  viewer_count bigint not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists live_streams_user_id_idx on public.live_streams(user_id);
create index if not exists live_streams_live_idx on public.live_streams(is_live, created_at desc);

create table if not exists public.stream_viewers (
  stream_id uuid not null references public.live_streams(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (stream_id, user_id)
);
create index if not exists stream_viewers_stream_idx on public.stream_viewers(stream_id);

create table if not exists public.stream_chat (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.live_streams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists stream_chat_stream_created_idx on public.stream_chat(stream_id, created_at);

alter table public.live_streams enable row level security;
alter table public.stream_viewers enable row level security;
alter table public.stream_chat enable row level security;

drop policy if exists live_streams_public_read on public.live_streams;
create policy live_streams_public_read on public.live_streams
  for select using (true);

drop policy if exists live_streams_owner_insert on public.live_streams;
create policy live_streams_owner_insert on public.live_streams
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists live_streams_owner_update on public.live_streams;
create policy live_streams_owner_update on public.live_streams
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists stream_viewers_public_read on public.stream_viewers;
create policy stream_viewers_public_read on public.stream_viewers
  for select using (true);

drop policy if exists stream_viewers_self_insert on public.stream_viewers;
create policy stream_viewers_self_insert on public.stream_viewers
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists stream_viewers_self_delete on public.stream_viewers;
create policy stream_viewers_self_delete on public.stream_viewers
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists stream_chat_public_read on public.stream_chat;
create policy stream_chat_public_read on public.stream_chat
  for select using (true);

drop policy if exists stream_chat_self_insert on public.stream_chat;
create policy stream_chat_self_insert on public.stream_chat
  for insert to authenticated
  with check (auth.uid() = user_id);

grant select on public.live_streams, public.stream_viewers, public.stream_chat to anon, authenticated;
grant insert, update on public.live_streams to authenticated;
grant insert, delete on public.stream_viewers to authenticated;
grant insert on public.stream_chat to authenticated;

create or replace function public.get_stream_chat_analytics(p_stream_id uuid)
returns table(
  message_count bigint,
  unique_users bigint,
  first_message_at timestamptz,
  last_message_at timestamptz
)
language sql
security invoker
as $$
  select
    count(*)::bigint,
    count(distinct user_id)::bigint,
    min(created_at),
    max(created_at)
  from public.stream_chat
  where stream_id = p_stream_id
    and message not like '[REACT:%]';
$$;

grant execute on function public.get_stream_chat_analytics(uuid) to anon, authenticated;
