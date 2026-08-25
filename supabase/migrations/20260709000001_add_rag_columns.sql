-- Phase 2: Add reliable status tracking and text storage columns to documents
-- Migrates existing content_text → extracted_text with proper status inference

ALTER TABLE documents ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'processing';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_text TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS char_count INT;

-- Migrate existing data: copy content_text to extracted_text and derive status
UPDATE documents SET
  extracted_text = content_text,
  char_count = CASE
    WHEN content_text IS NOT NULL AND length(content_text) > 0
    THEN length(content_text)
    ELSE NULL
  END,
  status = CASE
    WHEN content_text IS NOT NULL AND length(trim(content_text)) > 50 THEN 'ready'
    WHEN processed = true THEN 'ready'
    ELSE 'failed'
  END,
  error_message = CASE
    WHEN (content_text IS NULL OR length(trim(content_text)) <= 50)
      AND (processed = false OR processed IS NULL)
    THEN 'No text was extracted during original upload — re-upload to try again'
    ELSE NULL
  END;

-- Fast lookups by user + status
CREATE INDEX IF NOT EXISTS idx_documents_user_status ON documents(user_id, status);
