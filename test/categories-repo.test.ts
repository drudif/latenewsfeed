import { describe, it, expect } from "vitest";
import { makeTestDb, seedCategories } from "./helpers/db";
import { listCategories, addCategory, renameCategory, deleteCategory } from "@/lib/categoriesRepo";
import { inputs } from "@/db/schema";

describe("categoriesRepo", () => {
  it("lists seeded categories ordered", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    const cats = await listCategories(db);
    expect(cats.map((c) => c.slug)).toEqual(["ler-depois", "inspiracao", "pessoal", "outros"]);
  });

  it("adds a category with a derived slug", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    const c = await addCategory(db, "Trabalho");
    expect(c.slug).toBe("trabalho");
    expect((await listCategories(db)).some((x) => x.slug === "trabalho")).toBe(true);
  });

  it("renames without changing the slug", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    await renameCategory(db, "pessoal", "Vida pessoal");
    const cats = await listCategories(db);
    expect(cats.find((c) => c.slug === "pessoal")!.name).toBe("Vida pessoal");
  });

  it("reassigns inputs to 'outros' on delete", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    await addCategory(db, "Temp");
    await db.insert(inputs).values({ source: "paste", categorySlug: "temp", title: "t", bodyText: "b" });
    await deleteCategory(db, "temp");
    const rows = await db.select().from(inputs);
    expect(rows[0].categorySlug).toBe("outros");
    expect((await listCategories(db)).some((c) => c.slug === "temp")).toBe(false);
  });

  it("refuses to delete the outros fallback", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    await expect(deleteCategory(db, "outros")).rejects.toThrow();
  });
});
