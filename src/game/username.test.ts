import { describe, expect, it } from "vitest";
import {
  isValidUsername,
  normalizeUsername,
  usernameKey,
} from "./username";

describe("guest usernames", () => {
  it("trims and collapses whitespace without changing the saved display casing", () => {
    expect(normalizeUsername("  Musti   Driver  ")).toBe("Musti Driver");
  });

  it("builds case-insensitive keys from normalized names", () => {
    expect(usernameKey("  MuStI   Driver ")).toBe("musti driver");
    expect(usernameKey("musti driver")).toBe(usernameKey(" MuStI Driver "));
  });

  it("validates the normalized username length and character set", () => {
    expect(isValidUsername("  musti  ")).toBe(true);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("musti!")).toBe(false);
    expect(isValidUsername("a".repeat(19))).toBe(false);
  });
});
