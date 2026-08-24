import { ArrowRight, Network, PanelLeftClose, ShieldCheck, UploadCloud } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { NAV_ITEMS } from "./workspace-config";

export function WorkspaceSidebar({ pathname }: { pathname: string }) {
  const { isMobile, toggleSidebar } = useSidebar();

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Network size={20} /></div>
          <div className="min-w-0 flex-1"><strong className="block text-base tracking-[.18em]">ATLAS</strong><span className="block text-[0.5rem] tracking-[.16em] text-sidebar-foreground/55">KNOWLEDGE OS</span></div>
          {isMobile && <Button variant="ghost" size="icon-sm" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={toggleSidebar} aria-label="Close menu"><PanelLeftClose size={18} /></Button>}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pt-5">
          <SidebarGroupLabel className="px-2 text-[0.625rem] tracking-[.15em] text-sidebar-foreground/50">WORKSPACE</SidebarGroupLabel>
          <SidebarMenu className="gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return <SidebarMenuItem key={item.href}>
                <SidebarMenuButton render={<Link href={item.href} />} isActive={active} size="lg" tooltip={item.label} onClick={() => { if (isMobile) toggleSidebar(); }} className="h-auto min-h-12 items-start py-2.5 text-sidebar-foreground/65 hover:text-sidebar-accent-foreground data-active:border-l-3 data-active:border-sidebar-primary data-active:text-sidebar-accent-foreground">
                  <Icon className="mt-0.5" size={19} />
                  <span className="grid min-w-0 gap-0.5 text-left"><span className="truncate text-sm font-semibold">{item.label}</span><span className="truncate text-[0.625rem] text-sidebar-foreground/50">{item.description}</span></span>
                  {active && <ArrowRight className="ml-auto mt-0.5" size={16} />}
                </SidebarMenuButton>
              </SidebarMenuItem>;
            })}
          </SidebarMenu>
        </SidebarGroup>

        <div className="mt-auto p-3 pt-0">
          <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-4">
            <div className="mb-3 grid size-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><UploadCloud size={20} /></div>
            <strong className="text-xs">Grow your knowledge base</strong><p className="my-2 text-xs leading-relaxed text-sidebar-foreground/60">Index a policy, handbook, or internal reference.</p>
            <Button variant="link" size="sm" className="h-auto p-0 text-sidebar-foreground hover:text-sidebar-primary" nativeButton={false} render={<Link href="/sources?upload=1" />} onClick={() => { if (isMobile) toggleSidebar(); }}>Upload PDF <ArrowRight size={15} /></Button>
          </div>
        </div>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4"><div className="grid grid-cols-[2rem_minmax(0,1fr)_1.125rem] items-center gap-2"><div className="grid size-8 place-items-center rounded-lg bg-sidebar-foreground text-[0.625rem] font-bold text-sidebar">TG</div><div className="min-w-0"><strong className="block truncate text-xs">Workspace admin</strong><span className="block truncate text-[0.625rem] text-sidebar-foreground/50">Local environment</span></div><ShieldCheck className="text-sidebar-foreground/50" size={17} /></div></SidebarFooter>
    </Sidebar>
  );
}
