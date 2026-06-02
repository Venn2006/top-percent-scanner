alter table public.roadmaps
add column if not exists role_id text;

create index if not exists idx_roadmaps_role_id
on public.roadmaps (role_id);
