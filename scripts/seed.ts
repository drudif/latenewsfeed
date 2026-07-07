import "dotenv/config";
import { db } from "../src/db";
import { categories } from "../src/db/schema";
import { DEFAULT_CATEGORIES } from "../src/lib/categories";

async function main() {
  await db.insert(categories).values(DEFAULT_CATEGORIES).onConflictDoNothing();
  console.log("seeded categories");
  process.exit(0);
}
main();
