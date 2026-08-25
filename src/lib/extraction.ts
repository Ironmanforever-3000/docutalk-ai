export type ExtractionStatus = 'processing' | 'ready' | 'failed';

export interface ExtractionResult {
  status: 'ready' | 'failed';
  text: string | null;
  charCount: number;
  errorMessage: string | null;
}

const SCANNED_PDF_CHARS_PER_KB = 40;

export async function extractTextFromFile(file: File): Promise<ExtractionResult> {
  try {
    const name = file.name.toLowerCase();

    if (
      file.type.startsWith('text/') ||
      file.type === 'text/markdown' ||
      file.type === 'application/json' ||
      file.type === 'application/xml' ||
      file.type === 'text/xml' ||
      name.endsWith('.md') ||
      name.endsWith('.csv') ||
      name.endsWith('.txt')
    ) {
      const text = await file.text();
      if (!text.trim()) {
        return fail('File appears to be empty.');
      }

      // Special handling for CSV: parse and reformat as structured rows
      if (name.endsWith('.csv') || file.type === 'text/csv') {
        console.log(`[Extraction] Starting CSV parsing for "${file.name}"`);
        const result = parseAndFormatCSV(text, file.name);
        if (result.status === 'failed') {
          return result;
        }
        return result;
      }

      return ok(text);
    }

    if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
      return await extractPDF(file);
    }

    if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.type === 'application/msword' ||
      name.endsWith('.docx') ||
      name.endsWith('.doc')
    ) {
      return await extractDOCX(file);
    }

    const ext = name.split('.').pop()?.toUpperCase() || 'unknown';
    return fail(
      `File type "${ext}" is not supported for text extraction. Supported: PDF, DOCX, DOC, TXT, MD, JSON, CSV, XML.`
    );
  } catch (err) {
    console.error(`[Extraction] Unexpected error — "${file.name}"`, err);
    return fail(
      err instanceof Error ? err.message : 'Unexpected extraction error. Check browser console.'
    );
  }
}

// ── PDF extractor ────────────────────────────────────────────────────────────

async function extractPDF(file: File): Promise<ExtractionResult> {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
    } catch {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        '/node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
        window.location.origin
      ).toString();
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;

    const pages: string[] = [];
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      let pageText = '';
      let lastY: number | null = null;
      for (const item of textContent.items) {
        const itemData = item as { str?: string; transform?: number[] };
        if (!itemData.str) continue;
        const str = itemData.str;
        const y = itemData.transform?.[5] ?? null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) {
          pageText += str.endsWith('-') ? '' : '\n';
        } else if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
          pageText += ' ';
        }
        pageText += str;
        lastY = y;
      }
      pages.push(`--- Page ${i} ---\n${pageText.trim()}`);
    }

    const fullText = pages.join('\n\n').trim();

    if (fullText.length < 100) {
      return fail(
        `This PDF has no selectable text — OCR is not supported yet. Extracted only ${fullText.length} characters across ${numPages} pages.`
      );
    }

    const fileSizeKB = file.size / 1024;
    const charsPerKB = fullText.length / Math.max(fileSizeKB, 1);
    if (numPages > 2 && charsPerKB < SCANNED_PDF_CHARS_PER_KB) {
      return fail(
        `This PDF has very little selectable text (${Math.round(charsPerKB)} chars/KB). It may be a scanned document — OCR is not supported yet.`
      );
    }

    return ok(fullText);
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Failed to parse PDF. The file may be corrupted or password-protected.');
  }
}

// ── DOCX extractor ───────────────────────────────────────────────────────────

async function extractDOCX(file: File): Promise<ExtractionResult> {
  try {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value.trim();

    if (!text) {
      return fail('No text could be extracted from this Word document. It may be empty or contain only images.');
    }

    // Log any mammoth warnings for debugging
    if (result.messages?.length > 0) {
      console.info(`[Extraction] DOCX warnings for "${file.name}":`, result.messages);
    }

    return ok(text);
  } catch (err) {
    console.error(
      `[Extraction] DOCX parse error — "${file.name}" (${file.size} bytes):`,
      err
    );
    return fail(err instanceof Error ? err.message : 'Failed to parse Word document. Ensure the file is a valid .docx.');
  }
}

// ── CSV parser ───────────────────────────────────────────────────────────────

function parseAndFormatCSV(csvText: string, fileName: string): ExtractionResult {
  try {
    const lines = csvText.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

    if (lines.length === 0) {
      return fail('CSV file is empty.');
    }

    // Parse header and rows using a simple CSV parser (handles quoted fields)
    const header = parseCSVLine(lines[0]);
    if (header.length === 0) {
      return fail('CSV header is empty or malformed.');
    }

    console.log(`[Extraction] CSV Header: ${header.join(', ')}`);
    console.log(`[Extraction] Total rows (including header): ${lines.length}`);

    const formattedRows: string[] = [];

    // Add header as first row for clarity
    const headerRow = header
      .map((col) => `${col}=${col}`)
      .join(', ');
    formattedRows.push(`Header: ${headerRow}`);

    // Parse and format data rows
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === 0) continue;

      // Pad values if fewer columns than header
      while (values.length < header.length) {
        values.push('');
      }

      const rowStr = header
        .map((col, j) => `${col}=${values[j] || '(empty)'}`)
        .join(', ');

      formattedRows.push(`Row ${i}: ${rowStr}`);
    }

    const finalText = formattedRows.join('\n');

    console.log(`[Extraction] Formatted ${formattedRows.length - 1} data rows (plus header)`);
    console.log(
      `[Extraction] First 500 chars of extracted content:\n${finalText.slice(0, 500)}`
    );

    return ok(finalText);
  } catch (err) {
    console.error(`[Extraction] CSV parsing error — "${fileName}":`, err);
    return fail(
      err instanceof Error ? err.message : 'Failed to parse CSV file. Please ensure it is a valid CSV format.'
    );
  }
}

// Simple CSV line parser that handles quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      // Field separator
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add final field
  result.push(current.trim());

  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ok(text: string): ExtractionResult {
  return { status: 'ready', text, charCount: text.length, errorMessage: null };
}

function fail(errorMessage: string): ExtractionResult {
  return { status: 'failed', text: null, charCount: 0, errorMessage };
}
