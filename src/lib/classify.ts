import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { OUTROS_SLUG } from "./categories";

export const MODEL = "claude-haiku-4-5-20251001";

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

const resultSchema = z.object({
  category_slug: z.string().min(1),
  title: z.string().min(1).max(200),
  summary: z.string().max(500).optional().nullable(),
});

export function parseClassification(raw: unknown, validSlugs: string[]): Classification {
  const parsed = resultSchema.parse(raw);
  if (!validSlugs.includes(parsed.category_slug)) {
    throw new Error(`invalid category: ${parsed.category_slug}`);
  }
  return {
    categorySlug: parsed.category_slug,
    title: parsed.title,
    summary: parsed.summary ?? null,
  };
}

export function fallbackClassification(payload: ClassifyPayload): Classification {
  const fromSubject = payload.subject?.trim();
  const fromText = payload.text?.trim().split("\n")[0]?.trim();
  const title = fromSubject || fromText || "Screenshot / sem título";
  return { categorySlug: OUTROS_SLUG, title: title.slice(0, 200), summary: null };
}

export function buildClassifyRequest(payload: ClassifyPayload, categories: CategoryLite[]) {
  const slugs = categories.map((c) => c.slug);
  const list = categories.map((c) => `- ${c.slug}: ${c.name}`).join("\n");

  const content: Anthropic.ContentBlockParam[] = [];
  if (payload.image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: payload.image.mediaType as never, data: payload.image.base64 },
    });
  }
  const textParts = [
    payload.sender ? `Remetente: ${payload.sender}` : "",
    payload.subject ? `Assunto: ${payload.subject}` : "",
    payload.text ? `Conteúdo:\n${payload.text}` : "",
  ].filter(Boolean).join("\n\n");
  content.push({
    type: "text",
    text:
      `Classifique este item numa das categorias abaixo e gere um título curto (máx ~8 palavras) ` +
      `e um resumo de uma frase, em português.\n\nCategorias:\n${list}\n\n${textParts || "(sem texto — use a imagem)"}`,
  });

  return {
    model: MODEL,
    max_tokens: 400,
    tools: [{
      name: "classificar",
      description: "Registra a classificação do item.",
      input_schema: {
        type: "object" as const,
        properties: {
          category_slug: { type: "string", enum: slugs },
          title: { type: "string" },
          summary: { type: "string" },
        },
        required: ["category_slug", "title", "summary"],
      },
    }],
    tool_choice: { type: "tool" as const, name: "classificar" },
    messages: [{ role: "user" as const, content }],
  };
}

type MessagesClient = { messages: { create: (args: unknown) => Promise<{ content: unknown[] }> } };

export async function classifyInput(
  payload: ClassifyPayload,
  categories: CategoryLite[],
  client?: MessagesClient,
): Promise<Classification> {
  const anthropic = client ?? (new Anthropic() as unknown as MessagesClient);
  try {
    const res = await anthropic.messages.create(buildClassifyRequest(payload, categories));
    const toolUse = (res.content as Array<{ type: string; name?: string; input?: unknown }>)
      .find((b) => b.type === "tool_use" && b.name === "classificar");
    if (!toolUse) throw new Error("no tool_use block");
    return parseClassification(toolUse.input, categories.map((c) => c.slug));
  } catch {
    return fallbackClassification(payload);
  }
}
