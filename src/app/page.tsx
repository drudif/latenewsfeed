import { db } from "@/db";
import { getFeed } from "@/lib/queries";
import { listCategories } from "@/lib/categoriesRepo";
import Feed from "@/components/Feed";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [initial, cats] = await Promise.all([
    getFeed(db, { limit: 20 }),
    listCategories(db),
  ]);
  return (
    <Feed
      initialItems={initial.items}
      initialCursor={initial.nextCursor}
      categories={cats.map((c: { slug: string; name: string }) => ({ slug: c.slug, name: c.name }))}
    />
  );
}
