"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Composer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPaste(e: React.ClipboardEvent) {
    const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (imgs.length) setFiles((prev) => [...prev, ...imgs]);
  }

  async function submit() {
    if (!text.trim() && files.length === 0) return;
    setBusy(true); setError(null);
    const form = new FormData();
    form.set("text", text);
    files.forEach((f) => form.append("images", f));
    const res = await fetch("/api/paste", { method: "POST", body: form });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error ?? "não deu pra salvar"); return; }
    setText(""); setFiles([]);
    router.refresh();
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
        <button className="add-btn" onClick={submit} disabled={busy}>
          {busy ? "salvando…" : "Adicionar"}
        </button>
      </div>
    </div>
  );
}
