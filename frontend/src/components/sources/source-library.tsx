"use client";

import {
  Check,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { deleteDocumentAction } from "@/actions/rag";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptySources } from "./empty-sources";
import { UploadDialog } from "./upload-dialog";
import { sourceUrl } from "@/lib/source-url";
import type { AccessLevel, DocumentRecord } from "@/lib/types";

export function SourceLibrary({
  initialDocuments,
  access,
  initialUploadOpen,
  loadError,
}: {
  initialDocuments: DocumentRecord[];
  access: AccessLevel;
  initialUploadOpen: boolean;
  loadError: string | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [classification, setClassification] = useState<"all" | AccessLevel>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const filtered = initialDocuments.filter((document) => {
    const matchesSearch = `${document.title} ${document.filename}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (classification === "all" || document.classification === classification);
  });

  function closeUpload() {
    router.replace("/sources", { scroll: false });
  }

  async function handleDelete(document: DocumentRecord) {
    setDeletingId(document.id);
    const result = await deleteDocumentAction(document.id);
    setDeletingId(null);
    if (!result.ok) {
      setToast(result.error);
      return;
    }
    setToast("Source and indexed chunks removed.");
    router.refresh();
  }

  return (
    <div className="view-stack source-view">
      <section className="library-heading">
        <div>
          <span className="overline">EVIDENCE CATALOG</span>
          <h2>Source documents</h2>
          <p>Control which documents Atlas can retrieve, quote, and cite.</p>
        </div>
        <Button size="lg" onClick={() => router.push("/sources?upload=1", { scroll: false })}><Plus data-icon="inline-start" /> Add source</Button>
      </section>

      {loadError && <Alert variant="destructive"><AlertDescription>{loadError}</AlertDescription></Alert>}

      <section className="library-toolbar" aria-label="Source filters">
        <label className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 z-10 -translate-y-1/2 text-muted-foreground" size={16} />
          <span className="sr-only">Search documents</span>
          <Input className="bg-card pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title or filename…" />
        </label>
        <Select value={classification} onValueChange={(value) => setClassification(value as "all" | AccessLevel)}>
          <SelectTrigger className="w-48 bg-card" aria-label="Filter by classification">
            <ShieldCheck aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classifications</SelectItem>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
            <SelectItem value="confidential">Confidential</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => startRefresh(() => router.refresh())}
          aria-label="Refresh sources"
          disabled={refreshing}
        >
          <RefreshCw className={refreshing ? "spin" : undefined} size={17} />
        </Button>
        <span className="result-count">{filtered.length} of {initialDocuments.length} source{initialDocuments.length === 1 ? "" : "s"}</span>
      </section>

      <Card className="source-table-card py-0" aria-label="Indexed sources">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Classification</TableHead>
              <TableHead>Index</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {filtered.map((document) => (
            <TableRow key={document.id}>
              <TableCell>
                <div className="document-cell"><div className="pdf-mark">PDF</div><div><strong>{document.title}</strong><span>{document.filename}</span></div></div>
              </TableCell>
              <TableCell><Badge variant="outline" className={`classification ${document.classification}`}><ShieldCheck size={12} /> {document.classification}</Badge></TableCell>
              <TableCell><div className="index-cell"><strong>{document.chunk_count} chunks</strong><span>{document.page_count} citable pages</span></div></TableCell>
              <TableCell className="date-cell">{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(document.created_at))}</TableCell>
              <TableCell>
                <div className="row-actions justify-end">
                  <Button variant="outline" size="icon" nativeButton={false} render={<a href={sourceUrl(document.id)} target="_blank" rel="noreferrer" />} aria-label={`Open ${document.title}`}><ExternalLink /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button
                          variant="destructive"
                          size="icon"
                          disabled={access !== "confidential" || deletingId === document.id}
                          title={access !== "confidential" ? "Confidential access required" : "Delete source"}
                          aria-label={`Delete ${document.title}`}
                        />
                      }
                    >
                      <Trash2 />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove this source?</AlertDialogTitle>
                        <AlertDialogDescription>
                          “{document.title}” and all of its indexed chunks will be permanently removed.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={deletingId === document.id}>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" disabled={deletingId === document.id} onClick={() => void handleDelete(document)}>
                          {deletingId === document.id ? "Removing…" : "Remove source"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {!filtered.length && (
            <TableRow>
              <TableCell colSpan={5}><EmptySources filtered={Boolean(search || classification !== "all")} /></TableCell>
            </TableRow>
          )}
          </TableBody>
        </Table>
      </Card>

      {initialUploadOpen && (
        <UploadDialog
          access={access}
          onClose={closeUpload}
          onUploaded={(document) => {
            closeUpload();
            setToast(`Indexed ${document.chunk_count} chunks from ${document.title}.`);
            router.refresh();
          }}
        />
      )}
      {toast && <div className="toast" role="status"><Check size={17} /> {toast}</div>}
    </div>
  );
}
