import { db } from "@/db";
import { getFeed } from "@/lib/queries";
import { listCategories } from "@/lib/categoriesRepo";
import Composer from "@/components/Composer";
import Feed from "@/components/Feed";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [initial, cats] = await Promise.all([
    getFeed(db, { limit: 20 }),
    listCategories(db),
  ]);
  return (
    <div className="space-y-6">
      <Composer />
      <Feed
        initialItems={initial.items}
        initialCursor={initial.nextCursor}
        categories={cats.map((c: any) => ({ slug: c.slug, name: c.name }))}
      />
    </div>
  );
}
