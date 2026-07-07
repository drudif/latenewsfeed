import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor } from "@/lib/cursor";

describe("cursor", () => {
  it("round-trips", () => {
    const c = { createdAt: "2026-07-07T12:00:00.000Z", id: "abc-123" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });
  it("returns null on garbage", () => {
    expect(decodeCursor("not-base64-!!")).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });
});
