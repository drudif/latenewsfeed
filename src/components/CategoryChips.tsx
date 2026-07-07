"use client";
export default function CategoryChips({
  categories, active, onChange,
}: {
  categories: { slug: string; name: string }[];
  active: string | null;
  onChange: (slug: string | null) => void;
}) {
  const base = "rounded-full border px-3 py-1 text-xs transition";
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={() => onChange(null)}
        className={`${base} ${active === null ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}>
        Tudo
      </button>
      {categories.map((c) => (
        <button key={c.slug} onClick={() => onChange(c.slug)}
          className={`${base} ${active === c.slug ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}>
          {c.name}
        </button>
      ))}
    </div>
  );
}
