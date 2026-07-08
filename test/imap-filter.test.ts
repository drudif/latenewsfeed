import { describe, it, expect } from "vitest";
import { acceptsEnvelope, parseSenders } from "@/lib/imap";

const TARGET = "latenewsfeed@gmail.com";
const ALLOWED = ["f.drudi@gmail.com", "fernando.drudi@convertperforma.com.br"];

describe("parseSenders", () => {
  it("splits, trims, lowercases, drops blanks", () => {
    expect(parseSenders(" A@x.com , B@Y.com ,")).toEqual(["a@x.com", "b@y.com"]);
    expect(parseSenders(undefined)).toEqual([]);
    expect(parseSenders("")).toEqual([]);
  });
});

describe("acceptsEnvelope", () => {
  const to = [{ address: TARGET }];

  it("rejects when not delivered to target", () => {
    expect(acceptsEnvelope({ to: [{ address: "outro@gmail.com" }], from: [{ address: ALLOWED[0] }] }, TARGET, ALLOWED)).toBe(false);
  });

  it("accepts an allowed sender delivered to target", () => {
    expect(acceptsEnvelope({ to, from: [{ address: "F.Drudi@Gmail.com" }] }, TARGET, ALLOWED)).toBe(true);
  });

  it("rejects a sender not in the allowlist", () => {
    expect(acceptsEnvelope({ to, from: [{ address: "estranho@spam.com" }] }, TARGET, ALLOWED)).toBe(false);
  });

  it("accepts any sender when the allowlist is empty", () => {
    expect(acceptsEnvelope({ to, from: [{ address: "qualquer@um.com" }] }, TARGET, [])).toBe(true);
  });

  it("rejects when there is no from and an allowlist is set", () => {
    expect(acceptsEnvelope({ to, from: [] }, TARGET, ALLOWED)).toBe(false);
  });
});
