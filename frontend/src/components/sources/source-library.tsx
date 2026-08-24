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
import { Card, CardContent, CardFooter } from "@/components/ui/card";
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

const dateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

function SourceActions({
  document,
  access,
  deleting,
  onDelete,
}: {
  document: DocumentRecord;
  access: AccessLevel;
  deleting: boolean;
  onDelete: (document: DocumentRecord) => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button variant="outline" size="icon" nativeButton={false} render={<a href={sourceUrl(document.id)} target="_blank" rel="noreferrer" />} aria-label={`Open ${document.title}`}><ExternalLink /></Button>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="destructive"
              size="icon"
              disabled={access !== "confidential" || deleting}
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
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={() => onDelete(document)}>
              {deleting ? "Removing…" : "Remove source"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

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
    <div className="grid gap-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="text-xs font-semibold tracking-widest text-muted-foreground">EVIDENCE CATALOG</span>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">Source documents</h2>
          <p className="mt-1 text-sm text-muted-foreground">Control which documents Atlas can retrieve, quote, and cite.</p>
        </div>
        <Button className="w-full sm:w-auto" size="lg" onClick={() => router.push("/sources?upload=1", { scroll: false })}><Plus data-icon="inline-start" /> Add source</Button>
      </section>

      {loadError && <Alert variant="destructive"><AlertDescription>{loadError}</AlertDescription></Alert>}

      <Card className="flex-row flex-wrap items-center gap-2 p-3" aria-label="Source filters">
        <label className="relative min-w-0 flex-1 max-sm:basis-full">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 z-10 -translate-y-1/2 text-muted-foreground" size={16} />
          <span className="sr-only">Search documents</span>
          <Input className="bg-background pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title or filename…" />
        </label>
        <Select value={classification} onValueChange={(value) => setClassification(value as "all" | AccessLevel)}>
          <SelectTrigger className="w-48 max-w-full bg-background" aria-label="Filter by classification">
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
          <RefreshCw className={refreshing ? "animate-spin" : undefined} size={17} />
        </Button>
        <span className="ml-auto text-xs text-muted-foreground max-sm:hidden">{filtered.length} of {initialDocuments.length} source{initialDocuments.length === 1 ? "" : "s"}</span>
      </Card>

      <div className="grid gap-3 sm:hidden" aria-label="Indexed sources">
        {filtered.map((document) => (
          <Card key={document.id} size="sm" className="gap-0 py-0">
            <CardContent className="p-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-md border border-orange-200 bg-orange-50 font-mono text-[0.625rem] font-bold text-orange-600">PDF</div>
                <div className="min-w-0 flex-1">
                  <strong className="line-clamp-2 text-sm leading-snug">{document.title}</strong>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{document.filename}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3">
                <div>
                  <span className="block text-[0.6875rem] text-muted-foreground">Classification</span>
                  <Badge variant="outline" className="mt-1 capitalize"><ShieldCheck size={12} /> {document.classification}</Badge>
                </div>
                <div>
                  <span className="block text-[0.6875rem] text-muted-foreground">Index</span>
                  <strong className="mt-1 block text-sm">{document.chunk_count} chunks</strong>
                  <span className="text-xs text-muted-foreground">{document.page_count} citable pages</span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="justify-between gap-3 px-4 py-3">
              <span className="text-xs text-muted-foreground">Added {dateFormatter.format(new Date(document.created_at))}</span>
              <SourceActions document={document} access={access} deleting={deletingId === document.id} onDelete={(item) => void handleDelete(item)} />
            </CardFooter>
          </Card>
        ))}
        {!filtered.length && <Card><EmptySources filtered={Boolean(search || classification !== "all")} /></Card>}
      </div>

      <Card className="hidden max-w-full overflow-hidden py-0 sm:flex" aria-label="Indexed sources">
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
                <div className="grid min-w-52 grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3"><div className="grid h-10 place-items-center rounded-md border border-orange-200 bg-orange-50 font-mono text-[0.625rem] font-bold text-orange-600">PDF</div><div className="grid min-w-0"><strong className="truncate text-sm">{document.title}</strong><span className="truncate text-xs text-muted-foreground">{document.filename}</span></div></div>
              </TableCell>
              <TableCell><Badge variant="outline" className="capitalize"><ShieldCheck size={12} /> {document.classification}</Badge></TableCell>
              <TableCell><div className="grid"><strong className="text-sm">{document.chunk_count} chunks</strong><span className="text-xs text-muted-foreground">{document.page_count} citable pages</span></div></TableCell>
              <TableCell className="text-xs text-muted-foreground">{dateFormatter.format(new Date(document.created_at))}</TableCell>
              <TableCell>
                <SourceActions document={document} access={access} deleting={deletingId === document.id} onDelete={(item) => void handleDelete(item)} />
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
      {toast && <Alert className="fixed right-4 bottom-4 z-50 w-auto max-w-sm bg-foreground text-background shadow-lg" role="status"><Check size={17} /><AlertDescription>{toast}</AlertDescription></Alert>}
    </div>
  );
}
