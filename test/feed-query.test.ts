import { describe, it, expect } from "vitest";
import { makeTestDb, seedCategories } from "./helpers/db";
import { getFeed } from "@/lib/queries";
import { inputs } from "@/db/schema";

async function insert(db: Awaited<ReturnType<typeof makeTestDb>>, over: Record<string, unknown>) {
  const [r] = await db.insert(inputs).values({
    source: "paste", categorySlug: "ler-depois", title: "t", bodyText: "b", ...over,
  }).returning({ id: inputs.id, createdAt: inputs.createdAt });
  return r;
}

describe("getFeed", () => {
  it("returns only unread, newest first, and paginates via cursor", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    for (let i = 0; i < 25; i++) {
      await insert(db, { title: `n${i}`, createdAt: new Date(2026, 0, 1, 0, i) });
    }
    await insert(db, { title: "lido", readAt: new Date(), createdAt: new Date(2026, 0, 2) });

    const page1 = await getFeed(db, { limit: 20 });
    expect(page1.items).toHaveLength(20);
    expect(page1.items[0].title).toBe("n24"); // newest unread
    expect(page1.nextCursor).toBeTruthy();
    expect(page1.items.some((i) => i.title === "lido")).toBe(false);

    const page2 = await getFeed(db, { limit: 20, cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(5);
    expect(page2.nextCursor).toBeNull();
  });

  it("filters by category", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    await insert(db, { title: "a", categorySlug: "ler-depois" });
    await insert(db, { title: "b", categorySlug: "inspiracao" });
    const res = await getFeed(db, { limit: 20, category: "inspiracao" });
    expect(res.items.map((i) => i.title)).toEqual(["b"]);
  });

  it("does not skip rows that share the same millisecond (microsecond cursor)", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    const { sql } = await import("drizzle-orm");
    // Two unread rows in the SAME millisecond but different microseconds.
    await db.insert(inputs).values({
      source: "paste", categorySlug: "ler-depois", title: "newer", bodyText: "b",
      createdAt: sql`'2026-01-01T00:00:00.123456Z'::timestamptz`,
    } as any);
    await db.insert(inputs).values({
      source: "paste", categorySlug: "ler-depois", title: "older", bodyText: "b",
      createdAt: sql`'2026-01-01T00:00:00.123111Z'::timestamptz`,
    } as any);

    const page1 = await getFeed(db, { limit: 1 });
    expect(page1.items.map((i) => i.title)).toEqual(["newer"]);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await getFeed(db, { limit: 1, cursor: page1.nextCursor! });
    expect(page2.items.map((i) => i.title)).toEqual(["older"]); // must NOT be skipped
  });
});
