import { db } from "@/db";
import { listCategories } from "@/lib/categoriesRepo";
import CategoryManager from "@/components/CategoryManager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const cats = await listCategories(db);
  return <CategoryManager initial={cats.map((c: any) => ({ slug: c.slug, name: c.name }))} />;
}
