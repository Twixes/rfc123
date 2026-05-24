import { describe, expect, it } from "vitest";
import {
  defaultRfcConfig,
  parseRfcConfig,
  rfcFilePath,
  serializeRfcConfig,
  todayYmd,
} from "./rfc-config";

describe("parseRfcConfig", () => {
  it("round-trips through serialize for the multi-directory shape", () => {
    const cfg = defaultRfcConfig({ layout: "multi-directory" });
    expect(parseRfcConfig(serializeRfcConfig(cfg))).toEqual({
      layout: "multi-directory",
      directory: "",
    });
  });

  it("falls back to defaults on garbage", () => {
    expect(parseRfcConfig("not json")).toEqual(defaultRfcConfig());
    expect(parseRfcConfig("null")).toEqual(defaultRfcConfig());
    expect(parseRfcConfig("[]")).toEqual(defaultRfcConfig());
  });

  it("coerces unknown layout to 'flat'", () => {
    const cfg = parseRfcConfig('{"layout":"by-status"}');
    expect(cfg.layout).toBe("flat");
  });

  it("does not persist directory or teams in serialized output", () => {
    const cfg = defaultRfcConfig({
      layout: "multi-directory",
      directory: "docs/rfcs",
    });
    const parsed = JSON.parse(serializeRfcConfig(cfg)) as Record<
      string,
      unknown
    >;
    expect(Object.keys(parsed)).toEqual(["layout"]);
    expect(parsed.directory).toBeUndefined();
    expect(parsed.teams).toBeUndefined();
  });
});

describe("rfcFilePath", () => {
  it("places flat-layout RFCs at repo root with date prefix", () => {
    const cfg = defaultRfcConfig({ directory: "" });
    expect(rfcFilePath(cfg, { slug: "foo-bar", date: "2026-05-24" })).toBe(
      "2026-05-24-foo-bar.md",
    );
  });

  it("nests by directory when configured", () => {
    const cfg = defaultRfcConfig({ directory: "docs/rfcs" });
    expect(rfcFilePath(cfg, { slug: "foo", date: "2026-05-24" })).toBe(
      "docs/rfcs/2026-05-24-foo.md",
    );
  });

  it("inserts team segment in multi-directory layout", () => {
    const cfg = defaultRfcConfig({
      layout: "multi-directory",
      directory: "",
    });
    expect(
      rfcFilePath(cfg, {
        team: "engineering",
        slug: "foo",
        date: "2026-05-24",
      }),
    ).toBe("engineering/2026-05-24-foo.md");
  });

  it("ignores team when layout is flat", () => {
    const cfg = defaultRfcConfig({ layout: "flat" });
    expect(
      rfcFilePath(cfg, {
        team: "ignored",
        slug: "foo",
        date: "2026-05-24",
      }),
    ).toBe("2026-05-24-foo.md");
  });

  it("drops missing team in multi-directory layout (falls back to root of directory)", () => {
    const cfg = defaultRfcConfig({
      layout: "multi-directory",
      directory: "rfcs",
    });
    expect(
      rfcFilePath(cfg, { team: null, slug: "foo", date: "2026-05-24" }),
    ).toBe("rfcs/2026-05-24-foo.md");
  });
});

describe("todayYmd", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(todayYmd(new Date("2026-05-24T18:30:00Z"))).toBe("2026-05-24");
  });
});
