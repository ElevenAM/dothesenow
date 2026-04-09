import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  updateImportProgress,
  isImportCancelled,
  upsertContactByEmail,
} from "@dothesenow/queries";
import type {
  CreateContactInput,
  ImportRowError,
  ContactImportStatus,
} from "@dothesenow/types";

const MAX_ROWS = 10_000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const BATCH_SIZE = 50;
const MAX_BATCHES = 200; // 10,000 / 50

// Contact fields that map from CSV columns
const VALID_FIELDS = new Set([
  "first_name",
  "last_name",
  "email",
  "phone",
  "company",
  "title",
  "contact_type",
  "status",
  "lifecycle_stage",
  "tags",
  "location",
  "source",
  "persona",
  "lead_score",
  "notes",
]);

const NUMERIC_FIELDS = new Set(["lead_score"]);

const VALID_CONTACT_TYPES = new Set([
  "lead", "prospect", "customer", "partner", "therapist",
  "influencer", "media", "other",
]);

const VALID_STATUSES = new Set(["active", "inactive", "do_not_contact", "churned"]);

const VALID_LIFECYCLE_STAGES = new Set([
  "awareness", "consideration", "decision", "customer", "advocate",
]);

/**
 * CSV import function — processes a CSV file uploaded to Supabase Storage,
 * validates rows, and upserts contacts by email in batches.
 */
