import { db } from "@/db";
import { listCategories } from "@/lib/categoriesRepo";
import ArchiveView from "@/components/ArchiveView";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const cats = await listCategories(db);
  return <ArchiveView categories={cats.map((c: any) => ({ slug: c.slug, name: c.name }))} />;
}
