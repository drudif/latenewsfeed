"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CategoryChips from "./CategoryChips";
import InputCard, { type Item } from "./InputCard";

export default function ArchiveView({ categories }: { categories: { slug: string; name: string }[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const catName = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.slug, c.name])),
    [categories],
  );

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
    <>
      <div className="filters">
        <div className="wrap narrow">
          <CategoryChips categories={categories} active={category} onChange={setCategory} />
          <label className="search">
            <svg width="15" height="15" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" />
          </label>
        </div>
      </div>
      <main>
        <div className="wrap narrow">
          <div className="section-head" style={{ ["--cc" as string]: "var(--ink)" }}>
            <span className="ix">—</span>
            <h2>Arquivo</h2>
            <span className="count">{items.length} {items.length === 1 ? "item" : "itens"}</span>
          </div>
          {items.length === 0 && !loading ? (
            <p className="empty">Nada encontrado.</p>
          ) : (
            <div className="grid">
              {items.map((item) => (
                <InputCard key={item.id} item={item} readOnly onRead={() => {}} catLabel={catName[item.categorySlug]} />
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
