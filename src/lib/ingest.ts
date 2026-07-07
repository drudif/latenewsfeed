import { eq } from "drizzle-orm";
import { inputs, attachments, categories as categoriesTable } from "@/db/schema";
import type { NormalizedInput } from "./email";
import type { ImageStore } from "./r2";
import type { Classification, ClassifyPayload, CategoryLite } from "./classify";

export class EmptyInputError extends Error {
  constructor() {
    super("empty input: no text and no images");
    this.name = "EmptyInputError";
  }
}

// `any` so the same code runs against prod postgres.js AND pglite in tests.
// Every call site is covered by tests, so this is a deliberate escape hatch.
type AnyDb = any;

export type Classifier = (payload: ClassifyPayload, cats: CategoryLite[]) => Promise<Classification>;

export type IngestDeps = {
  db: AnyDb;
  store: ImageStore;
  classifier: Classifier;
};

const THIN_TEXT = 20; // chars; below this we lean on the image for vision classification

export async function ingestInput(deps: IngestDeps, input: NormalizedInput): Promise<string | null> {
  const { db, store, classifier } = deps;

  const hasText = input.text.trim().length > 0;
  if (!hasText && input.images.length === 0) {
    throw new EmptyInputError();
  }

  // Dedupe by message id.
  if (input.messageId) {
    const existing = await db.select({ id: inputs.id }).from(inputs)
      .where(eq(inputs.messageId, input.messageId)).limit(1);
    if (existing.length > 0) return null;
  }

  // Upload images. A failed upload does not lose the input.
  const uploaded: Array<{ r2Key: string; contentType: string; filename: string | null; status: "ok" | "failed" }> = [];
  for (const img of input.images) {
    try {
      const r2Key = await store.upload(img.buffer, img.contentType);
      uploaded.push({ r2Key, contentType: img.contentType, filename: img.filename, status: "ok" });
    } catch (err) {
      console.error("ingest: R2 upload failed", err);
      uploaded.push({ r2Key: "", contentType: img.contentType, filename: img.filename, status: "failed" });
    }
  }

  // Classify. Use the first image for vision when text is thin.
  const cats: CategoryLite[] = await db.select({ slug: categoriesTable.slug, name: categoriesTable.name })
    .from(categoriesTable);
  const firstImg = input.images[0];
  const useVision = input.text.trim().length < THIN_TEXT && firstImg;
  const payload: ClassifyPayload = {
    subject: input.subject, text: input.text, sender: input.sender,
    image: useVision ? { base64: firstImg.buffer.toString("base64"), mediaType: firstImg.contentType } : null,
  };
  const result = await classifier(payload, cats);

  // Insert input + attachments.
  const [row] = await db.insert(inputs).values({
    source: input.source,
    categorySlug: result.categorySlug,
    title: result.title,
    bodyText: input.text,
    html: input.html,
    sender: input.sender,
    subject: input.subject,
    summary: result.summary,
    messageId: input.messageId,
  }).returning({ id: inputs.id });

  if (uploaded.length > 0) {
    await db.insert(attachments).values(uploaded.map((u) => ({
      inputId: row.id, r2Key: u.r2Key, contentType: u.contentType,
      filename: u.filename, status: u.status,
    })));
  }
  return row.id;
}
