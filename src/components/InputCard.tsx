"use client";
import { useState, type CSSProperties } from "react";
import { categoryColor } from "@/lib/categoryColor";

export type Item = {
  id: string; source: string; categorySlug: string; title: string;
  summary: string | null; bodyText: string; sender: string | null; subject: string | null;
  createdAt: string; images: { r2Key: string; status: string }[];
};

const R2_PUBLIC = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";

function summaryLines(summary: string | null): string[] | null {
  const lines = (summary ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2 && lines.every((l) => l.startsWith("- "))) {
    return lines.map((l) => l.replace(/^-\s*/, ""));
  }
  return null;
}

// Extrai o nome do remetente de "Fernando Drudi" <f@x.com> / Fernando <f@x> / f@x
function senderName(sender: string | null): string {
  if (!sender) return "";
  const s = sender.trim();
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/);
  if (m && m[1].trim()) return m[1].trim();
  return s.replace(/[<>"]/g, "").trim();
}

export default function InputCard({
  item, onRead, readOnly, catLabel, sizeClass, clamp, draggable,
}: {
  item: Item; onRead: (id: string) => void; readOnly?: boolean;
  catLabel?: string; sizeClass?: string; clamp?: boolean; draggable?: boolean;
}) {
  const [leaving, setLeaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const cc = categoryColor(item.categorySlug);
  const when = new Date(item.createdAt);
  const stamp = `${when.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · ${when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const bullets = summaryLines(item.summary);
  const hasFullContent = (item.bodyText ?? "").trim().length > 0;
  const isEmail = item.source === "email";

  async function markRead() {
    setLeaving(true);
    await fetch(`/api/inputs/${item.id}/read`, { method: "PATCH" });
    setTimeout(() => onRead(item.id), 180);
  }

  return (
    <article
      className={`card${sizeClass ? " " + sizeClass : ""}${leaving ? " leaving" : ""}${dragging ? " dragging" : ""}`}
      style={{ ["--cc" as keyof CSSProperties]: cc } as CSSProperties}
      draggable={draggable || undefined}
      onDragStart={draggable ? (e) => {
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      } : undefined}
      onDragEnd={draggable ? () => setDragging(false) : undefined}
    >
      <div className="bar" />
      <div className="pad">
        <div className="card-top">
          {isEmail ? (
            <h3>
              {senderName(item.sender) || "Remetente desconhecido"}
              {item.subject ? <span className="subj">{item.subject}</span> : null}
            </h3>
          ) : (
            <h3>{item.title}</h3>
          )}
          <div className="card-tags">
            <span className="tag">{catLabel ?? item.categorySlug}</span>
            <span className="ttag">{isEmail ? "e-mail" : "colado"}</span>
          </div>
        </div>

        <div className={`cbody${clamp && !expanded ? " clamped" : ""}`}>
          {bullets ? (
            <ul className="list">{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
          ) : item.summary ? (
            <p>{item.summary}</p>
          ) : null}

          {item.images.length > 0 && (
            <div className="thumbs">
              {item.images.map((img, i) =>
                img.status === "ok" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={`${R2_PUBLIC}/${img.r2Key}`} alt="" />
                ) : (
                  <div key={i} className="thumb-miss">imagem indisponível</div>
                ),
              )}
            </div>
          )}
        </div>

        {hasFullContent && (
          <>
            <button className="expand" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Recolher" : "Ler na íntegra"}
            </button>
            {expanded && <div className="full">{item.bodyText}</div>}
          </>
        )}

        <div className="card-foot">
          <span className="date mono">{stamp}</span>
          {!readOnly && (
            <button className="go" onClick={markRead}>
              marcar lido <span className="arw">→</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
