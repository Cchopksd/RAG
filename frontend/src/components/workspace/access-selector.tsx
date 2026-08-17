"use client";

import { LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setAccessLevelAction } from "@/actions/rag";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACCESS_LABELS } from "./workspace-config";
import type { AccessLevel } from "@/lib/types";

export function AccessSelector({ value }: { value: AccessLevel }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function changeAccess(nextAccess: AccessLevel) {
    startTransition(async () => {
      const result = await setAccessLevelAction(nextAccess);
      if (result.ok) router.refresh();
    });
  }

  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(nextAccess) => changeAccess(nextAccess as AccessLevel)}
    >
      <SelectTrigger
        className="w-[148px] bg-card"
        aria-label={pending ? "Updating access level" : "Access level"}
      >
        <LockKeyhole aria-hidden="true" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {Object.entries(ACCESS_LABELS).map(([level, label]) => (
          <SelectItem key={level} value={level}>
            {label} access
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
