"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

import { AccessSelector } from "./access-selector";
import { NAV_ITEMS } from "./workspace-config";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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
  const currentPage = NAV_ITEMS.find((item) => item.href === pathname) ?? NAV_ITEMS[0];
  const systemReady = health?.status === "ok" && health.gemini_configured;

  return (
    <SidebarProvider>
      <WorkspaceSidebar pathname={pathname} />

      <SidebarInset>
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-4 border-b bg-background/90 px-4 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger />
            <div>
              <span className="block text-[0.625rem] font-semibold tracking-widest text-muted-foreground max-sm:hidden">ATLAS KNOWLEDGE WORKSPACE</span>
              <h1 className="truncate text-lg font-semibold tracking-tight">{currentPage.label}</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline" className="gap-2 max-lg:hidden">
              <span className={`size-2 rounded-full ${systemReady ? "bg-emerald-500" : "bg-orange-500"}`} />
              {systemReady ? "Retrieval ready" : health ? "Configuration needed" : "Service offline"}
            </Badge>
            <AccessSelector value={access} />
            {pathname !== "/sources" && (
              <Button className="max-sm:size-8 max-sm:px-0" size="sm" nativeButton={false} render={<Link href="/sources?upload=1" />} aria-label="Add source">
                <Plus data-icon="inline-start" /> <span className="max-sm:sr-only">Add source</span>
              </Button>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1660px] p-4 pb-10 sm:p-6 sm:pb-12">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
