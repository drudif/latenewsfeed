"use client";
import { useState } from "react";

type Cat = { slug: string; name: string };

export default function CategoryManager({ initial }: { initial: Cat[] }) {
  const [cats, setCats] = useState<Cat[]>(initial);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function add() {
    if (!name.trim()) return;
    const res = await fetch("/api/categories", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) { const { category } = await res.json(); setCats((c) => [...c, category]); setName(""); }
  }
  async function remove(slug: string) {
    const res = await fetch("/api/categories", {
      method: "DELETE", headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    if (res.ok) setCats((c) => c.filter((x) => x.slug !== slug));
  }
  async function save(slug: string) {
    const name = draft.trim();
    if (!name) { setEditing(null); return; }
    const res = await fetch("/api/categories", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, name }),
    });
    if (res.ok) setCats((c) => c.map((x) => (x.slug === slug ? { ...x, name } : x)));
    setEditing(null);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Categorias</h2>
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {cats.map((c) => (
          <li key={c.slug} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            {editing === c.slug ? (
              <>
                <input value={draft} onChange={(e) => setDraft(e.target.value)}
                  className="flex-1 rounded-lg border border-neutral-200 px-2 py-1 text-sm outline-none focus:border-neutral-400" />
                <div className="flex gap-2">
                  <button onClick={() => save(c.slug)} className="text-neutral-900 hover:underline">salvar</button>
                  <button onClick={() => setEditing(null)} className="text-neutral-500 hover:underline">cancelar</button>
                </div>
              </>
            ) : (
              <>
                <span>{c.name} <span className="text-neutral-400">({c.slug})</span></span>
                <div className="flex gap-2">
                  <button onClick={() => { setEditing(c.slug); setDraft(c.name); }} className="text-neutral-600 hover:underline">editar</button>
                  {c.slug !== "outros" && (
                    <button onClick={() => remove(c.slug)} className="text-red-600 hover:underline">remover</button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova categoria"
          className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400" />
        <button onClick={add} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">Adicionar</button>
      </div>
    </div>
  );
}
