import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildMetatronCommunicatorInstructions } from "../hermes/index.js";

let contextDir: string | null = null;

afterEach(() => {
  if (contextDir) {
    rmSync(contextDir, { recursive: true, force: true });
    contextDir = null;
  }
});

describe("buildMetatronCommunicatorInstructions", () => {
  it("loads canonical Metatron SOUL, registry, and routing files", () => {
    contextDir = mkdtempSync(join(tmpdir(), "metatron-context-"));
    writeFileSync(
      join(contextDir, "SOUL.md"),
      "Metatron owns cross-project orchestration and speaks as Julius's routing voice.",
    );
    writeFileSync(
      join(contextDir, "USER.md"),
      "Julius is The Architect and expects terse, routed execution.",
    );
    writeFileSync(
      join(contextDir, "REGISTRY.md"),
      "Paperclip / Suno | /Users/growthgod/gitgod/paperclip | Michael",
    );
    writeFileSync(
      join(contextDir, "ROUTING.md"),
      "Coding tasks route to Cowork, Paperclip adapters, or Paperclip-native former role agents based on project scope.",
    );

    const instructions = buildMetatronCommunicatorInstructions({
      METATRON_CONTEXT_DIR: contextDir,
    });

    expect(instructions).toContain("Metatron owns cross-project orchestration");
    expect(instructions).toContain("Julius is The Architect");
    expect(instructions).toContain("Paperclip / Suno");
    expect(instructions).toContain("Coding tasks route to Cowork");
  });

  it("keeps coding-task orchestration delegated to project executors", () => {
    const instructions = buildMetatronCommunicatorInstructions({});

    expect(instructions).toContain("Metatron decides what and where");
    expect(instructions).toContain("Coding tasks");
    expect(instructions).toContain("Paperclip");
    expect(instructions).toContain("Do not call OpenClaw by default");
  });
});
