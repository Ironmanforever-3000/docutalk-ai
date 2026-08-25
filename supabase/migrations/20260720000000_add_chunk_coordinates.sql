-- Add PCA coordinate columns for the constellation visualization
-- Computed at ingestion time so every chunk has a stable 2D position

ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS x_coordinate float,
  ADD COLUMN IF NOT EXISTS y_coordinate float;

-- Update the match function to also return coordinates
DROP FUNCTION IF EXISTS match_document_chunks(VECTOR(1536), UUID, INT, FLOAT);

CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding VECTOR(1536),
  match_user_id UUID,
  match_count INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  chunk_index INT,
  content TEXT,
  similarity FLOAT,
  document_name TEXT,
  x_coordinate FLOAT,
  y_coordinate FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    d.name AS document_name,
    dc.x_coordinate,
    dc.y_coordinate
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE dc.user_id = match_user_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
