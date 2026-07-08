import { describe, it, expect } from "vitest";
import {
  parseClassification, fallbackClassification, classifyInput, pointsToSummary,
} from "@/lib/classify";

const CATS = [
  { slug: "ler-depois", name: "Ler / Ver depois" },
  { slug: "inspiracao", name: "Inspiração / Referência" },
  { slug: "outros", name: "Outros" },
];

describe("pointsToSummary", () => {
  it("joins multiple points as bullet lines", () => {
    expect(pointsToSummary(["Comprar pão", "Pagar aluguel"])).toBe("- Comprar pão\n- Pagar aluguel");
  });
  it("returns a single point as a plain paragraph", () => {
    expect(pointsToSummary(["Um assunto simples."])).toBe("Um assunto simples.");
  });
  it("strips leading dashes the model may add", () => {
    expect(pointsToSummary(["- já com traço", "outro"])).toBe("- já com traço\n- outro");
  });
  it("returns null for empty/blank", () => {
    expect(pointsToSummary([])).toBeNull();
    expect(pointsToSummary(["  ", ""])).toBeNull();
    expect(pointsToSummary(null)).toBeNull();
  });
});

describe("parseClassification", () => {
  it("accepts a valid result and joins points", () => {
    const out = parseClassification(
      { category_slug: "inspiracao", title: "Um site legal", summary_points: ["Ref de UI", "Paleta de cores"] },
      CATS.map((c) => c.slug),
    );
    expect(out).toEqual({ categorySlug: "inspiracao", title: "Um site legal", summary: "- Ref de UI\n- Paleta de cores" });
  });
  it("throws on an unknown category", () => {
    expect(() =>
      parseClassification({ category_slug: "xpto", title: "t", summary_points: ["s"] }, ["outros"]),
    ).toThrow();
  });
  it("throws on a missing title", () => {
    expect(() =>
      parseClassification({ category_slug: "outros", summary_points: ["s"] }, ["outros"]),
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
      JSON.stringify({ category_slug: "ler-depois", title: "Artigo", summary_points: ["ponto 1", "ponto 2"] });
    const out = await classifyInput({ subject: "s", text: "t" }, CATS, generate);
    expect(out.categorySlug).toBe("ler-depois");
    expect(out.summary).toBe("- ponto 1\n- ponto 2");
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
      JSON.stringify({ category_slug: "inexistente", title: "x", summary_points: ["y"] });
    const out = await classifyInput({ subject: "Assunto W", text: "t" }, CATS, generate);
    expect(out.categorySlug).toBe("outros");
  });
});
