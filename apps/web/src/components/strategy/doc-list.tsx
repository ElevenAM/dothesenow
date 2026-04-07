"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DocEditor } from "./doc-editor";
import { VersionHistory } from "./version-history";
import { CreateDocDialog } from "./create-doc-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import type { StrategyDoc } from "@/lib/strategy/actions";
import { DOC_TYPE_LABELS } from "@/lib/strategy/constants";
import { FileText } from "lucide-react";

interface DocListProps {
  docs: StrategyDoc[];
}

export function DocList({ docs }: DocListProps) {
  const [selectedDoc, setSelectedDoc] = useState<StrategyDoc | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const docTypes = [...new Set(docs.map((d) => d.doc_type))];
  const existingTypes = docs.map((d) => d.doc_type);

  if (selectedDoc) {
    return (
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {showHistory ? "Hide" : "Show"} History
            </button>
          </div>
          <DocEditor
            doc={selectedDoc}
            onBack={() => setSelectedDoc(null)}
          />
        </div>
        {showHistory && (
          <div className="w-64 shrink-0 border-l pl-4">
            <VersionHistory
              docType={selectedDoc.doc_type}
              currentDocId={selectedDoc.id}
              onViewVersion={(doc) => setSelectedDoc(doc)}
            />
          </div>
        )}
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={FileText}
          title="No strategy documents yet"
          description="Create your first strategy document to get started."
        />
        <div className="flex justify-center">
          <CreateDocDialog existingTypes={[]} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {docs.length} document{docs.length !== 1 ? "s" : ""}
        </p>
        <CreateDocDialog existingTypes={existingTypes} />
      </div>

      {docTypes.length > 1 ? (
        <Tabs defaultValue={docTypes[0]}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {docTypes.map((type) => (
              <TabsTrigger key={type} value={type}>
                {DOC_TYPE_LABELS[type] || type}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="all">
            <DocGrid docs={docs} onSelect={setSelectedDoc} />
          </TabsContent>
          {docTypes.map((type) => (
            <TabsContent key={type} value={type}>
              <DocGrid
                docs={docs.filter((d) => d.doc_type === type)}
                onSelect={setSelectedDoc}
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <DocGrid docs={docs} onSelect={setSelectedDoc} />
      )}
    </div>
  );
}

function DocGrid({
  docs,
  onSelect,
}: {
  docs: StrategyDoc[];
  onSelect: (doc: StrategyDoc) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 pt-4">
      {docs.map((doc) => (
        <Card
          key={doc.id}
          className="cursor-pointer hover:ring-1 hover:ring-ring/20 transition-shadow"
          onClick={() => onSelect(doc)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-sm font-medium line-clamp-1">
                {doc.title}
              </CardTitle>
              <Badge variant="outline" className="text-[10px] shrink-0">
                v{doc.version}
              </Badge>
            </div>
            <Badge variant="secondary" className="w-fit text-[10px]">
              {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
            </Badge>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {doc.content
                ? doc.content.slice(0, 150) + (doc.content.length > 150 ? "..." : "")
                : "Empty document"}
            </p>
            <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>
                {doc.changed_by === "claude" ? "Claude" : "User"} &middot;{" "}
                {new Date(doc.updated_at).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
