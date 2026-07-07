import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEmail } from "@/lib/email";

const fx = (n: string) => readFileSync(path.resolve(__dirname, "fixtures", n));

describe("parseEmail", () => {
  it("parses a plain-text email", async () => {
    const n = await parseEmail(fx("plain.eml"));
    expect(n.subject).toBe("Artigo interessante");
    expect(n.sender).toContain("fulano@example.com");
    expect(n.messageId).toBe("<abc123@example.com>");
    expect(n.text).toContain("design");
    expect(n.images).toHaveLength(0);
  });
  it("extracts image attachments", async () => {
    const n = await parseEmail(fx("with-image.eml"));
    expect(n.images).toHaveLength(1);
    expect(n.images[0].contentType).toBe("image/png");
    expect(n.images[0].buffer.length).toBeGreaterThan(0);
    expect(n.images[0].filename).toBe("shot.png");
  });
});
