alter table documents add column if not exists project_id uuid references projects(id) on delete set null;
