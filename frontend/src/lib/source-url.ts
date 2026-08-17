export function sourceUrl(id: string, page?: number) {
  const fragment = page ? `#page=${page}` : "";
  return `/source/${encodeURIComponent(id)}${fragment}`;
}
