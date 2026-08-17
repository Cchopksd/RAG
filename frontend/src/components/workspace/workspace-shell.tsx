"use client";

import { Menu, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";

import { AccessSelector } from "./access-selector";
import { NAV_ITEMS } from "./workspace-config";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AccessLevel, Health } from "@/lib/types";

export function WorkspaceShell({
  access,
  health,
  children,
}: {
  access: AccessLevel;
  health: Health | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const currentPage = NAV_ITEMS.find((item) => item.href === pathname) ?? NAV_ITEMS[0];
  const systemReady = health?.status === "ok" && health.gemini_configured;

  return (
    <div className="app-shell">
      <WorkspaceSidebar pathname={pathname} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-title">
            <Button className="mobile-menu" variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </Button>
            <div>
              <span className="overline">ATLAS KNOWLEDGE WORKSPACE</span>
              <h1>{currentPage.label}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <Badge variant="outline" className={`system-pill ${systemReady ? "ready" : "warning"}`}>
              <span className="status-dot" />
              {systemReady ? "Retrieval ready" : health ? "Configuration needed" : "Service offline"}
            </Badge>
            <AccessSelector value={access} />
            <Button size="sm" nativeButton={false} render={<Link href="/sources?upload=1" />}>
              <Plus data-icon="inline-start" /> Add source
            </Button>
          </div>
        </header>

        <main className="workspace-content">{children}</main>
      </div>
    </div>
  );
}
