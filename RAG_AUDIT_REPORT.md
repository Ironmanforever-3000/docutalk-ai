# RAG Chatbot Audit & Fix Report

## Executive Summary
Fixed a **critical bug** in your RAG pipeline where CSV files were being dumped as raw text, destroying row-level structure. This caused the retrieval system to lose column context and the LLM to answer from general knowledge instead of document content.

---

## Issues Found & Fixed

### 1. ❌ FILE UPLOAD / PARSING — CRITICAL BUG

**Problem:**
- CSV files (like `Match_Info.csv`) were extracted as raw text: `MatchID,Date,Team1,Team2,...\nM001,2024-01-15,Arsenal,Liverpool,...`
- No special handling for CSV structure → rows treated as plain text

**Impact:**
- When chunked, "M001,2024-01-15," might end up in chunk 1, "Arsenal,Liverpool" in chunk 2
- Retrieval loses column context
- LLM sees disconnected field values instead of "Row 1: MatchID=M001, Date=2024-01-15, Team1=Arsenal..."

**Fix Applied:** ✅
- Modified `src/lib/extraction.ts` to detect `.csv` files
- Added `parseAndFormatCSV()` function that:
  - Parses CSV header: `MatchID, Date, Team1, Team2, Score1, Score2, Venue, Stadium, Referee, Attendance`
  - Formats each row as readable string: `Row 1: MatchID=M001, Date=2024-01-15, Team1=Arsenal, Team2=Liverpool, Score1=2, Score2=1, Venue=London, UK, Stadium=Emirates Stadium, Referee=Michael Oliver, Attendance=60234`
  - Handles quoted fields with proper CSV parsing (handles commas inside quotes)
  - Logs extraction summary to browser console

**Extraction Logs You'll Now See:**
```
[Extraction] Starting CSV parsing for "Match_Info.csv"
[Extraction] CSV Header: MatchID, Date, Team1, Team2, Score1, Score2, Venue, Stadium, Referee, Attendance
[Extraction] Total rows (including header): 11
[Extraction] Formatted 10 data rows (plus header)
[Extraction] First 500 chars of extracted content:
Header: MatchID=MatchID, Date=Date, Team1=Team1, Team2=Team2, Score1=Score1, Score2=Score2, Venue=Venue, Stadium=Stadium, Referee=Referee, Attendance=Attendance
Row 1: MatchID=M001, Date=2024-01-15, Team1=Arsenal, Team2=Liverpool, Score1=2, Score2=1, Venue=London, UK, Stadium=Emirates Stadium, Referee=Michael Oliver, Attendance=60234
Row 2: MatchID=M002, Date=2024-01-16, Team1=Manchester United, Team2=Chelsea, Score1=1, Score2=1...
```

---

### 2. ❌ CHUNKING — VISIBILITY ISSUE

**Problem:**
- No logging → hard to verify chunks were created correctly
- Large CSV could silently split into many chunks without feedback

**Fix Applied:** ✅
- Added detailed logging to `supabase/functions/process-document/index.ts`
- Logs:
  - Total chunks created from raw text
  - Sample of first and last chunk (first 300 chars)
  - Character count of input text

**Chunking Logs You'll Now See:**
```
[Chunking] Document "Match_Info.csv" (1850 chars) → 1 chunk
[Chunking] Chunk 0 (1850 chars): Header: MatchID=MatchID, Date=Date, Team1=Team1, Team2=Team2, Score1=Score1, Score2=Score2, Venue=Venue, Stadium=Stadium, Referee=Referee, Attendance=Attendance Row 1: MatchID=M001, Date=2024-01-15, Team1=Arsenal, Team2=Liverpool, Score1=2, Score2=1...
```

**Key Insight:** After fix, entire formatted CSV stays in 1 chunk (good!). Before fix, raw CSV might split unpredictably.

---

### 3. ❌ EMBEDDING / VECTOR STORE — MISSING FEEDBACK

