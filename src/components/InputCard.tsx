"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { categoryColor } from "@/lib/categoryColor";

export type Item = {
  id: string; source: string; url: string | null; categorySlug: string; title: string;
  summary: string | null; shortSummary: string | null; bodyText: string;
  sender: string | null; subject: string | null;
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

function clean(s: string): string {
  return s.replace(/\*\*/g, "").replace(/^[#\-*\s]+/, "").trim();
}
function deckFrom(item: Item): string {
  if (item.shortSummary?.trim()) return clean(item.shortSummary);
  const s = (item.summary ?? "").trim();
  if (!s) return "";
  const first = clean(s.split("\n")[0]);
  return first.length > 150 ? first.slice(0, 148).trimEnd() + "…" : first;
}

function senderName(sender: string | null): string {
  if (!sender) return "";
  const s = sender.trim();
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/);
  if (m && m[1].trim()) return m[1].trim();
  return s.replace(/[<>"]/g, "").trim();
}

function domainOf(url: string | null): string {
  if (!url) return "link";
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "link"; }
}

function frameDoc(html: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8"><base target="_blank" rel="noopener">` +
    `<style>html,body{margin:0;padding:0}` +
    `body{font-family:'Satoshi',system-ui,-apple-system,sans-serif;color:#4c463d;font-size:14px;` +
    `line-height:1.6;overflow-wrap:break-word;word-break:break-word;padding:4px}` +
    `a{color:#0e8ba0}img{max-width:100%;height:auto}table{max-width:100%!important}</style>` +
    `</head><body>${html}</body></html>`
  );
}

export default function InputCard({
  item, onRead, readOnly, catLabel, draggable,
}: {
  item: Item; onRead: (id: string) => void; readOnly?: boolean;
  catLabel?: string; draggable?: boolean;
}) {
  const [leaving, setLeaving] = useState(false);
  const [modal, setModal] = useState<null | "big" | "full">(null);
  const [dragging, setDragging] = useState(false);
  const [fullHtml, setFullHtml] = useState<string | null>(null);
  const [fullLoaded, setFullLoaded] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const cc = categoryColor(item.categorySlug);
  const when = new Date(item.createdAt);
  const stamp = `${when.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · ${when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const bullets = summaryLines(item.summary);
  const deck = deckFrom(item);
  const isEmail = item.source === "email";
  const isLink = item.source === "link";
  const hasFull = (item.bodyText ?? "").trim().length > 0;
  const hasBig = !!(item.summary ?? "").trim() && (item.summary ?? "").trim() !== deck;
  const sourceLabel = isLink ? domainOf(item.url) : isEmail ? "e-mail" : "colado";
  const headline = isEmail
    ? (senderName(item.sender) || "Remetente desconhecido")
    : item.title;

  async function markRead() {
    setLeaving(true);
    await fetch(`/api/inputs/${item.id}/read`, { method: "PATCH" });
    setTimeout(() => onRead(item.id), 180);
  }

  async function openFull() {
    setModal("full");
    if (!fullLoaded) {
      setFullLoaded(true);
      try {
        const r = await fetch(`/api/inputs/${item.id}/html`).then((x) => x.json());
        setFullHtml(typeof r.html === "string" && r.html.trim() ? r.html : null);
      } catch { /* fallback texto puro */ }
    }
  }

  // Esc fecha o lightbox; trava o scroll do fundo enquanto aberto.
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModal(null); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [modal]);

  function sizeFrame() {
    const f = frameRef.current;
    if (!f || !f.contentDocument) return;
    f.style.height = f.contentDocument.documentElement.scrollHeight + 12 + "px";
  }

  return (
    <article
      className={`card${leaving ? " leaving" : ""}${dragging ? " dragging" : ""}`}
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
          <h3>
            {headline}
            {isEmail && item.subject ? <span className="subj">{item.subject}</span> : null}
          </h3>
          <div className="card-tags">
            <span className="tag">{catLabel ?? item.categorySlug}</span>
            <span className="ttag">{sourceLabel}</span>
          </div>
        </div>

        {deck && <p className="deck">{deck}</p>}

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

        {(hasBig || hasFull || isLink) && (
          <div className="more">
            {hasBig && (
              <button className="expand" onClick={() => setModal("big")}>resumo maior</button>
            )}
            {isLink && item.url ? (
              <a className="expand" href={item.url} target="_blank" rel="noopener noreferrer">abrir link ↗</a>
            ) : hasFull ? (
              <button className="expand" onClick={openFull}>ler na íntegra</button>
            ) : null}
          </div>
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

      {modal && (
        <div className="lightbox" onClick={() => setModal(null)}>
          <div
            className="lightbox-panel"
            style={{ ["--cc" as keyof CSSProperties]: cc } as CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lightbox-head">
              <h3>{headline}{isEmail && item.subject ? <span className="subj">{item.subject}</span> : null}</h3>
              <button className="lightbox-close" onClick={() => setModal(null)} aria-label="Fechar">×</button>
            </div>
            <div className="lightbox-body">
              {modal === "big" ? (
                bullets ? (
                  <ul className="list">{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
                ) : (
                  <p className="lb-text">{item.summary}</p>
                )
              ) : fullHtml ? (
                <iframe
                  ref={frameRef}
                  className="lightbox-frame"
                  title="E-mail completo"
                  sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  srcDoc={frameDoc(fullHtml)}
                  onLoad={sizeFrame}
                />
              ) : fullLoaded ? (
                <p className="lb-text">{item.bodyText}</p>
              ) : (
                <p className="loading">carregando…</p>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
