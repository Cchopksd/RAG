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
    { label: "Visible sources", value: documents.length.toLocaleString(), icon: LibraryBig, detail: `${ACCESS_LABELS[access]} scope`, tone: "blue" },
    { label: "Retrieval units", value: totals.chunks.toLocaleString(), icon: Database, detail: "Vector + full text", tone: "lime" },
    { label: "Citable pages", value: totals.pages.toLocaleString(), icon: FileCheck2, detail: "Page-level evidence", tone: "orange" },
    { label: "Answer engine", value: health?.gemini_configured ? "Configured" : "Not ready", icon: Zap, detail: health?.database === "ok" ? "Database connected" : "Backend unavailable", tone: "violet" },
  ];

  return (
    <div className="view-stack">
      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Knowledge service unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="hero-card corpus-hero">
        <div className="hero-copy">
          <div className="eyebrow-badge"><Sparkles size={14} /> CORPUS READINESS</div>
          <h2>
            {documents.length ? "Your evidence is indexed." : "Build your evidence base."}
            <br />
            <span>{ready ? "Atlas is ready for grounded questions." : "Complete the next step to start retrieval."}</span>
          </h2>
          <p>
            {documents.length
              ? `${documents.length} sources provide ${totals.chunks.toLocaleString()} searchable chunks across ${totals.pages.toLocaleString()} citable pages.`
              : "Add policies, handbooks, and internal references so Atlas can retrieve evidence and cite the exact page."}
          </p>
          <div className="hero-actions">
            <Button size="lg" nativeButton={false} render={<Link href="/chat" />}><MessageSquareText data-icon="inline-start" /> Ask Atlas</Button>
            <Button size="lg" variant="outline" nativeButton={false} className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" render={<Link href="/sources?upload=1" />}><UploadCloud data-icon="inline-start" /> Add source</Button>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="visual-core"><Network size={38} /><span>EVIDENCE<br />GRAPH</span></div>
          <span className="node node-a">INGEST</span><span className="node node-b">RETRIEVE</span><span className="node node-c">CITE</span>
        </div>
      </Card>

      <section className="stats-grid" aria-label="Knowledge base metrics">
        {stats.map(({ label, value, icon: Icon, detail, tone }) => (
          <Card className="stat-card" key={label}>
            <div className={`stat-icon ${tone}`}><Icon size={20} /></div>
            <span>{label}</span>
            <strong>{value}</strong>
            <small><Activity size={12} /> {detail}</small>
          </Card>
        ))}
      </section>

      <div className="overview-grid">
        <Card className="content-card recent-card">
          <CardHeader className="section-heading p-0">
            <div><span className="overline">EVIDENCE CATALOG</span><h3>Recently indexed sources</h3></div>
            <Button variant="link" nativeButton={false} render={<Link href="/sources" />}>Manage sources <ArrowRight size={15} /></Button>
          </CardHeader>
          <CardContent className="recent-list p-0">
            {documents.slice(0, 4).map((document) => (
              <a className="recent-source" key={document.id} href={sourceUrl(document.id)} target="_blank" rel="noreferrer">
                <div className="file-icon"><FileText size={19} /></div>
                <div className="file-details"><strong>{document.title}</strong><span>{document.filename}</span></div>
                <div className="file-stats"><span>{document.page_count} pages</span><span>{document.chunk_count} chunks</span></div>
                <Badge variant="outline" className={`classification ${document.classification}`}>{document.classification}</Badge>
                <ExternalLink size={16} />
              </a>
            ))}
            {!documents.length && <EmptySources />}
          </CardContent>
        </Card>

        <Card className="content-card pipeline-card">
          <CardHeader className="section-heading p-0">
            <div><span className="overline">ANSWER PIPELINE</span><CardTitle>How evidence becomes an answer</CardTitle></div>
            <ShieldCheck size={18} aria-hidden="true" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="pipeline">
            {[
              [HardDriveUpload, "Ingest", "Parse PDF pages"],
              [Database, "Index", "Embed searchable chunks"],
              [FileSearch, "Retrieve", "Fuse semantic + keyword results"],
              [Bot, "Answer", "Generate with page citations"],
            ].map(([Icon, title, detail], index) => (
              <div className="pipeline-step" key={String(title)}>
                <div><Icon size={18} /></div><span><strong>{String(title)}</strong><small>{String(detail)}</small></span>
                {index < 3 && <ArrowRight size={15} />}
              </div>
            ))}
            </div>
            <Alert className={`readiness ${ready ? "complete" : ""}`}>
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