export const contactCsvImport = inngest.createFunction(
  {
    id: "contact-csv-import",
    triggers: [{ event: "contacts/import.requested" }],
    concurrency: [{ limit: 3 }],
    retries: 1,
  },
  async ({ event, step }) => {
    const { import_id, org_id, storage_path } = event.data;
    const supabase = createAdminClient();

    // Step 1: Download and parse CSV
    const parsed = await step.run("load-csv", async () => {
      await updateImportProgress(supabase, import_id, { status: "processing" });

      const { data: fileData, error: downloadError } = await supabase.storage
        .from("org-documents")
        .download(storage_path);

      if (downloadError || !fileData) {
        await updateImportProgress(supabase, import_id, {
          status: "failed",
          errors: [{ row_number: 0, field: "_file", reason: "Failed to download CSV file" }],
        });
        return { rows: [], headers: [], error: true };
      }

      // Check file size
      if (fileData.size > MAX_FILE_SIZE) {
        await updateImportProgress(supabase, import_id, {
          status: "failed",
          errors: [{ row_number: 0, field: "_file", reason: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` }],
        });
        return { rows: [], headers: [], error: true };
      }

      const text = await fileData.text();
      const { rows, headers } = parseCsv(text);

      if (rows.length > MAX_ROWS) {
        await updateImportProgress(supabase, import_id, {
          status: "failed",
          errors: [{ row_number: 0, field: "_file", reason: `CSV has ${rows.length} rows, maximum is ${MAX_ROWS}` }],
        });
        return { rows: [], headers: [], error: true };
      }

      if (rows.length === 0) {
        await updateImportProgress(supabase, import_id, {
          status: "failed",
          errors: [{ row_number: 0, field: "_file", reason: "CSV file is empty or has no data rows" }],
        });
        return { rows: [], headers: [], error: true };
      }

      await updateImportProgress(supabase, import_id, {
        status: "processing",
      });

      return { rows, headers, error: false };
    });

    if (parsed.error || parsed.rows.length === 0) {
      return { status: "failed", reason: "parse_error" };
    }

    // Step 2: Validate column mapping
    const mappingResult = await step.run("validate-mapping", async () => {
      // Fetch the import record to get column_mapping
      const { data: importRecord } = await supabase
        .from("dtn_contact_imports")
        .select("column_mapping")
        .eq("id", import_id)
        .single();

      const mapping: Record<string, string> = importRecord?.column_mapping ?? {};

      // Check required field
      const mappedFields = Object.values(mapping);
      if (!mappedFields.includes("first_name")) {
        await updateImportProgress(supabase, import_id, {
          status: "failed",
          errors: [{ row_number: 0, field: "first_name", reason: "Required field 'first_name' is not mapped to any CSV column" }],
        });
        return { mapping: {}, valid: false };
      }

      // Filter to valid fields only
      const validMapping: Record<string, string> = {};
      for (const [csvCol, dtnField] of Object.entries(mapping)) {
        if (VALID_FIELDS.has(dtnField)) {
          validMapping[csvCol] = dtnField;
        }
      }

      return { mapping: validMapping, valid: true };
    });

    if (!mappingResult.valid) {
      return { status: "failed", reason: "invalid_mapping" };
    }

    // Step 3: Process in batches
    const totalBatches = Math.min(
      Math.ceil(parsed.rows.length / BATCH_SIZE),
      MAX_BATCHES,
    );

    let totalImported = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const allErrors: ImportRowError[] = [];

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const batchResult = await step.run(`process-batch-${batchIdx}`, async () => {
        // Check for cancellation at start of each batch
        const cancelled = await isImportCancelled(supabase, import_id);
        if (cancelled) {
          return { imported: 0, skipped: 0, errors: [], cancelled: true };
        }

        const start = batchIdx * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, parsed.rows.length);
        const batchRows = parsed.rows.slice(start, end);

        let imported = 0;
        let skipped = 0;
        const errors: ImportRowError[] = [];

        for (let i = 0; i < batchRows.length; i++) {
          const rowNumber = start + i + 2; // +2 for 1-indexed + header row
          const csvRow = batchRows[i];

          try {
            const contact = mapRowToContact(csvRow, parsed.headers, mappingResult.mapping);

            // Validate required fields
            if (!contact.first_name || contact.first_name.trim() === "") {
              errors.push({ row_number: rowNumber, field: "first_name", reason: "first_name is required and cannot be empty" });
              skipped++;
              continue;
            }

            // Validate enum fields
            if (contact.contact_type && !VALID_CONTACT_TYPES.has(contact.contact_type)) {
              errors.push({ row_number: rowNumber, field: "contact_type", reason: `Invalid contact_type: ${contact.contact_type}` });
              skipped++;
              continue;
            }
            if (contact.status && !VALID_STATUSES.has(contact.status)) {
              errors.push({ row_number: rowNumber, field: "status", reason: `Invalid status: ${contact.status}` });
              skipped++;
              continue;
            }
            if (contact.lifecycle_stage && !VALID_LIFECYCLE_STAGES.has(contact.lifecycle_stage)) {
              errors.push({ row_number: rowNumber, field: "lifecycle_stage", reason: `Invalid lifecycle_stage: ${contact.lifecycle_stage}` });
              skipped++;
              continue;
            }

            await upsertContactByEmail(supabase, org_id, contact);
            imported++;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push({ row_number: rowNumber, field: "_row", reason: message });
          }
        }

        return { imported, skipped, errors, cancelled: false };
      });

      if (batchResult.cancelled) {
        await step.run("finalize-cancelled", async () => {
          await updateImportProgress(supabase, import_id, {
            status: "cancelled",
            completed_at: new Date().toISOString(),
          });
        });
        return { status: "cancelled", imported: totalImported };
      }

      totalImported += batchResult.imported;
      totalSkipped += batchResult.skipped;
      totalErrors += batchResult.errors.length;
      allErrors.push(...batchResult.errors);

      // Update progress outside the step so counters reflect all completed batches
      await updateImportProgress(supabase, import_id, {
        imported_rows: totalImported,
        skipped_rows: totalSkipped,
        error_rows: totalErrors,
      });
    }

    // Step 4: Finalize
    await step.run("finalize", async () => {
      let finalStatus: ContactImportStatus = "completed";
      if (totalErrors > 0 && totalImported > 0) finalStatus = "partial";
      else if (totalErrors > 0 && totalImported === 0) finalStatus = "failed";

      await updateImportProgress(supabase, import_id, {
        status: finalStatus,
        imported_rows: totalImported,
        skipped_rows: totalSkipped,
        error_rows: totalErrors,
        errors: allErrors.slice(0, 500), // Cap stored errors at 500
        completed_at: new Date().toISOString(),
      });
    });

    return {
      status: "done",
      imported: totalImported,
      skipped: totalSkipped,
      errors: totalErrors,
    };
  },
);

// ─── CSV parsing ────────────────────────────────────────────

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  return { headers, rows };
}

function parseRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function mapRowToContact(
  row: string[],
  headers: string[],
  mapping: Record<string, string>,
): CreateContactInput {
  const contact: Record<string, unknown> = {};

  for (const [csvCol, dtnField] of Object.entries(mapping)) {
    const colIndex = headers.indexOf(csvCol);
    if (colIndex === -1 || colIndex >= row.length) continue;

    const rawValue = row[colIndex]?.trim();
    if (!rawValue) continue;

    if (dtnField === "tags") {
      // Split comma-separated tags
      contact[dtnField] = rawValue.split(/[;,]/).map((t) => t.trim()).filter(Boolean);
    } else if (NUMERIC_FIELDS.has(dtnField)) {
      const num = parseInt(rawValue, 10);
      if (!isNaN(num)) contact[dtnField] = num;
    } else {
      contact[dtnField] = rawValue;
    }
  }

  return contact as unknown as CreateContactInput;
}
