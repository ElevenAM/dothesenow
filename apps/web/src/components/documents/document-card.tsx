import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Image,
  FileSpreadsheet,
  File,
} from "lucide-react";
import type { Document } from "@dothesenow/types";

const ICON_MAP: Record<string, typeof FileText> = {
  "application/pdf": FileText,
  "image/": Image,
  "text/csv": FileSpreadsheet,
  "application/vnd.openxmlformats-officedocument.spreadsheetml": FileSpreadsheet,
};

function getIcon(fileType: string) {
  for (const [prefix, Icon] of Object.entries(ICON_MAP)) {
    if (fileType.startsWith(prefix)) return Icon;
  }
  return File;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DocumentCardProps {
  document: Document;
  onClick: () => void;
}

export function DocumentCard({ document, onClick }: DocumentCardProps) {
  const Icon = getIcon(document.file_type);

  return (
    <Card
      className="cursor-pointer transition-shadow hover:ring-1 hover:ring-ring/20"
      onClick={onClick}
    >
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--bgColor-muted)]">
          <Icon className="h-5 w-5 text-[var(--fgColor-muted)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{document.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {document.file_name}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {formatSize(document.file_size)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(document.created_at).toLocaleDateString()}
            </span>
          </div>
          {document.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {document.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
              {document.tags.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{document.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
