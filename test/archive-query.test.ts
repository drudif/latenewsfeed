import { describe, it, expect } from "vitest";
import { makeTestDb, seedCategories } from "./helpers/db";
import { getArchive } from "@/lib/queries";
import { inputs } from "@/db/schema";

async function insertRead(db: any, over: Record<string, unknown>) {
  await db.insert(inputs).values({
    source: "paste", categorySlug: "ler-depois", title: "t", bodyText: "b",
    readAt: new Date(), ...over,
  });
}

describe("getArchive", () => {
  it("returns only read items", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    await insertRead(db, { title: "arquivado" });
    await db.insert(inputs).values({ source: "paste", categorySlug: "ler-depois", title: "novo", bodyText: "b" });
    const res = await getArchive(db, { limit: 20 });
    expect(res.items.map((i) => i.title)).toEqual(["arquivado"]);
  });

  it("matches full-text search on title and body", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    await insertRead(db, { title: "Design tipográfico", bodyText: "sobre fontes" });
    await insertRead(db, { title: "Receita de bolo", bodyText: "farinha e ovos" });
    const res = await getArchive(db, { limit: 20, q: "fontes" });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].title).toBe("Design tipográfico");
  });
});
