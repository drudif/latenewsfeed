import { describe, it, expect } from "vitest";
import { normalizePaste } from "@/lib/paste";

describe("normalizePaste", () => {
  it("builds a paste NormalizedInput from text + files", () => {
    const n = normalizePaste("meu texto", [
      { buffer: Buffer.from("x"), contentType: "image/png", filename: "a.png" },
    ]);
    expect(n.source).toBe("paste");
    expect(n.text).toBe("meu texto");
    expect(n.images).toHaveLength(1);
    expect(n.messageId).toBeNull();
    expect(n.subject).toBeNull();
  });
});
