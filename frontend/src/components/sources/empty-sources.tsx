import { FileSearch, UploadCloud } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function EmptySources({ filtered = false }: { filtered?: boolean }) {
  return (
    <div className="grid min-h-56 place-content-center justify-items-center p-6 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><FileSearch size={25} /></div>
      <strong className="text-sm">{filtered ? "No matching sources" : "Your knowledge base is empty"}</strong>
      <p className="mt-1 mb-3 max-w-sm text-xs leading-relaxed text-muted-foreground">{filtered ? "Try a different title or classification." : "Upload a text-based PDF to create the first searchable index."}</p>
      {!filtered && (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/sources?upload=1" />}>
          <UploadCloud data-icon="inline-start" /> Upload PDF
        </Button>
      )}
    </div>
  );
}
