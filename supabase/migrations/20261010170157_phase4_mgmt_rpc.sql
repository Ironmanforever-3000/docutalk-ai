create or replace function set_chunk_coords(p_doc uuid, p_coords jsonb)
returns void
language sql
security definer
as $$
  update document_chunks c
  set x_coordinate = (r->>'x')::float,
      y_coordinate = (r->>'y')::float
  from jsonb_array_elements(p_coords) r
  where c.document_id = p_doc
  and c.id = (r->>'id')::uuid;
$$;

create or replace function get_document_embeddings(p_doc uuid)
returns table (id uuid, chunk_index int, emb text)
language sql
security definer
as $$
  select id, chunk_index, embedding::text as emb
  from document_chunks
  where document_id = p_doc
  order by chunk_index;
$$;
