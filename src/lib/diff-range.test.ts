import { describe, expect, it } from "vitest";
import { formatDiffRange, parseDiffRange } from "./diff-range";

describe("parseDiffRange", () => {
  it("parses full 40-char SHAs", () => {
    const a = "a".repeat(40);
    const b = "b".repeat(40);
    expect(parseDiffRange(`${a}...${b}`)).toEqual({
      baseSha: a,
      compareSha: b,
    });
  });

  it("parses short SHAs (7 chars)", () => {
    expect(parseDiffRange("abc1234...def5678")).toEqual({
      baseSha: "abc1234",
      compareSha: "def5678",
    });
  });

  it("is case-insensitive", () => {
    expect(parseDiffRange("ABC1234...DEF5678")).toEqual({
      baseSha: "ABC1234",
      compareSha: "DEF5678",
    });
  });

  it("returns null for null, empty, or junk input", () => {
    expect(parseDiffRange(null)).toBeNull();
    expect(parseDiffRange("")).toBeNull();
    expect(parseDiffRange("not-a-range")).toBeNull();
    expect(parseDiffRange("abc..def")).toBeNull(); // two dots
    expect(parseDiffRange("abc...def")).toBeNull(); // too short (<7)
    expect(parseDiffRange("zzzzzzz...abc1234")).toBeNull(); // non-hex
  });
});

describe("formatDiffRange", () => {
  it("round-trips short SHAs through parseDiffRange", () => {
    const range = { baseSha: "abc1234", compareSha: "def5678" };
    expect(parseDiffRange(formatDiffRange(range))).toEqual(range);
  });

  it("truncates full SHAs to 7 chars so URLs stay readable", () => {
    expect(
      formatDiffRange({ baseSha: "a".repeat(40), compareSha: "b".repeat(40) }),
    ).toBe("aaaaaaa...bbbbbbb");
  });
});
