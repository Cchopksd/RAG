"use client";

import {
  CircleAlert,
  FileCheck2,
  LoaderCircle,
  ShieldCheck,
  UploadCloud,
  Zap,
} from "lucide-react";
import { type FormEvent, useRef, useState } from "react";

import { uploadDocumentAction } from "@/actions/rag";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccessLevel, DocumentRecord } from "@/lib/types";

export function UploadDialog({
  access,
  onClose,
  onUploaded,
}: {
  access: AccessLevel;
  onClose: () => void;
  onUploaded: (document: DocumentRecord) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [classification, setClassification] = useState<AccessLevel>(access);
  const [department, setDepartment] = useState("");
  const [organization, setOrganization] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function chooseFile(candidate?: File) {
    if (!candidate) return;
    if (candidate.type !== "application/pdf" && !candidate.name.toLowerCase().endsWith(".pdf")) {
      setError("Choose a PDF document.");
      return;
    }
    if (candidate.size > 25 * 1024 * 1024) {
      setError("The PDF must be smaller than 25 MB.");
      return;
    }
    setFile(candidate);
    setError(null);
    if (!title) setTitle(candidate.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " "));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Select a PDF to continue.");
      return;
    }
    setUploading(true);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    body.append("title", title);
    body.append("classification", classification);
    body.append("metadata_json", JSON.stringify({
      organization,
      department,
      year: Number(year) || year,
      language: "en",
    }));
    const result = await uploadDocumentAction(body);
    if (result.ok) {
      onUploaded(result.data);
      return;
    }
    setError(result.error);
    setUploading(false);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !uploading) onClose(); }}>
      <DialogContent className="max-h-[calc(100vh-2rem)] sm:max-w-3xl overflow-y-auto p-0" showCloseButton={!uploading}>
        <DialogHeader className="border-b p-6 pr-14">
          <span className="overline">KNOWLEDGE INGESTION</span>
          <DialogTitle className="text-2xl">Add a source</DialogTitle>
          <DialogDescription>Atlas will parse, chunk, embed, and index your document.</DialogDescription>
        </DialogHeader>
        <form className="px-6" onSubmit={(event) => void submit(event)}>
          <div
            className={`upload-dropzone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              chooseFile(event.dataTransfer.files[0]);
            }}
          >
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={(event) => chooseFile(event.target.files?.[0])} />
            {file ? (
              <>
                <div className="selected-file-icon"><FileCheck2 size={25} /></div>
                <strong>{file.name}</strong>
                <span>{(file.size / 1024 / 1024).toFixed(2)} MB · Ready to index</span>
                <Button variant="link" size="sm" type="button" onClick={(event) => { event.stopPropagation(); setFile(null); }}>Choose another file</Button>
              </>
            ) : (
              <>
                <div className="upload-cloud"><UploadCloud size={27} /></div>
                <strong>Drop your PDF here</strong>
                <span>or click to browse · text-based PDFs up to 25 MB</span>
              </>
            )}
          </div>
          <div className="form-grid">
            <Label className="full grid gap-2">Document title<Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. 2026 Staff Handbook" required /></Label>
            <Label className="grid gap-2">Organization<Input value={organization} onChange={(event) => setOrganization(event.target.value)} placeholder="Clark Atlanta University" /></Label>
            <Label className="grid gap-2">Department<Input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="Human Resources" /></Label>
            <div className="grid gap-2">
              <Label>Classification</Label>
              <Select value={classification} onValueChange={(value) => setClassification(value as AccessLevel)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="confidential">Confidential</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Label className="grid gap-2">Document year<Input value={year} onChange={(event) => setYear(event.target.value)} inputMode="numeric" /></Label>
          </div>
          {error && <Alert className="mt-4" variant="destructive"><CircleAlert /><AlertDescription>{error}</AlertDescription></Alert>}
          <DialogFooter className="mt-6">
            <div><ShieldCheck size={16} /><span>The file stays in your configured storage.</span></div>
            <Button type="button" variant="outline" onClick={onClose} disabled={uploading}>Cancel</Button>
            <Button type="submit" disabled={!file || !title.trim() || uploading}>
              {uploading ? <><LoaderCircle className="spin" size={18} /> Indexing document…</> : <><Zap size={18} /> Index source</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
