"use client";
import { useState } from "react";

export default function Composer({ onAdded }: { onAdded?: () => void }) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<null | "paste" | "link">(null);
  const [error, setError] = useState<string | null>(null);

  function onPaste(e: React.ClipboardEvent) {
    const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (imgs.length) setFiles((prev) => [...prev, ...imgs]);
  }

  async function submit() {
    if (!text.trim() && files.length === 0) return;
    setBusy("paste"); setError(null);
    const form = new FormData();
    form.set("text", text);
    files.forEach((f) => form.append("images", f));
    const res = await fetch("/api/paste", { method: "POST", body: form });
    setBusy(null);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "não deu pra salvar"); return; }
    setText(""); setFiles([]);
    onAdded?.();
  }

  async function submitUrl() {
    if (!url.trim()) return;
    setBusy("link"); setError(null);
    const res = await fetch("/api/link", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    setBusy(null);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "não consegui ler essa URL"); return; }
    setUrl("");
    onAdded?.();
  }

  return (
    <div className="composer">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
        placeholder="Cole um screenshot ou escreva um input…"
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
        <button className="add-btn" onClick={submit} disabled={busy !== null}>
          {busy === "paste" ? "salvando…" : "Adicionar"}
        </button>
      </div>
      <div className="link-row">
        <input
          className="link-input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitUrl(); }}
          placeholder="…ou cole um link pra analisar"
        />
        <button className="add-btn ghost" onClick={submitUrl} disabled={busy !== null}>
          {busy === "link" ? "lendo…" : "Analisar URL"}
        </button>
      </div>
    </div>
  );
}
