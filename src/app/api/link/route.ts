import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ingestInput } from "@/lib/ingest";
import { classifyInput } from "@/lib/classify";
import { R2Store } from "@/lib/r2";
import { fetchLink, isVideoUrl, normalizeUrl, videoInput } from "@/lib/link";

export const runtime = "nodejs";

// Recebe uma URL, busca o conteúdo da página, o Gemini lê/categoriza/resume e
// cria um input no feed (com a URL de origem).
export async function POST(req: NextRequest) {
  const { url } = await req.json();
  const norm = normalizeUrl(String(url ?? ""));
  if (!norm) return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  try {
    // Vídeo (YouTube): o Gemini assiste direto. Outros links: raspa o conteúdo.
    const normalized = isVideoUrl(norm) ? videoInput(norm) : await fetchLink(norm);
    const id = await ingestInput(
      { db, store: new R2Store(), classifier: (p, c) => classifyInput(p, c) },
      normalized,
    );
    return NextResponse.json({ id });
  } catch (err) {
    console.error("link failed", err);
    return NextResponse.json({ error: "não consegui ler essa URL" }, { status: 502 });
  }
}
