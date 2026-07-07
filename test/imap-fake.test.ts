import { describe, it, expect } from "vitest";
import { FakeMailReader } from "@/lib/imap";

describe("FakeMailReader", () => {
  it("returns only messages with uid > lastUid, and the max uid", async () => {
    const reader = new FakeMailReader([
      { uid: 1, raw: Buffer.from("a") },
      { uid: 2, raw: Buffer.from("b") },
      { uid: 3, raw: Buffer.from("c") },
    ]);
    const out = await reader.fetchNewMessages(1);
    expect(out.messages.map((m) => m.uid)).toEqual([2, 3]);
    expect(out.maxUid).toBe(3);
  });
  it("reports lastUid as maxUid when nothing is new", async () => {
    const reader = new FakeMailReader([{ uid: 5, raw: Buffer.from("x") }]);
    const out = await reader.fetchNewMessages(5);
    expect(out.messages).toEqual([]);
    expect(out.maxUid).toBe(5);
  });
});
