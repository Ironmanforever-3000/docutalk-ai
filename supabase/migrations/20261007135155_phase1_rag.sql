drop function if exists match_document_chunks(vector, uuid, integer, double precision);

create or replace function match_document_chunks(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count int default 8,
  match_threshold float default 0.3,
  match_document_ids uuid[] default null
) returns table (
  id uuid,
  document_id uuid,
  chunk_index int,
  content text,
  similarity float,
  document_name text,
  x_coordinate float,
  y_coordinate float
) language sql stable security definer as $$
  select
    c.id,
    c.document_id,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity,
    d.name as document_name,
    c.x_coordinate,
    c.y_coordinate
  from document_chunks c
  join documents d on d.id = c.document_id
  where
    c.user_id = match_user_id
    and (match_document_ids is null or c.document_id = any(match_document_ids))
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function set_chunk_coords(p_doc uuid, p_coords jsonb) returns void language sql security definer as $$
  update document_chunks c
  set
    x_coordinate = (r->>'x')::float,
    y_coordinate = (r->>'y')::float
  from jsonb_array_elements(p_coords) r
  where c.document_id = p_doc and c.id = (r->>'id')::uuid;
$$;
