import "server-only";

import { cookies } from "next/headers";

import type { AccessLevel } from "./types";

export const ACCESS_COOKIE = "atlas-access";

export function isAccessLevel(value: unknown): value is AccessLevel {
  return value === "public" || value === "internal" || value === "confidential";
}

export async function getCurrentAccessLevel(): Promise<AccessLevel> {
  const value = (await cookies()).get(ACCESS_COOKIE)?.value;
  return isAccessLevel(value) ? value : "public";
}
