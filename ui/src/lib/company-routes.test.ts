import { describe, expect, it } from "vitest";
import {
  applyCompanyPrefix,
  extractCompanyPrefixFromPath,
  toCompanyRelativePath,
} from "./company-routes";

describe("company route helpers", () => {
  it("prefixes the music dashboard route with the active company", () => {
    expect(applyCompanyPrefix("/music", "THE")).toBe("/THE/music");
    expect(applyCompanyPrefix("/music?tab=active", "THE")).toBe("/THE/music?tab=active");
  });

  it("treats music as a board route instead of a company prefix", () => {
    expect(extractCompanyPrefixFromPath("/music")).toBeNull();
    expect(toCompanyRelativePath("/THE/music")).toBe("/music");
  });
});
