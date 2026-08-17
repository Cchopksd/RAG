import {
  ArrowRight,
  Network,
  PanelLeftClose,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NAV_ITEMS } from "./workspace-config";

export function WorkspaceSidebar({
  pathname,
  open,
  onClose,
}: {
  pathname: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <button
        className={`sidebar-scrim ${open ? "visible" : ""}`}
        onClick={onClose}
        aria-label="Close menu"
      />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Network size={20} /></div>
          <div><strong>ATLAS</strong><span>KNOWLEDGE OS</span></div>
          <Button className="close-sidebar" variant="ghost" size="icon" onClick={onClose} aria-label="Close menu">
            <PanelLeftClose size={18} />
          </Button>
        </div>

        <nav className="main-nav" aria-label="Workspace navigation">
          <span className="nav-label">WORKSPACE</span>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Button
                key={item.href}
                className={active ? "active" : ""}
                variant={active ? "secondary" : "ghost"}
                nativeButton={false}
                render={<Link href={item.href} />}
                onClick={onClose}
              >
                <Icon size={19} />
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
                {active && <ArrowRight size={16} />}
              </Button>
            );
          })}
        </nav>

        <Card className="sidebar-ingest">
          <CardContent className="p-0">
            <div className="ingest-icon"><UploadCloud size={20} /></div>
            <strong>Grow your knowledge base</strong>
            <p>Index a policy, handbook, or internal reference.</p>
            <Button variant="link" className="h-auto p-0 text-white" nativeButton={false} render={<Link href="/sources?upload=1" />} onClick={onClose}>
              Upload PDF <ArrowRight size={15} />
            </Button>
          </CardContent>
        </Card>

        <div className="sidebar-footer">
          <div className="avatar">TG</div>
          <div><strong>Workspace admin</strong><span>Local environment</span></div>
          <ShieldCheck size={17} />
        </div>
      </aside>
    </>
  );
}
