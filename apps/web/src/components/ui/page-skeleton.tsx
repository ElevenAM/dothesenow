import { Skeleton } from "@/components/ui/skeleton";

type SkeletonVariant = "table" | "cards" | "editor";

interface PageSkeletonProps {
  variant: SkeletonVariant;
}

function HeadingSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-6">
      <HeadingSkeleton />
      <div className="rounded-lg border">
        <div className="border-b p-4">
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20" />
            ))}
          </div>
        </div>
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className="space-y-6">
      <HeadingSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="space-y-6">
      <HeadingSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <div className="flex items-center gap-2 pt-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const VARIANT_MAP: Record<SkeletonVariant, () => React.JSX.Element> = {
  table: TableSkeleton,
  cards: CardsSkeleton,
  editor: EditorSkeleton,
};

export function PageSkeleton({ variant }: PageSkeletonProps) {
  const SkeletonComponent = VARIANT_MAP[variant];
  return <SkeletonComponent />;
}
