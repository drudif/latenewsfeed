"use client";
import { useState, type CSSProperties } from "react";
import { categoryColor } from "@/lib/categoryColor";

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
    const n = draft.trim();
    if (!n) { setEditing(null); return; }
    const res = await fetch("/api/categories", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, name: n }),
    });
    if (res.ok) setCats((c) => c.map((x) => (x.slug === slug ? { ...x, name: n } : x)));
    setEditing(null);
  }

  return (
    <main>
      <div className="wrap settings">
        <h2>Categorias</h2>
        <div className="cat-list">
          {cats.map((c) => (
            <div key={c.slug} className="cat-row">
              <span className="swatch" style={{ ["--cc" as keyof CSSProperties]: categoryColor(c.slug) } as CSSProperties} />
              {editing === c.slug ? (
                <>
                  <input className="field" value={draft} autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && save(c.slug)} />
                  <button className="act" onClick={() => save(c.slug)}>salvar</button>
                  <button className="act" onClick={() => setEditing(null)}>cancelar</button>
                </>
              ) : (
                <>
                  <span className="cat-name">{c.name}</span>
                  <span className="cat-slug">{c.slug}</span>
                  <button className="act" onClick={() => { setEditing(c.slug); setDraft(c.name); }}>editar</button>
                  {c.slug !== "outros" && (
                    <button className="act danger" onClick={() => remove(c.slug)}>remover</button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        <div className="add-row">
          <input className="field" value={name} placeholder="Nova categoria"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="add-btn" onClick={add}>Adicionar</button>
        </div>
      </div>
    </main>
  );
}
