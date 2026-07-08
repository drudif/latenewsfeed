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
  summary: z.string().max(4000).optional().nullable(),
});

// O modelo às vezes devolve bullets grudados ("- a- b- c"). Garante que cada
// bullet "- " comece em sua própria linha, sem tocar em traços no meio de
// palavras (ex: "bem-vindo") nem em quebras já existentes.
export function normalizeBullets(s: string | null | undefined): string | null {
  if (!s) return s ?? null;
  return s.replace(/([^\n])[ \t]*-[ \t]+/g, "$1\n- ").trim();
}

export function parseClassification(raw: unknown, validSlugs: string[]): Classification {
  const parsed = resultSchema.parse(raw);
  if (!validSlugs.includes(parsed.category_slug)) {
    throw new Error(`invalid category: ${parsed.category_slug}`);
  }
  return {
    categorySlug: parsed.category_slug,
    title: parsed.title,
    summary: normalizeBullets(parsed.summary),
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
      `gere categoria, título (máx ~8 palavras) e resumo.\n\n` +
      `REGRAS DO RESUMO (muito importante):\n` +
      `- Resuma o conteúdo do começo ao fim, sem omitir NADA relevante.\n` +
      `- Se houver uma lista, vários itens, tarefas, tópicos, decisões ou passos, crie UM BULLET ` +
      `para CADA um, cada bullet em SUA PRÓPRIA LINHA começando com "- ". NUNCA colapse vários ` +
      `itens numa frase só, e não junte itens diferentes no mesmo bullet.\n` +
      `- Só use um parágrafo curto (sem bullets) se o conteúdo for realmente um único assunto simples.\n\n` +
      `Exemplo — para o conteúdo "Tarefas: 1) comprar pão; 2) pagar aluguel; 3) ligar pro médico", ` +
      `o resumo correto seria:\n- Comprar pão.\n- Pagar o aluguel.\n- Ligar para o médico.\n\n` +
      `Categorias:\n${list}\n\n${textParts || "(sem texto — resuma a imagem)"}`,
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
          summary: {
            type: "STRING",
            description:
              "Resumo COMPLETO e detalhado do conteúdo, do começo ao fim: cubra TODOS os pontos, " +
              "dados, decisões e conclusões relevantes — não é uma sinopse de uma frase. " +
              "Se houver vários tópicos, itens, decisões ou passos, liste-os em bullets, uma linha " +
              "por item começando com '- '. Fiel ao conteúdo, em português.",
          },
        },
        propertyOrdering: ["category_slug", "title", "summary"],
        required: ["category_slug", "title", "summary"],
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
  const bodyStr = JSON.stringify(body);
  if (!res.ok) throw new Error(`gemini http ${res.status}`);
  const raw = await res.text();
  console.log(
    "GEMINI_DBG bodyLen", bodyStr.length,
    "fewshot", bodyStr.includes("Exemplo"),
    "thinking", bodyStr.includes("thinkingBudget"),
    "maxTok", bodyStr.includes("2000"),
    "resp", raw.replace(/\n/g, "\\n").slice(0, 500),
  );
  const data = JSON.parse(raw) as {
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