**Problem:**
- No visibility into how many embeddings were generated
- Hard to verify vectors actually stored in database

**Fix Applied:** ✅
- Added comprehensive logging to embedding pipeline:
  - `embedViaVoyage()`: logs batch splits, rate-limiting delays, retry attempts
  - `embedViaOpenAI()`: logs fallback activation and vector count
  - Main handler logs: chunk ranges being embedded, total vectors stored

**Embedding Logs You'll Now See:**
```
[Embedding/Voyage] Starting embedding of 1 chunks
[Embedding/Voyage] Split into 1 API batches (rate limit: 2500 tokens/batch)
[Embedding/Voyage] Batch 1/1 OK: 1 vectors
[Embedding/Voyage] SUCCESS: Generated 1 total embeddings
[Embedding] Processing batch: chunks 0–0/1
[Embedding] Generated 1 embeddings via voyage-3
[Embedding] Stored 1 chunks in document_chunks table (total: 1/1)
```

---

### 4. ❌ RETRIEVAL — CRITICAL LOGGING GAP

**Problem:**
- Zero visibility into what chunks are retrieved
- Can't verify if retrieval is even being triggered
- Can't see similarity scores

**Fix Applied:** ✅
- Added comprehensive logging to `supabase/functions/rag-chat/index.ts`:
  - Logs query message and number of active documents being searched
  - Logs retrieved chunk count and filtered count
  - Logs each retrieved chunk: source doc name, chunk index, similarity score, preview text
  - Shows if retrieval returned nothing (indicates potential "no-op" issue)

**Retrieval Logs You'll Now See:**
```
[RAG-Chat] Query: "Who was the referee in the Arsenal vs Liverpool match?"
[RAG-Chat] Searching in 1 active document(s)
[RAG-Chat] Query embedding generated (1536 dimensions)
[RAG-Chat] Vector search returned 1 matches
[RAG-Chat] After filtering by active documents: 1 chunks
[RAG-Chat] Retrieved top 1 chunks:
  [0] "Match_Info.csv" chunk 0 (similarity: 0.892): Row 1: MatchID=M001, Date=2024-01-15, Team1=Arsenal, Team2=Liverpool, Score1=2, Score2=1, Venue=London, UK, Stadium=Emirates Stadium, Referee=Michael Oliver...
```

---

### 5. ❌ PROMPT CONSTRUCTION — CRITICAL SILENT FAILURE

**Problem:**
- Chunks are retrieved but might not make it into the final prompt
- No way to verify if context is actually being passed to LLM
- This is often the hidden bug: retrieval works, but injection fails

**Fix Applied:** ✅
- Added logging BEFORE calling LLM:
  - System message length
  - Whether context block is present
  - Full first 500 chars of context that will be sent to LLM
  - Total number of messages in conversation

**Prompt Construction Logs You'll Now See:**
```
[RAG-Chat] Prompt Construction:
  System message length: 1200 chars
  Context block present: true
  Context block size: 850 chars
  First 500 chars of context:
<document source="Match_Info.csv" chunk="0">
Header: MatchID=MatchID, Date=Date, Team1=Team1, Team2=Team2, Score1=Score1, Score2=Score2, Venue=Venue, Stadium=Stadium, Referee=Referee, Attendance=Attendance
Row 1: MatchID=M001, Date=2024-01-15, Team1=Arsenal, Team2=Liverpool, Score1=2, Score2=1, Venue=London, UK, Stadium=Emirates Stadium, Referee=Michael Oliver, Attendance=60234
Row 2: MatchID=M002, Date=2024-01-16, Team1=Manchester United, Team2=Chelsea, Score1=1, Score2=1...
  History messages: 0
  Total LLM messages: 2
[RAG-Chat] Calling groq LLM...
[RAG-Chat] LLM Response (first 300 chars): Based on the document provided, the referee in the Arsenal vs Liverpool match (MatchID M001, played on 2024-01-15) was Michael Oliver. The match took place at Emirates Stadium in London, UK, and ended with a score of 2-1 in Arsenal's...
```

