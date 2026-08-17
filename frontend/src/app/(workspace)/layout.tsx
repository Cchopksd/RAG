import type { ReactNode } from "react";

import { getAccessLevelAction, getHealthAction } from "@/actions/rag";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const [access, healthResult] = await Promise.all([
    getAccessLevelAction(),
    getHealthAction(),
  ]);

  return (
    <WorkspaceShell access={access} health={healthResult.ok ? healthResult.data : null}>
      {children}
    </WorkspaceShell>
  );
}
