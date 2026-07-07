import { and, eq, isNull, isNotNull, sql, desc } from "drizzle-orm";
import { inputs, attachments } from "@/db/schema";
import { encodeCursor, decodeCursor } from "./cursor";

export type FeedItem = {
  id: string;
  source: string;
  categorySlug: string;
  title: string;
  summary: string | null;
  bodyText: string;
  sender: string | null;
  createdAt: string;
  images: { r2Key: string; status: string }[];
};

type FeedArgs = { limit: number; cursor?: string | null; category?: string | null };

async function attachImages(db: any, items: any[]): Promise<FeedItem[]> {
  if (items.length === 0) return [];
  const ids = items.map((i) => i.id);
  const atts = await db.select().from(attachments)
    .where(sql`${attachments.inputId} in ${ids}`);
  const byInput = new Map<string, { r2Key: string; status: string }[]>();
  for (const a of atts) {
    const list = byInput.get(a.inputId) ?? [];
    list.push({ r2Key: a.r2Key, status: a.status });
    byInput.set(a.inputId, list);
  }
  return items.map((i) => ({
    id: i.id, source: i.source, categorySlug: i.categorySlug, title: i.title,
    summary: i.summary, bodyText: i.bodyText, sender: i.sender,
    createdAt: new Date(i.createdAt).toISOString(),
    images: byInput.get(i.id) ?? [],
  }));
}

function cursorClause(cursor?: string | null) {
  if (!cursor) return undefined;
  const c = decodeCursor(cursor);
  if (!c) return undefined;
  return sql`(${inputs.createdAt}, ${inputs.id}) < (${new Date(c.createdAt)}, ${c.id})`;
}

function pageResult(rows: FeedItem[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;
  return { items, nextCursor };
}

export async function getFeed(db: any, args: FeedArgs) {
  const conds = [isNull(inputs.readAt)];
  if (args.category) conds.push(eq(inputs.categorySlug, args.category));
  const cur = cursorClause(args.cursor);
  if (cur) conds.push(cur);

  const rows = await db.select().from(inputs)
    .where(and(...conds))
    .orderBy(desc(inputs.createdAt), desc(inputs.id))
    .limit(args.limit + 1);

  const withImages = await attachImages(db, rows);
  return pageResult(withImages, args.limit);
}

export async function getArchive(db: any, args: FeedArgs & { q?: string | null }) {
  const conds = [isNotNull(inputs.readAt)];
  if (args.category) conds.push(eq(inputs.categorySlug, args.category));
  if (args.q && args.q.trim()) {
    conds.push(sql`to_tsvector('portuguese', coalesce(${inputs.title},'') || ' ' || coalesce(${inputs.bodyText},'')) @@ plainto_tsquery('portuguese', ${args.q.trim()})`);
  }
  const cur = cursorClause(args.cursor);
  if (cur) conds.push(cur);

  const rows = await db.select().from(inputs)
    .where(and(...conds))
    .orderBy(desc(inputs.createdAt), desc(inputs.id))
    .limit(args.limit + 1);

  const withImages = await attachImages(db, rows);
  return pageResult(withImages, args.limit);
}
