-- ═══════════════════════════════════════════════════════════════════════════
-- 0017 — a message that arrives
--
-- Chat has been real-looking and local since it was built: `useChat` is a
-- zustand store persisted to this browser's localStorage behind
-- `createMockChatProvider()`, whose `send()` schedules a fabricated reply from
-- a random member of the room. Since 0015 a person can have a real connection
-- to a real account, which made that worse rather than better — the same lie
-- with somebody's real name on it.
--
-- The seam it drops into already exists. `src/lib/chat/types.ts` defines
-- `ChatProvider` with four methods "shaped like a websocket client … so a real
-- server drops in without a component change". This is the other side of it.
--
-- THREE THINGS THAT DECIDED THE SHAPE:
--
-- 1. Channel and message ids are TEXT, not uuid. They are minted in the
--    browser by `uid()` — a ten-character nanoid — before any account exists,
--    exactly as `public.projects` ids are, and for the same reason: a message
--    typed offline has an id the moment it is typed, and rewriting it on the
--    way up would break the optimistic row the sender is already looking at.
--
-- 2. Membership is asked through a `security definer` function. A policy on
--    `channels` that reads `channel_members`, and a policy on
--    `channel_members` that reads `channels`, is infinite recursion — Postgres
--    says so at query time, not at create time. `public.is_member` in
--    schema.sql exists for the same reason and this follows it.
--
-- 3. A team channel has no membership rows. Its members are the workspace's
--    members, and duplicating that into a second table is two sources of truth
--    that drift the first time somebody leaves a team. So `in_channel` answers
--    yes for either a row of your own OR a non-private channel in a workspace
--    you belong to.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.channels (
  id           text primary key,
  kind         text not null default 'channel'
               check (kind in ('channel', 'dm', 'ai')),
  scope        text not null default 'personal'
               check (scope in ('personal', 'team')),
  -- Null for a personal channel or a direct message: those belong to the
  -- people in them, not to a workspace.
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name         text not null default '',
  topic        text,
  description  text,
  created_by   uuid not null default auth.uid()
               references public.profiles(id) on delete cascade,
  is_private   boolean not null default false,
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- A team channel needs a workspace; a personal one must not have one.
  constraint channels_scope_has_a_home check (
    (scope = 'team' and workspace_id is not null)
    or (scope = 'personal' and workspace_id is null)
  )
);

create index if not exists channels_workspace_idx on public.channels(workspace_id);

