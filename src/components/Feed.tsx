"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CategoryChips from "./CategoryChips";
import Composer from "./Composer";
import InputCard, { type Item } from "./InputCard";

export default function Feed({
  initialItems, initialCursor, categories,
}: {
  initialItems: Item[]; initialCursor: string | null;
  categories: { slug: string; name: string }[];
}) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [category, setCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const catName = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.slug, c.name])),
    [categories],
  );

  const load = useCallback(async (reset: boolean, cat: string | null, cur: string | null) => {
    if (!reset && loading) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (cat) params.set("category", cat);
    if (!reset && cur) params.set("cursor", cur);
    const res = await fetch(`/api/feed?${params}`).then((r) => r.json());
    setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
    setCursor(res.nextCursor);
    setLoading(false);
  }, [loading]);

  function changeCategory(cat: string | null) {
    setCategory(cat);
    setItems([]);
    setCursor(null);
    load(true, cat, null);
  }

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && cursor && !loading) load(false, category, cursor);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loading, category, load]);

  function onRead(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <>
      <div className="filters">
        <div className="wrap narrow">
          <CategoryChips categories={categories} active={category} onChange={changeCategory} />
        </div>
      </div>
      <main>
        <div className="wrap narrow">
          <Composer />
          <div className="section-head" style={{ ["--cc" as string]: "var(--ink)" }}>
            <span className="ix">—</span>
            <h2>Feed</h2>
            <span className="count">
              {items.length} {items.length === 1 ? "não lido" : "não lidos"}
            </span>
          </div>
          {items.length === 0 && !loading ? (
            <p className="empty">Tudo lido.</p>
          ) : (
            <div className="grid">
              {items.map((item) => (
                <InputCard key={item.id} item={item} onRead={onRead} catLabel={catName[item.categorySlug]} />
              ))}
            </div>
          )}
          <div ref={sentinel} style={{ height: 8 }} />
          {loading && <p className="loading">carregando…</p>}
        </div>
      </main>
    </>
  );
}
