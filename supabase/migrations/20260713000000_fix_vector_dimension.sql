-- Fix vector dimension to support both Voyage (1024) and OpenAI (1536) embeddings
-- Previous setup only accepted VECTOR(1024), silently dropping OpenAI 1536-dim embeddings

-- Drop the HNSW index on the old column
DROP INDEX IF EXISTS document_chunks_embedding_idx;

-- Add a new column with correct dimensions
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding_new VECTOR(1536);

-- Copy any existing embeddings (cast from 1024 to 1536 by padding with zeros)
UPDATE document_chunks SET embedding_new = embedding::VECTOR(1536) WHERE embedding IS NOT NULL;

-- Drop the old column
ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding;

-- Rename new column
ALTER TABLE document_chunks RENAME COLUMN embedding_new TO embedding;

-- Rebuild the HNSW index on the new column
CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- Update the match function to accept VECTOR(1536)
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
  document_name TEXT
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
    d.name AS document_name
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE dc.user_id = match_user_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
