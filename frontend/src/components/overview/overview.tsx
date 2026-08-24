import {
  Activity,
  ArrowRight,
  Bot,
  Check,
  CircleAlert,
  Database,
  ExternalLink,
  FileCheck2,
  FileSearch,
  FileText,
  HardDriveUpload,
  LibraryBig,
  MessageSquareText,
  Network,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Zap,
} from "lucide-react";
import Link from "next/link";

import { ACCESS_LABELS } from "@/components/workspace/workspace-config";
import { EmptySources } from "@/components/sources/empty-sources";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sourceUrl } from "@/lib/source-url";
import type { AccessLevel, DocumentRecord, Health } from "@/lib/types";

export function Overview({
  documents,
  health,
  access,
  error,
}: {
  documents: DocumentRecord[];
  health: Health | null;
  access: AccessLevel;
  error: string | null;
}) {
  const totals = documents.reduce(
    (sum, document) => ({
      pages: sum.pages + document.page_count,
      chunks: sum.chunks + document.chunk_count,
    }),
    { pages: 0, chunks: 0 },
  );
  const ready = health?.status === "ok" && health.gemini_configured && documents.length > 0;

  const stats = [
    { label: "Visible sources", value: documents.length.toLocaleString(), icon: LibraryBig, detail: `${ACCESS_LABELS[access]} scope`, tone: "bg-primary/10 text-primary" },
    { label: "Retrieval units", value: totals.chunks.toLocaleString(), icon: Database, detail: "Vector + full text", tone: "bg-lime-100 text-lime-800" },
    { label: "Citable pages", value: totals.pages.toLocaleString(), icon: FileCheck2, detail: "Page-level evidence", tone: "bg-orange-100 text-orange-700" },
    { label: "Answer engine", value: health?.gemini_configured ? "Configured" : "Not ready", icon: Zap, detail: health?.database === "ok" ? "Database connected" : "Backend unavailable", tone: "bg-violet-100 text-violet-700" },
  ];

  return (
    <div className="grid gap-6">
      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Knowledge service unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="relative grid min-h-[22rem] overflow-hidden border-0 bg-sidebar px-6 py-10 text-sidebar-foreground shadow-xl sm:px-10 lg:grid-cols-[1.2fr_.8fr] lg:px-12">
        <div className="relative z-10 self-center">
          <Badge variant="outline" className="mb-5 border-sidebar-border bg-sidebar-accent text-sidebar-primary"><Sparkles size={14} /> CORPUS READINESS</Badge>
          <h2 className="max-w-4xl text-4xl leading-[1.02] font-semibold tracking-[-0.055em] sm:text-5xl lg:text-6xl">
            {documents.length ? "Your evidence is indexed." : "Build your evidence base."}
            <br />
            <span className="text-sidebar-foreground/55">{ready ? "Atlas is ready for grounded questions." : "Complete the next step to start retrieval."}</span>
          </h2>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-sidebar-foreground/65">
            {documents.length
              ? `${documents.length} sources provide ${totals.chunks.toLocaleString()} searchable chunks across ${totals.pages.toLocaleString()} citable pages.`
              : "Add policies, handbooks, and internal references so Atlas can retrieve evidence and cite the exact page."}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button size="lg" nativeButton={false} render={<Link href="/chat" />}><MessageSquareText data-icon="inline-start" /> Ask Atlas</Button>
            <Button size="lg" variant="outline" nativeButton={false} className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" render={<Link href="/sources?upload=1" />}><UploadCloud data-icon="inline-start" /> Add source</Button>
          </div>
        </div>
        <div className="relative hidden min-h-64 lg:block" aria-hidden="true">
          <div className="absolute top-1/2 left-1/2 size-72 -translate-1/2 rounded-full border border-sidebar-border/70" />
          <div className="absolute top-1/2 left-1/2 size-48 -translate-1/2 rounded-full border border-sidebar-border" />
          <div className="absolute top-1/2 left-1/2 z-10 grid size-32 -translate-1/2 place-content-center gap-2 rounded-full border-8 border-sidebar-primary/20 bg-sidebar-primary text-center text-sidebar-primary-foreground shadow-2xl"><Network className="mx-auto" size={38} /><span className="font-mono text-[0.625rem] font-bold tracking-widest">EVIDENCE<br />GRAPH</span></div>
        </div>
      </Card>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Knowledge base metrics">
        {stats.map(({ label, value, icon: Icon, detail, tone }) => (
          <Card className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 p-4" key={label}>
            <div className={`row-span-3 grid size-10 place-items-center rounded-lg ${tone}`}><Icon size={20} /></div>
            <span className="text-xs text-muted-foreground">{label}</span>
            <strong className="truncate text-xl tracking-tight">{value}</strong>
            <small className="hidden items-center gap-1 text-[0.6875rem] text-muted-foreground sm:flex"><Activity size={12} /> {detail}</small>
          </Card>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div><span className="text-xs font-semibold tracking-widest text-muted-foreground">EVIDENCE CATALOG</span><h3 className="mt-1 text-lg font-semibold">Recently indexed sources</h3></div>
            <Button variant="link" nativeButton={false} render={<Link href="/sources" />}>Manage sources <ArrowRight size={15} /></Button>
          </CardHeader>
          <CardContent className="grid">
            {documents.slice(0, 4).map((document) => (
              <a className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 border-t py-3 transition-colors hover:bg-muted/50 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] sm:px-2" key={document.id} href={sourceUrl(document.id)} target="_blank" rel="noreferrer">
                <div className="grid size-9 place-items-center rounded-lg bg-orange-50 text-orange-600"><FileText size={19} /></div>
                <div className="grid min-w-0"><strong className="truncate text-sm">{document.title}</strong><span className="truncate text-xs text-muted-foreground">{document.filename}</span></div>
                <div className="hidden gap-3 text-xs text-muted-foreground md:flex"><span>{document.page_count} pages</span><span>{document.chunk_count} chunks</span></div>
                <div className="flex items-center gap-2"><Badge variant="outline" className="hidden capitalize sm:inline-flex">{document.classification}</Badge><ExternalLink size={16} /></div>
              </a>
            ))}
            {!documents.length && <EmptySources />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div><span className="text-xs font-semibold tracking-widest text-muted-foreground">ANSWER PIPELINE</span><CardTitle className="mt-1">How evidence becomes an answer</CardTitle></div>
            <ShieldCheck size={18} aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="grid">
            {[
              [HardDriveUpload, "Ingest", "Parse PDF pages"],
              [Database, "Index", "Embed searchable chunks"],
              [FileSearch, "Retrieve", "Fuse semantic + keyword results"],
              [Bot, "Answer", "Generate with page citations"],
            ].map(([Icon, title, detail], index) => (
              <div className="grid min-h-14 grid-cols-[2.25rem_minmax(0,1fr)_1rem] items-center gap-3" key={String(title)}>
                <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Icon size={18} /></div><span className="grid"><strong className="text-sm">{String(title)}</strong><small className="text-xs text-muted-foreground">{String(detail)}</small></span>
                {index < 3 && <ArrowRight className="text-muted-foreground" size={15} />}
              </div>
            ))}
            </div>
            <Alert className="mt-4">
              {ready ? <Check size={17} /> : <CircleAlert size={17} />}
              <AlertTitle>{ready ? "Ready for grounded answers" : "Retrieval setup is incomplete"}</AlertTitle>
              <AlertDescription>{ready ? "Database, Gemini, and evidence are available." : "Check the service configuration and add at least one source."}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
