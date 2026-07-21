"use client";
import { useState } from "react";

// Detecta se o conteúdo é só uma URL (sem espaços): http(s)://… ou domínio.tld[/...]
function looksLikeUrl(t: string): boolean {
  if (!t || /\s/.test(t)) return false;
  return /^https?:\/\/\S+$/i.test(t) || /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t);
}

export default function Composer({ onAdded }: { onAdded?: () => void }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPaste(e: React.ClipboardEvent) {
    const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (imgs.length) setFiles((prev) => [...prev, ...imgs]);
  }

  async function submit() {
    const t = text.trim();
    if (!t && files.length === 0) return;
    setBusy(true); setError(null);
    try {
      if (files.length === 0 && looksLikeUrl(t)) {
        // É só um link → busca a página e analisa.
        const res = await fetch("/api/link", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: t }),
        });
        if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "não consegui ler essa URL"); return; }
      } else {
        // Texto e/ou imagens.
        const form = new FormData();
        form.set("text", text);
        files.forEach((f) => form.append("images", f));
        const res = await fetch("/api/paste", { method: "POST", body: form });
        if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "não deu pra salvar"); return; }
      }
      setText(""); setFiles([]);
      onAdded?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="composer">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
        placeholder="Cole um screenshot, um link, ou escreva um input…"
      />
      {files.length > 0 && (
        <div className="thumbs">
          {files.map((f, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={URL.createObjectURL(f)} alt="" />
          ))}
        </div>
      )}
      <div className="composer-foot">
        <span className="err">{error}</span>
        <button className="add-btn" onClick={submit} disabled={busy}>
          {busy ? "processando…" : "Adicionar"}
        </button>
      </div>
    </div>
  );
}
