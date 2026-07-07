"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import CategoryChips from "./CategoryChips";
import InputCard, { type Item } from "./InputCard";

export default function ArchiveView({ categories }: { categories: { slug: string; name: string }[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(async (reset: boolean, cur: string | null) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (q.trim()) params.set("q", q.trim());
    if (!reset && cur) params.set("cursor", cur);
    const res = await fetch(`/api/archive?${params}`).then((r) => r.json());
    setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
    setCursor(res.nextCursor);
    setLoading(false);
  }, [category, q]);

  useEffect(() => { load(true, null); }, [load]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => {
      if (e[0].isIntersecting && cursor && !loading) load(false, cursor);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loading, load]);

  return (
    <div className="space-y-4">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no arquivo…"
        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
      <CategoryChips categories={categories} active={category} onChange={setCategory} />
      {items.map((item) => <InputCard key={item.id} item={item} onRead={() => {}} />)}
      <div ref={sentinel} className="h-8" />
      {loading && <p className="text-center text-sm text-neutral-400">carregando…</p>}
    </div>
  );
}
