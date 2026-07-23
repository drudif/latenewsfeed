// Transcrição de áudio via Gemini. Recebe os bytes de uma faixa de áudio e
// devolve a transcrição corrida (no idioma original, fiel à fala). Usada para
// reels/vídeos: transcrevemos e depois o texto entra no pipeline normal de
// classificação/resumo como qualquer outro conteúdo de texto.
import { MODEL } from "./classify";

export type TranscribeResult = { transcript: string; hasSpeech: boolean };

// Transporte injetável (tests injetam um fake): dado o corpo da request do
// Gemini, devolve o texto cru da resposta.
export type AudioGenerateFn = (body: unknown) => Promise<string>;

const NO_SPEECH = "[sem fala]";

export function buildTranscribeRequest(base64: string, mediaType: string) {
  return {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mediaType, data: base64 } },
          {
            text:
              "Transcreva integralmente a fala deste áudio, no idioma original, de forma fiel e " +
              "corrida (sem timestamps, sem comentários, sem resumir). Se não houver fala (apenas " +
              `música, ruído ou silêncio), responda exatamente: ${NO_SPEECH}`,
          },
        ],
      },
    ],
    generationConfig: {
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 8000,
    },
  };
}

async function geminiTranscribe(body: unknown): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!res.ok) throw new Error(`gemini transcribe http ${res.status}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("gemini transcribe: no text");
  return text;
}

export async function transcribeAudio(
  audio: Buffer,
  mediaType: string,
  generate: AudioGenerateFn = geminiTranscribe,
): Promise<TranscribeResult> {
  const req = buildTranscribeRequest(audio.toString("base64"), mediaType);
  const raw = (await generate(req)).trim();
  const hasSpeech = raw.length > 0 && !new RegExp(`^\\[?\\s*sem fala\\s*\\]?$`, "i").test(raw);
  return { transcript: hasSpeech ? raw : "", hasSpeech };
}
