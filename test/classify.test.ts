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
  it("accepts a valid result", () => {
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
  it("returns parsed result when the model succeeds (JSON text)", async () => {
    const generate = async () =>
      JSON.stringify({ category_slug: "ler-depois", title: "Artigo", summary: "resumo" });
    const out = await classifyInput({ subject: "s", text: "t" }, CATS, generate);
    expect(out.categorySlug).toBe("ler-depois");
    expect(out.title).toBe("Artigo");
  });
  it("falls back when the model throws", async () => {
    const generate = async () => { throw new Error("boom"); };
    const out = await classifyInput({ subject: "Assunto Y", text: "t" }, CATS, generate);
    expect(out).toEqual({ categorySlug: "outros", title: "Assunto Y", summary: null });
  });
  it("falls back when the model returns invalid JSON", async () => {
    const generate = async () => "not json at all";
    const out = await classifyInput({ subject: "Assunto Z", text: "t" }, CATS, generate);
    expect(out.categorySlug).toBe("outros");
    expect(out.title).toBe("Assunto Z");
  });
  it("falls back when the model returns an unknown category", async () => {
    const generate = async () =>
      JSON.stringify({ category_slug: "inexistente", title: "x", summary: "y" });
    const out = await classifyInput({ subject: "Assunto W", text: "t" }, CATS, generate);
    expect(out.categorySlug).toBe("outros");
  });
});
