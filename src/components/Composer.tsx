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
    if (!res.ok) { setError((await res.json()).error ?? "erro"); return; }
    setText(""); setFiles([]);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
        placeholder="Cole um screenshot ou escreva um input…"
        className="min-h-20 w-full resize-y rounded-lg border border-neutral-200 p-2 text-sm outline-none focus:border-neutral-400"
      />
      {files.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {files.map((f, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={URL.createObjectURL(f)} alt="" className="h-16 rounded object-cover" />
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-2 flex justify-end">
        <button onClick={submit} disabled={busy}
          className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-50">
          {busy ? "salvando…" : "Adicionar"}
        </button>
      </div>
    </div>
  );
}
