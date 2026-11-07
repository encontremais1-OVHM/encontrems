-- Persist the WhatsApp Community container and the profile images shown in signup.
alter table public.communities
  add column if not exists whatsapp_community_id text,
  add column if not exists image_url text;

create unique index if not exists communities_whatsapp_community_id_unique
  on public.communities (whatsapp_community_id)
  where whatsapp_community_id is not null;

alter table public.whatsapp_groups
  add column if not exists image_url text,
  add column if not exists linked_parent_id text;

alter table public.whatsapp_groups
  drop constraint if exists whatsapp_groups_group_type_check;

alter table public.whatsapp_groups
  add constraint whatsapp_groups_group_type_check
  check (group_type = any (array['main'::text, 'subgroup'::text, 'community'::text]));
