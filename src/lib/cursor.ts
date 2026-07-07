export type Cursor = { createdAt: string; id: string };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.createdAt}|${c.id}`).toString("base64url");
}

export function decodeCursor(raw: string): Cursor | null {
  if (!raw) return null;
  try {
    const [createdAt, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
    if (!createdAt || !id) return null;
    if (Number.isNaN(Date.parse(createdAt))) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
