import { eq, asc, sql } from "drizzle-orm";
import { categories, inputs } from "@/db/schema";
import { slugify, OUTROS_SLUG } from "./categories";

export type Category = typeof categories.$inferSelect;

export async function listCategories(db: any): Promise<Category[]> {
  return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function addCategory(db: any, name: string) {
  const slug = slugify(name);
  if (!slug) throw new Error("nome inválido");
  const [maxRow] = await db.select({ m: sql<number>`coalesce(max(${categories.sortOrder}), 0)` }).from(categories);
  const [row] = await db.insert(categories)
    .values({ slug, name, sortOrder: (maxRow?.m ?? 0) + 1 })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new Error("categoria já existe");
  return row;
}

export async function renameCategory(db: any, slug: string, name: string) {
  await db.update(categories).set({ name }).where(eq(categories.slug, slug));
}

export async function deleteCategory(db: any, slug: string) {
  if (slug === OUTROS_SLUG) throw new Error("não é possível remover 'outros'");
  await db.update(inputs).set({ categorySlug: OUTROS_SLUG }).where(eq(inputs.categorySlug, slug));
  await db.delete(categories).where(eq(categories.slug, slug));
}
