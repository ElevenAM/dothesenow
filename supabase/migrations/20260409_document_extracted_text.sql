-- Add extracted_text column for storing text content from binary files (DOCX)
ALTER TABLE dtn_documents ADD COLUMN extracted_text TEXT;

COMMENT ON COLUMN dtn_documents.extracted_text IS
  'Extracted text content from binary files (DOCX). Used for AI context.';
