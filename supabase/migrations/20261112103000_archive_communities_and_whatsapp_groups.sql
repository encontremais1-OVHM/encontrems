alter table public.communities
  add column if not exists archived_at timestamptz;

create index if not exists communities_archived_at_idx
  on public.communities (archived_at)
  where archived_at is not null;
