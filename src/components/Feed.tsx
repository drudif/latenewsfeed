"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import CategoryChips from "./CategoryChips";
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
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 150);
  }

  return (
    <div className="space-y-4">
      <CategoryChips categories={categories} active={category} onChange={changeCategory} />
      {items.length === 0 && !loading && (
        <p className="py-12 text-center text-sm text-neutral-400">Nada por aqui. Inbox zero. ✨</p>
      )}
      {items.map((item) => <InputCard key={item.id} item={item} onRead={onRead} />)}
      <div ref={sentinel} className="h-8" />
      {loading && <p className="text-center text-sm text-neutral-400">carregando…</p>}
    </div>
  );
}
