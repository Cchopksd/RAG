"use client";

import { CircleAlert, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function WorkspaceError() {
  return (
    <Alert className="route-error" variant="destructive">
      <CircleAlert size={24} />
      <div>
        <AlertTitle>This workspace could not be rendered</AlertTitle>
        <AlertDescription>The knowledge service may be temporarily unavailable. Try loading this page again.</AlertDescription>
      </div>
      <Button variant="outline" type="button" onClick={() => window.location.reload()}><RefreshCw data-icon="inline-start" /> Reload workspace</Button>
    </Alert>
  );
}
