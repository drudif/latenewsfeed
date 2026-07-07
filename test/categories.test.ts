import { describe, it, expect } from "vitest";
import { slugify, DEFAULT_CATEGORIES, OUTROS_SLUG } from "@/lib/categories";

describe("slugify", () => {
  it("lowercases, strips accents, hyphenates", () => {
    expect(slugify("Inspiração / Referência")).toBe("inspiracao-referencia");
    expect(slugify("Ler / Ver depois")).toBe("ler-ver-depois");
    expect(slugify("  Pessoal!!  ")).toBe("pessoal");
  });
});

describe("default categories", () => {
  it("includes the outros fallback", () => {
    expect(DEFAULT_CATEGORIES.some((c) => c.slug === OUTROS_SLUG)).toBe(true);
  });
  it("has unique slugs", () => {
    const slugs = DEFAULT_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