create table if not exists public.channel_members (
  channel_id text not null references public.channels(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index if not exists channel_members_user_idx on public.channel_members(user_id);

create table if not exists public.messages (
  id          text primary key,
  channel_id  text not null references public.channels(id) on delete cascade,
  author_id   uuid not null default auth.uid()
              references public.profiles(id) on delete cascade,
  body        text not null default '',
  -- The thread this reply belongs to. `on delete set null` rather than
  -- cascade: deleting a parent must not silently take a conversation with it.
  parent_id   text references public.messages(id) on delete set null,
  attachments jsonb,
  -- emoji → array of user ids. Written only by `public.toggle_reaction`,
  -- because a reaction is the one write somebody makes to a row that is not
  -- theirs, and granting update on the table to do it would let them rewrite
  -- the body as well.
  reactions   jsonb not null default '{}'::jsonb
              check (jsonb_typeof(reactions) = 'object'),
  at          timestamptz not null default now(),
  edited_at   timestamptz
);

create index if not exists messages_channel_idx on public.messages(channel_id, at);

-- ── Who is in a channel ────────────────────────────────────────────────────

create or replace function public.in_channel(chan text)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1 from public.channel_members m
     where m.channel_id = chan and m.user_id = auth.uid()
  ) or exists (
    select 1
      from public.channels c
      join public.workspace_members w on w.workspace_id = c.workspace_id
     where c.id = chan
       and c.is_private = false
       and w.user_id = auth.uid()
  );
$$;

alter table public.channels        enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages        enable row level security;

drop policy if exists channels_visible on public.channels;
create policy channels_visible on public.channels
  for select using (public.in_channel(id));

-- Making one is allowed; making one in somebody else's name is not, and
-- neither is making a team channel in a team you are not in.
drop policy if exists channels_made_by_you on public.channels;
create policy channels_made_by_you on public.channels
  for insert with check (
    created_by = auth.uid()
    and (workspace_id is null or public.is_member(workspace_id))
  );

drop policy if exists channels_edited_by_members on public.channels;
create policy channels_edited_by_members on public.channels
  for update using (public.in_channel(id)) with check (public.in_channel(id));

drop policy if exists members_of_a_channel_visible on public.channel_members;
create policy members_of_a_channel_visible on public.channel_members
  for select using (public.in_channel(channel_id));

-- You may put YOURSELF in a channel you can already see, and take yourself
-- out again. Putting somebody ELSE in is `open_dm` and `add_to_channel`,
-- which check that you are allowed to — the same rule 0016 settled for
-- workspace membership: nobody is added to anything without a path that
-- asked whether they may be.
drop policy if exists you_join_and_leave on public.channel_members;
create policy you_join_and_leave on public.channel_members
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists messages_in_your_channels on public.messages;
create policy messages_in_your_channels on public.messages
  for select using (public.in_channel(channel_id));

drop policy if exists messages_written_by_you on public.messages;
create policy messages_written_by_you on public.messages
  for insert with check (
    author_id = auth.uid() and public.in_channel(channel_id)
  );

-- Editing and deleting your own words. Nobody else's, and not the reactions
-- column — see below.
drop policy if exists messages_edited_by_author on public.messages;
create policy messages_edited_by_author on public.messages
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists messages_deleted_by_author on public.messages;
create policy messages_deleted_by_author on public.messages
  for delete using (author_id = auth.uid());

-- ── A direct message between two people who know each other ────────────────

/**
 * Open the conversation with somebody, or find the one that already exists.
 *
 * A definer function because it writes a membership row for the OTHER person,
 * which no policy allows and no policy should: being added to a room is
 * something that needs a reason, and the reason here is `public.connections` —
 * the friend graph from 0015. You can only start a conversation with somebody
 * you are connected to.
 *
 * Returns the channel id, so a second call with the same person returns the
 * same conversation rather than a second empty one.
 */
create or replace function public.open_dm(other uuid, wanted text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_temp
as $$
declare
  me       uuid := auth.uid();
  low      uuid;
  high     uuid;
  found    text;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'reason', 'signed out');
  end if;
  if other = me then
    return jsonb_build_object('ok', false, 'reason', 'yourself');
  end if;

  low  := least(me, other);
  high := greatest(me, other);
  if not exists (
    select 1 from public.connections c
     where c.person_a = low and c.person_b = high
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not connected');
  end if;

  -- The existing conversation, if there is one: a dm both of us are in.
  select c.id into found
    from public.channels c
   where c.kind = 'dm'
     and exists (select 1 from public.channel_members m
                  where m.channel_id = c.id and m.user_id = me)
     and exists (select 1 from public.channel_members m
                  where m.channel_id = c.id and m.user_id = other)
   limit 1;

  if found is not null then
    return jsonb_build_object('ok', true, 'channel_id', found, 'made', false);
  end if;

  insert into public.channels (id, kind, scope, name, created_by, is_private)
  values (wanted, 'dm', 'personal', '', me, true);

  insert into public.channel_members (channel_id, user_id)
  values (wanted, me), (wanted, other);

  return jsonb_build_object('ok', true, 'channel_id', wanted, 'made', true);
end;
$$;

/**
 * A reaction is the one write somebody makes to a row that is not theirs.
 *
 * Doing it with an update policy would mean granting update on the whole row
 * to every member of the channel, which is a grant to rewrite the body of
 * somebody else's message. So it is a function that touches one column and
 * can only add or remove the caller's own id.
 */
create or replace function public.toggle_reaction(message_id text, emoji text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_temp
as $$
declare
  me      uuid := auth.uid();
  chan    text;
  current jsonb;
  ids     jsonb;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'reason', 'signed out');
  end if;
  if emoji is null or length(emoji) = 0 or length(emoji) > 16 then
    return jsonb_build_object('ok', false, 'reason', 'not an emoji');
  end if;

  select m.channel_id, m.reactions into chan, current
    from public.messages m where m.id = message_id;
  if chan is null then
    return jsonb_build_object('ok', false, 'reason', 'no such message');
  end if;
  if not public.in_channel(chan) then
    return jsonb_build_object('ok', false, 'reason', 'not in that channel');
  end if;

  ids := coalesce(current -> emoji, '[]'::jsonb);
  if ids @> to_jsonb(me::text) then
    ids := (select coalesce(jsonb_agg(v), '[]'::jsonb)
              from jsonb_array_elements(ids) v
             where v <> to_jsonb(me::text));
  else
    ids := ids || to_jsonb(me::text);
  end if;

  current := case when jsonb_array_length(ids) = 0
                  then current - emoji
                  else jsonb_set(current, array[emoji], ids) end;

  update public.messages set reactions = current where id = message_id;
  return jsonb_build_object('ok', true, 'reactions', current);
end;
$$;

do $migration$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.channels to authenticated;
    grant select, insert, delete on public.channel_members to authenticated;
    grant select, insert, delete on public.messages to authenticated;
    -- Update on messages is the author editing their own words. The reactions
    -- column is not theirs to write directly; `toggle_reaction` owns it.
    grant update (body, edited_at, attachments) on public.messages to authenticated;
    grant execute on function public.open_dm(uuid, text) to authenticated;
    grant execute on function public.toggle_reaction(text, text) to authenticated;
    -- `in_channel` IS granted, unlike `is_real_account` in 0016. A policy is
    -- evaluated as the querying role, so a policy helper the role cannot
    -- execute makes every read of the table it guards fail with "permission
    -- denied for function". It is the same call 0015 made for
    -- `shares_a_workspace` and `is_connected_to`, which sit on the profiles
    -- policy for the same reason. What it leaks is one boolean about a
    -- channel id the caller had to know already.
    grant execute on function public.in_channel(text) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.channels, public.channel_members, public.messages from anon;
    revoke all on function public.open_dm(uuid, text) from anon;
    revoke all on function public.toggle_reaction(text, text) from anon;
    revoke all on function public.in_channel(text) from anon;
  end if;
end
$migration$;

-- ── Live ───────────────────────────────────────────────────────────────────
--
-- Realtime applies row-level security to `postgres_changes`, so a subscriber
-- is sent only the rows their own policies would have returned. That is what
-- makes "subscribe to every insert on messages" safe here — the filter is the
-- policy, not a client-side check somebody can skip.
do $migration$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
  end if;
end
$migration$;
