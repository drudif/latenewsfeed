import { describe, it, expect } from "vitest";
import { isAuthed, AUTH_COOKIE } from "@/lib/auth";

describe("isAuthed", () => {
  it("passes when the cookie matches the secret", () => {
    expect(isAuthed("s3cr3t", "s3cr3t")).toBe(true);
  });
  it("fails when it does not match or is missing", () => {
    expect(isAuthed("nope", "s3cr3t")).toBe(false);
    expect(isAuthed(undefined, "s3cr3t")).toBe(false);
  });
  it("exposes a cookie name", () => {
    expect(AUTH_COOKIE).toBe("portal_auth");
  });
});
