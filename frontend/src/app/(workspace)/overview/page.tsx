import type { Metadata } from "next";

import { getAccessLevelAction, getDocumentsAction, getHealthAction } from "@/actions/rag";
import { Overview } from "@/components/overview/overview";

export const metadata: Metadata = {
  title: "Overview — Atlas",
  description: "Monitor knowledge coverage and retrieval readiness.",
};

export default async function OverviewPage() {
  const [access, documentsResult, healthResult] = await Promise.all([
    getAccessLevelAction(),
    getDocumentsAction(),
    getHealthAction(),
  ]);

  return (
    <Overview
      access={access}
      documents={documentsResult.ok ? documentsResult.data : []}
      health={healthResult.ok ? healthResult.data : null}
      error={!documentsResult.ok ? documentsResult.error : !healthResult.ok ? healthResult.error : null}
    />
  );
}
