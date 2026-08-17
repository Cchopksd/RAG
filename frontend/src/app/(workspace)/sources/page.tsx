import type { Metadata } from "next";

import { getAccessLevelAction, getDocumentsAction } from "@/actions/rag";
import { SourceLibrary } from "@/components/sources/source-library";

export const metadata: Metadata = {
  title: "Sources — Atlas",
  description: "Manage the documents available to retrieval and citation.",
};

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ upload?: string }>;
}) {
  const [access, documentsResult, params] = await Promise.all([
    getAccessLevelAction(),
    getDocumentsAction(),
    searchParams,
  ]);

  return (
    <SourceLibrary
      initialDocuments={documentsResult.ok ? documentsResult.data : []}
      access={access}
      initialUploadOpen={params.upload === "1"}
      loadError={documentsResult.ok ? null : documentsResult.error}
    />
  );
}
