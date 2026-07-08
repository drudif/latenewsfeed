import { z } from "zod";
import { OUTROS_SLUG } from "./categories";

export const MODEL = "gemini-2.5-flash";

export type ClassifyPayload = {
  subject?: string | null;
  text?: string | null;
  sender?: string | null;
  image?: { base64: string; mediaType: string } | null;
};

export type Classification = {
  categorySlug: string;
  title: string;
  summary: string | null;
};

export type CategoryLite = { slug: string; name: string };

// Injectable transport: given a Gemini request body, return the model's raw text
// (which — thanks to responseSchema — is a JSON string). Tests inject a fake.
export type GenerateFn = (body: unknown) => Promise<string>;

const resultSchema = z.object({
  category_slug: z.string().min(1),
  title: z.string().min(1).max(200),
  // Array em vez de string: força o modelo a enumerar um ponto por item, de
  // forma estável (uma string livre colapsava listas em uma frase só).
  summary_points: z.array(z.string()).max(60).optional().nullable(),
});

// Junta os pontos num resumo: um único ponto vira um parágrafo simples; vários
// pontos viram bullets (um por linha).
export function pointsToSummary(points: string[] | null | undefined): string | null {
  const pts = (points ?? []).map((p) => p.trim()).filter(Boolean);
  if (pts.length === 0) return null;
  if (pts.length === 1) return pts[0];
  return pts.map((p) => `- ${p.replace(/^-\s*/, "")}`).join("\n");
}

export function parseClassification(raw: unknown, validSlugs: string[]): Classification {
  const parsed = resultSchema.parse(raw);
  if (!validSlugs.includes(parsed.category_slug)) {
    throw new Error(`invalid category: ${parsed.category_slug}`);
  }
  return {
    categorySlug: parsed.category_slug,
    title: parsed.title,
    summary: pointsToSummary(parsed.summary_points),
  };
}

export function fallbackClassification(payload: ClassifyPayload): Classification {
  const fromSubject = payload.subject?.trim();
  const fromText = payload.text?.trim().split("\n")[0]?.trim();
  const title = fromSubject || fromText || "Screenshot / sem título";
  return { categorySlug: OUTROS_SLUG, title: title.slice(0, 200), summary: null };
}

export function buildGeminiRequest(payload: ClassifyPayload, categories: CategoryLite[]) {
  const slugs = categories.map((c) => c.slug);
  const list = categories.map((c) => `- ${c.slug}: ${c.name}`).join("\n");

  const parts: Array<Record<string, unknown>> = [];
  if (payload.image) {
    parts.push({ inline_data: { mime_type: payload.image.mediaType, data: payload.image.base64 } });
  }
  const textParts = [
    payload.sender ? `Remetente: ${payload.sender}` : "",
    payload.subject ? `Assunto: ${payload.subject}` : "",
    payload.text ? `Conteúdo:\n${payload.text}` : "",
  ].filter(Boolean).join("\n\n");
  parts.push({
    text:
      `Você organiza a caixa de entrada pessoal de alguém. Para o item abaixo, em português, ` +
      `gere: a categoria, um título curto (máx ~8 palavras) e o resumo em pontos (summary_points).\n\n` +
      `O resumo (summary_points) deve conter UM item de array para CADA tópico, tarefa, decisão, ` +
      `item ou passo presente no conteúdo, cobrindo tudo do começo ao fim, sem omitir nada e sem ` +
      `juntar itens diferentes num mesmo ponto. Se o conteúdo for um único assunto simples, use um ` +
      `único item descrevendo-o. Seja fiel ao conteúdo.\n\n` +
      `Categorias:\n${list}\n\n${textParts || "(sem texto — descreva/resuma a imagem)"}`,
  });

  return {
    contents: [{ parts }],
    generationConfig: {
      maxOutputTokens: 2000,
      // Desliga o "thinking" do Gemini 2.5: com ele ligado o modelo às vezes
      // ignora a instrução e devolve um resumo curto de uma frase. Desligado,
      // ele segue o schema e resume o conteúdo completo em bullets de forma estável.
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          category_slug: { type: "STRING", enum: slugs, description: "A categoria escolhida da lista." },
          title: { type: "STRING", description: "Título curto e descritivo, máx ~8 palavras." },
          summary_points: {
            type: "ARRAY",
            items: { type: "STRING" },
            description:
              "Um item para CADA tópico, tarefa, decisão, item ou passo do conteúdo, cobrindo tudo " +
              "do começo ao fim. Um único item se o conteúdo for um assunto simples.",
          },
        },
        propertyOrdering: ["category_slug", "title", "summary_points"],
        required: ["category_slug", "title", "summary_points"],
      },
    },
  };
}

// Real transport — only called at runtime. Kept inside classifyInput's try, so a
// missing key or a network/API error falls back instead of losing the input.
async function geminiGenerate(body: unknown): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!res.ok) throw new Error(`gemini http ${res.status}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("gemini: no text in response");
  return text;
}

export async function classifyInput(
  payload: ClassifyPayload,
  categories: CategoryLite[],
  generate: GenerateFn = geminiGenerate,
): Promise<Classification> {
  try {
    const raw = await generate(buildGeminiRequest(payload, categories));
    return parseClassification(JSON.parse(raw), categories.map((c) => c.slug));
  } catch {
    return fallbackClassification(payload);
  }
}
