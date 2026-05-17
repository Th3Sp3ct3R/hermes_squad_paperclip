import { describe, expect, it } from "vitest";
import {
  FORMER_OPENCLAW_ROLE_BREAKDOWN,
  METATRON_HUB_AGENTS,
  routeMetatronCodingTask,
} from "../services/metatron-hub.js";

describe("Metatron hub role model", () => {
  it("turns every former OpenClaw role into a Paperclip-native agent definition", () => {
    const legacyIds = FORMER_OPENCLAW_ROLE_BREAKDOWN.map((role) => role.legacyId);

    expect(legacyIds).toEqual([
      "main",
      "sh3dw",
      "sh3my4z4",
      "p3n3mu3",
      "coder",
      "s4m43l",
      "4z4z3l",
      "k0k4b13l",
      "4b4dd0n",
      "g4dr33l",
    ]);
    expect(FORMER_OPENCLAW_ROLE_BREAKDOWN.every((role) => role.runtimeDependency === "none")).toBe(true);
  });

  it("includes the former roles in the THE hub agent seed", () => {
    const legacyIds = new Set(
      METATRON_HUB_AGENTS
        .map((agent) => agent.metadata?.legacyOpenClawId)
        .filter((legacyId): legacyId is string => typeof legacyId === "string"),
    );

    expect(legacyIds.has("coder")).toBe(true);
    expect(legacyIds.has("g4dr33l")).toBe(true);
    expect(legacyIds.has("main")).toBe(true);
  });
});

describe("routeMetatronCodingTask", () => {
  it("routes Paperclip coding tasks to the Paperclip project and code architect", () => {
    const route = routeMetatronCodingTask("Fix the Paperclip dev server OOM and add tests");

    expect(route.projectKey).toBe("paperclip");
    expect(route.assigneeKey).toBe("code-architect");
    expect(route.priority).toBe("high");
  });

  it("routes UI tasks to the design agent", () => {
    const route = routeMetatronCodingTask("Polish the dashboard UI spacing and sidebar design");

    expect(route.assigneeKey).toBe("interface-designer");
  });

  it("routes security/proxy tasks to the security sentinel", () => {
    const route = routeMetatronCodingTask("Audit proxy credentials and secret handling");

    expect(route.assigneeKey).toBe("security-sentinel");
  });
});
