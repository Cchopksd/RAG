import { LayoutDashboard, LibraryBig, MessageSquareText } from "lucide-react";

import type { AccessLevel } from "@/lib/types";

export const ACCESS_LABELS: Record<AccessLevel, string> = {
  public: "Public",
  internal: "Internal",
  confidential: "Confidential",
};

export const NAV_ITEMS: Array<{
  href: string;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
}> = [
  { href: "/overview", label: "Overview", description: "System and corpus", icon: LayoutDashboard },
  { href: "/chat", label: "Ask Atlas", description: "Grounded answers", icon: MessageSquareText },
  { href: "/sources", label: "Sources", description: "Manage documents", icon: LibraryBig },
];
