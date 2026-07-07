import { describe, it, expect } from "vitest";
import { makeTestDb } from "./helpers/db";
import { categories } from "@/db/schema";

describe("test db", () => {
  it("applies migrations and can query", async () => {
    const db = await makeTestDb();
    const rows = await db.select().from(categories);
    expect(rows).toEqual([]);
  });
});
