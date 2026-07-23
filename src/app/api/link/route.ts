import { NextRequest, NextResponse } from "next/server";
import type { NormalizedInput } from "@/lib/email";
import { db } from "@/db";
import { ingestInput } from "@/lib/ingest";
import { classifyInput } from "@/lib/classify";
import { R2Store } from "@/lib/r2";
import { fetchLink, isVideoUrl, normalizeUrl, videoInput } from "@/lib/link";
import { extractReelAudio, isReelUrl } from "@/lib/reel";
import { transcribeAudio } from "@/lib/transcribe";

export const runtime = "nodejs";
// Extrair áudio (Chromium) + transcrever pode levar dezenas de segundos.
export const maxDuration = 120;

// Reel do Instagram: abre num navegador real, captura a faixa de áudio e o
// Gemini transcreve. O texto vira o corpo do input (entra no pipeline normal).
// Se qualquer passo falhar (ou não houver fala), cai na raspagem da legenda.
async function reelInput(url: string): Promise<NormalizedInput> {
  const { audio, mediaType, caption } = await extractReelAudio(url);
  const { transcript, hasSpeech } = await transcribeAudio(audio, mediaType);
  if (!hasSpeech || !transcript.trim()) throw new Error("reel: sem fala");
  return {
    source: "link", sender: null,
    subject: (caption || "Reel do Instagram").slice(0, 300),
    text: transcript, html: null, messageId: null, url, images: [],
  };
}

async function normalizeLink(norm: string): Promise<NormalizedInput> {
  if (isVideoUrl(norm)) return videoInput(norm); // YouTube: o Gemini assiste
  if (isReelUrl(norm)) {
    try {
      return await reelInput(norm);
    } catch (err) {
      console.error("reel audio failed, falling back to caption", err);
    }
  }
  return await fetchLink(norm); // outros links (e fallback do reel): raspa o texto
}

// Recebe uma URL, busca o conteúdo da página, o Gemini lê/categoriza/resume e
// cria um input no feed (com a URL de origem).
export async function POST(req: NextRequest) {
  const { url } = await req.json();
  const norm = normalizeUrl(String(url ?? ""));
  if (!norm) return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  try {
    const normalized = await normalizeLink(norm);
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
