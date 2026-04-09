"use client";

import { useState, useTransition, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, AlertCircle, FileSpreadsheet } from "lucide-react";
import { startContactImport } from "@/lib/contacts/actions";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ROWS = 10_000;

const CONTACT_FIELDS = [
  { value: "first_name", label: "First Name", required: true },
  { value: "last_name", label: "Last Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "company", label: "Company" },
  { value: "title", label: "Title" },
  { value: "contact_type", label: "Type" },
  { value: "status", label: "Status" },
  { value: "lifecycle_stage", label: "Lifecycle Stage" },
  { value: "tags", label: "Tags (comma-separated)" },
  { value: "location", label: "Location" },
  { value: "source", label: "Source" },
  { value: "persona", label: "Persona" },
  { value: "lead_score", label: "Lead Score (numeric)" },
  { value: "notes", label: "Notes" },
] as const;

type Step = "upload" | "preview" | "mapping" | "submitting";

export function ContactImportDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // CSV state
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);

  // Mapping state: csvColumn -> contactField
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const reset = () => {
    setStep("upload");
    setFile(null);
    setHeaders([]);
    setPreviewRows([]);
    setTotalRows(0);
    setMapping({});
    setError(null);
  };

  const handleFileSelect = useCallback((selectedFile: File) => {
    setError(null);

    if (!selectedFile.name.endsWith(".csv")) {
      setError("Please select a .csv file");
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(`File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");

      if (lines.length < 2) {
        setError("CSV must have a header row and at least one data row");
        return;
      }

      const parsedHeaders = parseCsvRow(lines[0]);
      const parsedRows = lines.slice(1).map(parseCsvRow);

      if (parsedRows.length > MAX_ROWS) {
        setError(`CSV has ${parsedRows.length.toLocaleString()} rows. Maximum is ${MAX_ROWS.toLocaleString()}.`);
        return;
      }

      setFile(selectedFile);
      setHeaders(parsedHeaders);
      setPreviewRows(parsedRows.slice(0, 5));
      setTotalRows(parsedRows.length);

      // Auto-map headers that match field names
      const autoMapping: Record<string, string> = {};
      for (const h of parsedHeaders) {
        const normalized = h.toLowerCase().replace(/[\s-]/g, "_");
        const match = CONTACT_FIELDS.find(
          (f) => f.value === normalized || f.label.toLowerCase().replace(/[\s-]/g, "_") === normalized,
        );
        if (match) autoMapping[h] = match.value;
      }
      setMapping(autoMapping);
      setStep("preview");
    };
    reader.readAsText(selectedFile);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, [handleFileSelect]);

  const handleSubmit = () => {
    setError(null);

    // Validate required mapping
    const mappedFields = Object.values(mapping);
    if (!mappedFields.includes("first_name")) {
      setError("You must map a column to 'First Name' (required)");
      return;
    }

    if (!mappedFields.includes("email")) {
      // Not a hard error, but warn
    }

    setStep("submitting");
    startTransition(async () => {
      try {
        const supabase = createClient();

        // Upload CSV to Storage
        const fileName = `import_${Date.now()}_${file!.name}`;
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session) throw new Error("Not authenticated");

        // Get org_id from URL path — convention: /[dept]/contacts
        const storagePath = `imports/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("org-documents")
          .upload(storagePath, file!, { contentType: "text/csv" });

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        // Start the import
        await startContactImport({
          file_name: file!.name,
          storage_path: storagePath,
          column_mapping: mapping,
          total_rows: totalRows,
        });

        reset();
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start import");
        setStep("mapping");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Upload className="h-4 w-4" />
        Import CSV
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Contacts from CSV</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-muted-foreground/25 p-8 transition-colors hover:border-muted-foreground/50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drag and drop a CSV file, or click to browse
            </p>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              id="csv-upload"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById("csv-upload")?.click()}
            >
              Choose File
            </Button>
            <p className="text-xs text-muted-foreground">
              Max {MAX_ROWS.toLocaleString()} rows, {MAX_FILE_SIZE / 1024 / 1024}MB
            </p>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{file?.name}</Badge>
              <Badge variant="outline">{totalRows.toLocaleString()} rows</Badge>
              <Badge variant="outline">{headers.length} columns</Badge>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {headers.map((h) => (
                      <th key={h} className="px-2 py-1.5 text-left font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {row.map((cell, j) => (
                        <td key={j} className="max-w-[150px] truncate px-2 py-1.5">
                          {cell || <span className="text-muted-foreground">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Showing first 5 of {totalRows.toLocaleString()} rows
            </p>
          </div>
        )}

        {(step === "mapping" || step === "submitting") && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Map CSV columns to contact fields. Fields marked * are required.
            </p>
            <div className="max-h-[350px] space-y-2 overflow-y-auto pr-1">
              {headers.map((header) => (
                <div key={header} className="flex items-center gap-3">
                  <Label className="w-40 shrink-0 truncate text-sm" title={header}>
                    {header}
                  </Label>
                  <Select
                    value={mapping[header] || ""}
                    onValueChange={(val) => {
                      setMapping((prev) => {
                        const next = { ...prev };
                        if (val) {
                          next[header] = val;
                        } else {
                          delete next[header];
                        }
                        return next;
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Skip column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Skip column</SelectItem>
                      {CONTACT_FIELDS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}{"required" in f && f.required ? " *" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {!Object.values(mapping).includes("email") && (
              <div className="flex items-center gap-2 text-xs text-[var(--fgColor-attention)]">
                <AlertCircle className="h-3.5 w-3.5" />
                Email not mapped — duplicate detection won't work
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button onClick={() => setStep("mapping")}>
                Map Columns
              </Button>
            </>
          )}
          {(step === "mapping" || step === "submitting") && (
            <>
              <Button variant="outline" onClick={() => setStep("preview")} disabled={isPending}>
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isPending || !Object.values(mapping).includes("first_name")}
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Import {totalRows.toLocaleString()} Contacts
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Simple CSV row parser handling quoted fields
function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}
