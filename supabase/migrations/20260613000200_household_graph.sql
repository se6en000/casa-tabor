create table if not exists public.household_graph_nodes (
  id uuid primary key default gen_random_uuid(),
  node_key text not null unique,
  node_type text not null check (node_type in ('member', 'place', 'contact', 'event', 'routine')),
  ref_id uuid,
  label text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists household_graph_nodes_type_idx
  on public.household_graph_nodes(node_type);

create table if not exists public.household_graph_edges (
  id uuid primary key default gen_random_uuid(),
  edge_type text not null check (
    edge_type in (
      'attends',
      'at_place',
      'knows',
      'follows_routine',
      'instance_of_routine'
    )
  ),
  from_node_id uuid not null references public.household_graph_nodes(id) on delete cascade,
  to_node_id uuid not null references public.household_graph_nodes(id) on delete cascade,
  weight numeric not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edge_type, from_node_id, to_node_id)
);

create index if not exists household_graph_edges_from_idx
  on public.household_graph_edges(from_node_id);

create index if not exists household_graph_edges_to_idx
  on public.household_graph_edges(to_node_id);

alter table public.household_graph_nodes enable row level security;
alter table public.household_graph_edges enable row level security;

drop policy if exists "allow all nodes" on public.household_graph_nodes;
create policy "allow all nodes"
  on public.household_graph_nodes
  for all
  using (true)
  with check (true);

drop policy if exists "allow all edges" on public.household_graph_edges;
create policy "allow all edges"
  on public.household_graph_edges
  for all
  using (true)
  with check (true);

drop trigger if exists household_graph_nodes_updated_at on public.household_graph_nodes;
create trigger household_graph_nodes_updated_at
  before update on public.household_graph_nodes
  for each row execute function public.set_updated_at();

drop trigger if exists household_graph_edges_updated_at on public.household_graph_edges;
create trigger household_graph_edges_updated_at
  before update on public.household_graph_edges
  for each row execute function public.set_updated_at();
