import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as schema from "@/db/schema";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export async function makeTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  const dir = path.resolve(__dirname, "../../drizzle");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = readFileSync(path.join(dir, f), "utf8");
    // drizzle migrations use `--> statement-breakpoint` between statements
    for (const stmt of sql.split("--> statement-breakpoint")) {
      const trimmed = stmt.trim();
      if (trimmed) await pg.exec(trimmed);
    }
  }
  return db;
}

export async function seedCategories(db: TestDb) {
  const { DEFAULT_CATEGORIES } = await import("@/lib/categories");
  await db.insert(schema.categories).values(DEFAULT_CATEGORIES).onConflictDoNothing();
}
