import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="page-loading" role="status" aria-label="Loading workspace">
      <Skeleton className="page-loading-heading" />
      <div className="page-loading-grid">
        <Skeleton /><Skeleton /><Skeleton /><Skeleton />
      </div>
      <Skeleton className="page-loading-panel" />
    </div>
  );
}
