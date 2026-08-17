import { FileSearch, UploadCloud } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function EmptySources({ filtered = false }: { filtered?: boolean }) {
  return (
    <div className="empty-sources">
      <div><FileSearch size={25} /></div>
      <strong>{filtered ? "No matching sources" : "Your knowledge base is empty"}</strong>
      <p>{filtered ? "Try a different title or classification." : "Upload a text-based PDF to create the first searchable index."}</p>
      {!filtered && (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/sources?upload=1" />}>
          <UploadCloud data-icon="inline-start" /> Upload PDF
        </Button>
      )}
    </div>
  );
}
