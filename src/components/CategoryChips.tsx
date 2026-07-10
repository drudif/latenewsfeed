"use client";
import type { CSSProperties } from "react";
import { categoryColor } from "@/lib/categoryColor";

export default function CategoryChips({
  categories, active, onChange,
}: {
  categories: { slug: string; name: string }[];
  active: string | null;
  onChange: (slug: string | null) => void;
}) {
  return (
    <div className="chips">
      <button className={`chip${active === null ? " active" : ""}`} onClick={() => onChange(null)}>
        Tudo
      </button>
      {categories.map((c) => (
        <button
          key={c.slug}
          className={`chip cat${active === c.slug ? " active" : ""}`}
          style={{ ["--cc" as keyof CSSProperties]: categoryColor(c.slug) } as CSSProperties}
          onClick={() => onChange(active === c.slug ? null : c.slug)}
        >
          <span className="swatch" />
          {c.name}
        </button>
      ))}
    </div>
  );
}
