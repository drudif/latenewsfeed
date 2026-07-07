import { describe, it, expect, vi } from "vitest";
import { makeTestDb, seedCategories } from "./helpers/db";
import { ingestInput, type Classifier } from "@/lib/ingest";
import { inputs, attachments } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { ImageStore } from "@/lib/r2";
import type { NormalizedInput } from "@/lib/email";

function fakeStore(): ImageStore {
  return { upload: vi.fn(async () => "inputs/fake.png"), publicUrl: (k) => `https://cdn/${k}` };
}
const okClassifier: Classifier = async () => ({ categorySlug: "ler-depois", title: "T", summary: "S" });

function baseInput(over: Partial<NormalizedInput> = {}): NormalizedInput {
  return { source: "email", sender: null, subject: "s", text: "corpo", html: null,
    messageId: null, images: [], ...over };
}

describe("ingestInput", () => {
  it("inserts an input and returns its id", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    const id = await ingestInput({ db, store: fakeStore(), classifier: okClassifier },
      baseInput());
    expect(id).toBeTruthy();
    const rows = await db.select().from(inputs).where(eq(inputs.id, id!));
    expect(rows[0].title).toBe("T");
    expect(rows[0].categorySlug).toBe("ler-depois");
  });

  it("dedupes by messageId", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    const deps = { db, store: fakeStore(), classifier: okClassifier };
    const a = await ingestInput(deps, baseInput({ messageId: "<dup@x>" }));
    const b = await ingestInput(deps, baseInput({ messageId: "<dup@x>" }));
    expect(a).toBeTruthy();
    expect(b).toBeNull();
    expect((await db.select().from(inputs)).length).toBe(1);
  });

  it("uploads images and records attachments", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    const store = fakeStore();
    const id = await ingestInput({ db, store, classifier: okClassifier },
      baseInput({ images: [{ buffer: Buffer.from("x"), contentType: "image/png", filename: "a.png" }] }));
    expect(store.upload).toHaveBeenCalledOnce();
    const att = await db.select().from(attachments).where(eq(attachments.inputId, id!));
    expect(att[0].status).toBe("ok");
    expect(att[0].r2Key).toBe("inputs/fake.png");
  });

  it("saves the input even when an upload fails, marking attachment failed", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    const store: ImageStore = { upload: async () => { throw new Error("r2 down"); }, publicUrl: (k) => k };
    const id = await ingestInput({ db, store, classifier: okClassifier },
      baseInput({ images: [{ buffer: Buffer.from("x"), contentType: "image/png", filename: "a.png" }] }));
    expect(id).toBeTruthy();
    const att = await db.select().from(attachments).where(eq(attachments.inputId, id!));
    expect(att[0].status).toBe("failed");
  });

  it("rejects empty inputs (no text, no images)", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    await expect(ingestInput({ db, store: fakeStore(), classifier: okClassifier },
      baseInput({ text: "", images: [] }))).rejects.toThrow();
  });

  it("passes the first image to the classifier when text is thin", async () => {
    const db = await makeTestDb(); await seedCategories(db);
    const classifier = vi.fn(okClassifier);
    await ingestInput({ db, store: fakeStore(), classifier },
      baseInput({ text: "", images: [{ buffer: Buffer.from("x"), contentType: "image/png", filename: null }] }));
    const payload = classifier.mock.calls[0][0];
    expect(payload.image).toBeTruthy();
  });
});
