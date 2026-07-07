import { describe, it, expect } from "vitest";
import {
  parseClassification, fallbackClassification, classifyInput,
} from "@/lib/classify";

const CATS = [
  { slug: "ler-depois", name: "Ler / Ver depois" },
  { slug: "inspiracao", name: "Inspiração / Referência" },
  { slug: "outros", name: "Outros" },
];

describe("parseClassification", () => {
  it("accepts a valid tool result", () => {
    const out = parseClassification(
      { category_slug: "inspiracao", title: "Um site legal", summary: "Ref de UI." },
      CATS.map((c) => c.slug),
    );
    expect(out).toEqual({ categorySlug: "inspiracao", title: "Um site legal", summary: "Ref de UI." });
  });
  it("throws on an unknown category", () => {
    expect(() =>
      parseClassification({ category_slug: "xpto", title: "t", summary: "s" }, ["outros"]),
    ).toThrow();
  });
  it("throws on a missing title", () => {
    expect(() =>
      parseClassification({ category_slug: "outros", summary: "s" }, ["outros"]),
    ).toThrow();
  });
});

describe("fallbackClassification", () => {
  it("uses subject as title when present", () => {
    const out = fallbackClassification({ subject: "Assunto X", text: "corpo" });
    expect(out).toEqual({ categorySlug: "outros", title: "Assunto X", summary: null });
  });
  it("falls back to first line of text", () => {
    const out = fallbackClassification({ text: "primeira linha\nsegunda" });
    expect(out.title).toBe("primeira linha");
  });
  it("uses a generic title when nothing usable", () => {
    const out = fallbackClassification({});
    expect(out.title.length).toBeGreaterThan(0);
  });
});

describe("classifyInput", () => {
  it("returns parsed result when the client succeeds", async () => {
    const fakeClient = {
      messages: {
        create: async () => ({
          content: [{ type: "tool_use", name: "classificar",
            input: { category_slug: "ler-depois", title: "Artigo", summary: "resumo" } }],
        }),
      },
    };
    const out = await classifyInput(
      { subject: "s", text: "t" }, CATS, fakeClient as never,
    );
    expect(out.categorySlug).toBe("ler-depois");
  });
  it("falls back when the client throws", async () => {
    const fakeClient = { messages: { create: async () => { throw new Error("boom"); } } };
    const out = await classifyInput(
      { subject: "Assunto Y", text: "t" }, CATS, fakeClient as never,
    );
    expect(out).toEqual({ categorySlug: "outros", title: "Assunto Y", summary: null });
  });
});
