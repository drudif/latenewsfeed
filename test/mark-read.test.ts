import { describe, it, expect } from "vitest";
import { makeTestDb, seedCategories } from "./helpers/db";
import { markRead, getFeed, getArchive } from "@/lib/queries";
import { inputs } from "@/db/schema";

describe("markRead", () => {
  it("moves an item from feed to archive", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    const [row] = await db.insert(inputs).values({
      source: "paste", categorySlug: "ler-depois", title: "x", bodyText: "b",
    }).returning({ id: inputs.id });

    expect((await getFeed(db, { limit: 20 })).items).toHaveLength(1);
    const ok = await markRead(db, row.id);
    expect(ok).toBe(true);

    expect((await getFeed(db, { limit: 20 })).items).toHaveLength(0);
    expect((await getArchive(db, { limit: 20 })).items).toHaveLength(1);
  });

  it("returns false for an unknown id", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    expect(await markRead(db, "00000000-0000-0000-0000-000000000000")).toBe(false);
  });
});
