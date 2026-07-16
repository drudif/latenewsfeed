"use client";
import { useState, type CSSProperties, type DragEvent } from "react";
import { categoryColor } from "@/lib/categoryColor";

export default function CategoryChips({
  categories, active, onChange, onDropCard,
}: {
  categories: { slug: string; name: string }[];
  active: string | null;
  onChange: (slug: string | null) => void;
  onDropCard?: (id: string, slug: string) => void;
}) {
  const [dropSlug, setDropSlug] = useState<string | null>(null);

  const dnd = (slug: string) =>
    onDropCard
      ? {
          onDragOver: (e: DragEvent) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropSlug(slug);
          },
          onDragLeave: () => setDropSlug((s) => (s === slug ? null : s)),
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain");
            setDropSlug(null);
            if (id) onDropCard(id, slug);
          },
        }
      : {};

  return (
    <div className="chips">
      <button className={`chip${active === null ? " active" : ""}`} onClick={() => onChange(null)}>
        Tudo
      </button>
      {categories.map((c) => (
        <button
          key={c.slug}
          className={`chip cat${active === c.slug ? " active" : ""}${dropSlug === c.slug ? " drop-hover" : ""}`}
          style={{ ["--cc" as keyof CSSProperties]: categoryColor(c.slug) } as CSSProperties}
          onClick={() => onChange(active === c.slug ? null : c.slug)}
          {...dnd(c.slug)}
        >
          <span className="swatch" />
          {c.name}
        </button>
      ))}
    </div>
  );
}
