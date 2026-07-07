import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ingestInput } from "@/lib/ingest";
import { normalizePaste } from "@/lib/paste";
import { R2Store } from "@/lib/r2";
import { classifyInput } from "@/lib/classify";
import type { ImagePart } from "@/lib/email";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per image

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const text = String(form.get("text") ?? "");
  const files = form.getAll("images").filter((f): f is File => f instanceof File);

  const images: ImagePart[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "apenas imagens" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "imagem muito grande (máx 10MB)" }, { status: 400 });
    }
    images.push({
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
      filename: file.name || null,
    });
  }

  if (!text.trim() && images.length === 0) {
    return NextResponse.json({ error: "input vazio" }, { status: 400 });
  }

  try {
    const id = await ingestInput(
      { db, store: new R2Store(), classifier: (p, c) => classifyInput(p, c) },
      normalizePaste(text, images),
    );
    return NextResponse.json({ id });
  } catch (err) {
    console.error("paste failed", err);
    return NextResponse.json({ error: "falha ao salvar" }, { status: 500 });
  }
}
