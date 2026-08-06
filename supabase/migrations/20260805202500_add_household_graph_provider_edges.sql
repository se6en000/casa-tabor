alter table public.household_graph_edges
  drop constraint if exists household_graph_edges_edge_type_check;

alter table public.household_graph_edges
  add constraint household_graph_edges_edge_type_check
  check (
    edge_type in (
      'attends',
      'at_place',
      'knows',
      'follows_routine',
      'instance_of_routine',
      'has_provider'
    )
  );