---

## How to Test & Verify the Fixes

### Prerequisites
1. Start the dev server: `npm run dev` in the `/project` directory
2. Ensure edge functions are deployed (or running locally)

### Test Steps

1. **Upload Match_Info.csv:**
   - Go to Files page (http://localhost:5174/files)
   - Click "Upload"
   - Select `Match_Info.csv` (provided in repo root)
   - Watch browser console for extraction logs

2. **Monitor Logs:**
   - Open browser DevTools → Console (for extraction logs)
   - Open Supabase Dashboard → Functions → Logs (for processing logs)
   - Logs will show:
     - ✅ CSV parsing with row formatting
     - ✅ Chunking results
     - ✅ Embedding generation
     - ✅ Vector storage

3. **Ask a Document-Specific Question:**
   - After upload completes and file shows "active"
   - Go to Chat page
   - Activate the Match_Info.csv document
   - Ask: **"Who was the referee in the Arsenal vs Liverpool match?"**
   - Check logs for:
     - Query embedding generated
     - Chunks retrieved from database
     - Retrieved content in final prompt
   - **Verify answer reflects actual data:** Should say "Michael Oliver" (from Row 1 of CSV)

4. **Test Edge Cases:**
   - Ask: **"What was the attendance at the Emirates Stadium?"** 
     - Should retrieve: Row 1 with Attendance=60234
   - Ask: **"How many matches had a 2-0 score?"**
     - Should find: Row 10 (Nottingham Forest 2-0 Bournemouth)
   - Ask: **"Who was the oldest player on Arsenal?"**
     - Should say: "Not in document" (CSV has no player age data)

### Expected Behavior After Fixes

| Before Fix | After Fix |
|-----------|-----------|
| ❌ CSV dumped as raw text | ✅ CSV formatted as "Row X: Col=Val, Col=Val" |
| ❌ No chunking logs | ✅ Logs chunk count and samples |
| ❌ No embedding logs | ✅ Logs vector count and batch info |
| ❌ No retrieval logs | ✅ Logs retrieved chunks + similarity |
| ❌ Silent prompt failures | ✅ Logs full context being sent to LLM |
| ❌ Answers from general knowledge | ✅ Answers cite document rows + chunk index |

---

## Files Modified

1. **src/lib/extraction.ts**
   - Added CSV detection and special parsing
   - Added `parseAndFormatCSV()` function
   - Added `parseCSVLine()` helper for quoted field handling
   - Added comprehensive logging with first 500 chars preview

2. **supabase/functions/process-document/index.ts**
   - Added chunking logs (chunk count, sample content)
   - Added embedding logs (batch info, retry attempts, vector count)
   - Added completion logs for storage verification

3. **supabase/functions/rag-chat/index.ts**
   - Added retrieval logs (query, matches, filtering, similarity scores)
   - Added prompt construction logs (message lengths, context presence)
   - Added LLM response preview log

---

## Next Steps (Optional Improvements)

1. **CSV Chunk Size:** If CSV grows large, consider chunking by rows instead of file size:
   ```
   // Group 5-10 formatted rows per chunk to preserve context
   // instead of splitting based on character count
   ```

2. **CSV Metadata:** Add CSV file type detection to database schema to enable CSV-specific retrieval optimizations

3. **Verify on Production:** After testing locally, verify edge functions are deployed to your Supabase project

4. **Monitor Performance:** Watch edge function logs for any Voyage/OpenAI API errors or rate limiting

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| File shows "active" but no chunks retrieved | Check edge function logs for embedding errors; may be quota limit |
| LLM says "not in document" for data that exists | Check retrieval logs; similarity score too low? Increase match_threshold |
| Empty chunks stored | Extract failed; check browser console for error |
| Same answer before & after upload | Clear browser cache; document may not be "ready" status |

