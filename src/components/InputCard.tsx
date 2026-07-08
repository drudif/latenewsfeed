"use client";
import { useState } from "react";

export type Item = {
  id: string; source: string; categorySlug: string; title: string;
  summary: string | null; bodyText: string; sender: string | null;
  createdAt: string; images: { r2Key: string; status: string }[];
};

const R2_PUBLIC = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";

export default function InputCard({ item, onRead, readOnly }: { item: Item; onRead: (id: string) => void; readOnly?: boolean }) {
  const [leaving, setLeaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const time = new Date(item.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const hasFullContent = (item.bodyText ?? "").trim().length > 0;

  async function markRead() {
    setLeaving(true);
    await fetch(`/api/inputs/${item.id}/read`, { method: "PATCH" });
    onRead(item.id);
  }

  return (
    <article className={`rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition ${leaving ? "opacity-0" : "opacity-100"}`}>
      <div className="mb-1 flex items-center gap-2 text-xs text-neutral-500">
        <span className="rounded bg-neutral-100 px-2 py-0.5">{item.categorySlug}</span>
        <span>{item.source === "email" ? "e-mail" : "colado"}</span>
        <span className="ml-auto">{time}</span>
      </div>
      <h3 className="font-semibold">{item.title}</h3>
      {item.summary && (
        <div className="mt-1 whitespace-pre-line text-sm text-neutral-600">{item.summary}</div>
      )}
      {item.images.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {item.images.map((img, i) =>
            img.status === "ok" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={`${R2_PUBLIC}/${img.r2Key}`} alt="" className="h-28 rounded-lg object-cover" />
            ) : (
              <div key={i} className="flex h-28 w-28 items-center justify-center rounded-lg bg-neutral-100 text-xs text-neutral-400">
                imagem indisponível
              </div>
            ),
          )}
        </div>
      )}
      {hasFullContent && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-medium text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline"
          >
            {expanded ? "Recolher" : "Ler na íntegra"}
          </button>
          {expanded && (
            <div className="mt-2 max-h-96 overflow-y-auto whitespace-pre-line rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
              {item.bodyText}
            </div>
          )}
        </div>
      )}
      {!readOnly && (
        <button onClick={markRead}
          className="mt-3 rounded-lg border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-900 hover:text-white">
          Marcar como lido
        </button>
      )}
    </article>
  );
}
