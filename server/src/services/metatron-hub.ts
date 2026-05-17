import type { Db } from "@paperclipai/db";
import { companies as companiesTable } from "@paperclipai/db";
import type { AgentIconName, AgentRole, IssuePriority, ProjectStatus } from "@paperclipai/shared";
import { eq, or } from "drizzle-orm";
import { agentService } from "./agents.js";
import { issueService } from "./issues.js";
import { projectService } from "./projects.js";

export interface FormerOpenClawRole {
  legacyId: string;
  paperclipKey: string;
  name: string;
  paperclipRole: AgentRole;
  title: string;
  domain: string;
  primaryTasks: string[];
  runtimeDependency: "none";
}

export interface MetatronHubProjectDefinition {
  key: string;
  name: string;
  description: string;
  status: ProjectStatus;
  color: string;
  path: string;
}

export interface MetatronHubAgentDefinition {
  key: string;
  name: string;
  role: AgentRole;
  title: string;
  icon: AgentIconName;
  capabilities: string;
  reportsToKey?: string;
  metadata?: Record<string, unknown>;
}

export interface MetatronCodingTaskRoute {
  projectKey: string;
  assigneeKey: string;
  priority: IssuePriority;
  reason: string;
  acceptanceCriteria: string[];
}

export interface MetatronHubBootstrapResult {
  company: { id: string; name: string; issuePrefix: string; created: boolean };
  projects: Array<{ key: string; id: string; name: string; created: boolean }>;
  agents: Array<{ key: string; id: string; name: string; created: boolean }>;
}

export interface MetatronCodingTaskInput {
  title?: string;
  message: string;
  requestedBy?: string;
}

export interface MetatronCodingTaskResult {
  route: MetatronCodingTaskRoute;
  issue: {
    id: string;
    identifier: string | null;
    title: string;
    projectId: string | null;
    assigneeAgentId: string | null;
  };
  project: { key: string; id: string; name: string };
  assignee: { key: string; id: string; name: string };
}

export const METATRON_HUB_COMPANY = {
  name: "THE",
  description: "Vanta Labs command company: one Paperclip-native hub for Metatron, projects, agents, and task routing.",
  brandColor: "#0b0f19",
};

export const METATRON_HUB_PROJECTS: MetatronHubProjectDefinition[] = [
  {
    key: "van-command",
    name: "VAN Command",
    description: "Project hub, canonical agent records, TASKS.md, operating context, and cross-project memory.",
    status: "in_progress",
    color: "#8b5cf6",
    path: "/Users/growthgod/Desktop/VAN",
  },
  {
    key: "paperclip",
    name: "Paperclip Platform",
    description: "Paperclip server, UI, agents, issues, orchestration routes, and hub behavior.",
    status: "in_progress",
    color: "#06b6d4",
    path: "/Users/growthgod/gitgod/paperclip",
  },
  {
    key: "paperclip-music",
    name: "Paperclip Music",
    description: "Suno/MiniMax music pipeline, Michael command flow, and Hermetica cockpit.",
    status: "in_progress",
    color: "#a855f7",
    path: "/Users/growthgod/gitgod/paperclip",
  },
  {
    key: "instagrowth",
    name: "InstaGrowth SaaS",
    description: "SaaS backend, parser, onboarding, billing, dashboard, client operations, and product workflows.",
    status: "planned",
    color: "#22c55e",
    path: "/Users/growthgod/Desktop/VAN/instagrowth-saas",
  },
  {
    key: "ghost-fleet",
    name: "GHOST Fleet and Devices",
    description: "GHOST device/account operations represented as Paperclip-native tasks without OpenClaw runtime dependency.",
    status: "planned",
    color: "#64748b",
    path: "/Users/growthgod/Desktop/VAN/VantaLABs_gg",
  },
  {
    key: "growth-content",
    name: "GrowthGod Content",
    description: "Growth content, social systems, posting workflows, and creative operations.",
    status: "planned",
    color: "#f97316",
    path: "/Users/growthgod/Desktop/VAN",
  },
  {
    key: "hermes-archangels",
    name: "Hermes and Archangels",
    description: "Hermes runtime context, archangel SOUL files, diagnostics, communications, and memory evolution.",
    status: "planned",
    color: "#eab308",
    path: "/Users/growthgod/.hermes",
  },
];

export const FORMER_OPENCLAW_ROLE_BREAKDOWN: FormerOpenClawRole[] = [
  {
    legacyId: "main",
    paperclipKey: "fleet-strategist",
    name: "Fleet Strategist",
    paperclipRole: "pm",
    title: "Former OpenClaw main / Sp3ct3R role translated into Paperclip-native fleet planning",
    domain: "GHOST fleet planning and device/account operations",
    primaryTasks: ["Plan fleet actions", "summarize device/account state", "prepare operator runbooks"],
    runtimeDependency: "none",
  },
  {
    legacyId: "sh3dw",
    paperclipKey: "shadow-analytics",
    name: "Shadow Analytics",
    paperclipRole: "researcher",
    title: "Analytics and pattern detection",
    domain: "Metrics, anomalies, growth patterns, and account performance",
    primaryTasks: ["Analyze engagement", "surface anomalies", "prepare experiments"],
    runtimeDependency: "none",
  },
  {
    legacyId: "sh3my4z4",
    paperclipKey: "posting-commander",
    name: "Posting Commander",
    paperclipRole: "pm",
    title: "Fleet and posting operations planner",
    domain: "Posting schedules, account queues, and execution readiness",
    primaryTasks: ["Plan posting waves", "coordinate content queues", "track readiness"],
    runtimeDependency: "none",
  },
  {
    legacyId: "p3n3mu3",
    paperclipKey: "model-research",
    name: "Model Research",
    paperclipRole: "researcher",
    title: "Model routing and research intelligence",
    domain: "Model selection, research, and API discovery",
    primaryTasks: ["Compare models", "research tools", "document routing choices"],
    runtimeDependency: "none",
  },
  {
    legacyId: "coder",
    paperclipKey: "code-architect",
    name: "Code Architect",
    paperclipRole: "engineer",
    title: "Code architecture and implementation lead",
    domain: "Repository code work, reviews, refactors, and implementation plans",
    primaryTasks: ["Implement code tasks", "review diffs", "design technical changes"],
    runtimeDependency: "none",
  },
  {
    legacyId: "s4m43l",
    paperclipKey: "strategy-research",
    name: "Strategy Research",
    paperclipRole: "researcher",
    title: "Research and analysis operator",
    domain: "Business, technical, and competitive analysis",
    primaryTasks: ["Synthesize research", "prepare briefs", "compare options"],
    runtimeDependency: "none",
  },
  {
    legacyId: "4z4z3l",
    paperclipKey: "interface-designer",
    name: "Interface Designer",
    paperclipRole: "designer",
    title: "Frontend, UI, and brand system lead",
    domain: "Dashboards, UI polish, design systems, and visual assets",
    primaryTasks: ["Design interfaces", "polish dashboards", "maintain visual language"],
    runtimeDependency: "none",
  },
  {
    legacyId: "k0k4b13l",
    paperclipKey: "monitoring-sentinel",
    name: "Monitoring Sentinel",
    paperclipRole: "devops",
    title: "Monitoring and deployment watcher",
    domain: "Deployments, uptime, service health, and operational watchlists",
    primaryTasks: ["Monitor services", "track deploy risk", "prepare incident notes"],
    runtimeDependency: "none",
  },
  {
    legacyId: "4b4dd0n",
    paperclipKey: "qa-gate",
    name: "QA Gate",
    paperclipRole: "qa",
    title: "Testing and verification gatekeeper",
    domain: "Automated tests, E2E checks, acceptance gates, and release quality",
    primaryTasks: ["Write test plans", "verify fixes", "block unsafe releases"],
    runtimeDependency: "none",
  },
  {
    legacyId: "g4dr33l",
    paperclipKey: "security-sentinel",
    name: "Security Sentinel",
    paperclipRole: "devops",
    title: "Security, proxy safety, and compliance operator",
    domain: "Secrets, proxy safety, anti-detection risk, and security review",
    primaryTasks: ["Audit secrets", "review proxy safety", "assess security risk"],
    runtimeDependency: "none",
  },
];

export const METATRON_HUB_AGENTS: MetatronHubAgentDefinition[] = [
  {
    key: "metatron",
    name: "Metatron",
    role: "ceo",
    title: "Cross-project orchestrator and memory",
    icon: "crown",
    capabilities: "Intent capture, project routing, task assignment, memory, and reporting across the Paperclip-native Vanta Labs hub.",
    metadata: { metatronHubKey: "metatron", runtimeDependency: "paperclip-native" },
  },
  {
    key: "cowork",
    name: "Cowork",
    role: "engineer",
    title: "Cursor coding executor",
    icon: "terminal",
    capabilities: "Executes code changes in Cursor, verifies tests, updates docs, and reports implementation evidence.",
    reportsToKey: "metatron",
    metadata: { metatronHubKey: "cowork", runtimeDependency: "cursor" },
  },
  {
    key: "michael",
    name: "Michael",
    role: "pm",
    title: "Paperclip Music domain commander",
    icon: "swords",
    capabilities: "Owns Suno/MiniMax music pipeline sequencing, auto-run readiness, and music issue command inside Paperclip.",
    reportsToKey: "metatron",
    metadata: { metatronHubKey: "michael", runtimeDependency: "paperclip-native" },
  },
  ...FORMER_OPENCLAW_ROLE_BREAKDOWN.map((legacyRole): MetatronHubAgentDefinition => ({
    key: legacyRole.paperclipKey,
    name: legacyRole.name,
    role: legacyRole.paperclipRole,
    title: legacyRole.title,
    icon: iconForFormerRole(legacyRole.paperclipKey),
    capabilities: `${legacyRole.domain}. ${legacyRole.primaryTasks.join("; ")}.`,
    reportsToKey: "metatron",
    metadata: {
      metatronHubKey: legacyRole.paperclipKey,
      legacyOpenClawId: legacyRole.legacyId,
      runtimeDependency: "none",
      paperclipNative: true,
    },
  })),
];

function iconForFormerRole(key: string): AgentIconName {
  const icons: Record<string, AgentIconName> = {
    "fleet-strategist": "radar",
    "shadow-analytics": "eye",
    "posting-commander": "rocket",
    "model-research": "telescope",
    "code-architect": "code",
    "strategy-research": "search",
    "interface-designer": "wand",
    "monitoring-sentinel": "radar",
    "qa-gate": "bug",
    "security-sentinel": "shield",
  };
  return icons[key] ?? "bot";
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

export function routeMetatronCodingTask(message: string): MetatronCodingTaskRoute {
  const lower = message.toLowerCase();

  if (includesAny(lower, ["deploy", "monitor", "uptime", "render", "vercel", "pm2", "oom", "137", "server"])) {
    return {
      projectKey: includesAny(lower, ["paperclip", "3100", "suno", "music"]) ? "paperclip" : "instagrowth",
      assigneeKey: "code-architect",
      priority: "high",
      reason: "Runtime/deployment language needs engineering ownership first, with monitoring support after fix.",
      acceptanceCriteria: ["Root cause is identified", "Target service starts cleanly", "Health endpoint or equivalent smoke check passes"],
    };
  }

  if (includesAny(lower, ["paperclip", "api", "backend", "route", "database", "schema", "typescript", "code"])) {
    return {
      projectKey: includesAny(lower, ["suno", "music", "song", "track"]) ? "paperclip-music" : "paperclip",
      assigneeKey: "code-architect",
      priority: "high",
      reason: "Application/code language maps to the code architect before downstream QA.",
      acceptanceCriteria: ["Target files are identified", "Implementation is tested", "Typecheck or targeted verification passes"],
    };
  }

  if (includesAny(lower, ["ui", "frontend", "design", "sidebar", "dashboard", "spacing", "visual"])) {
    return {
      projectKey: includesAny(lower, ["paperclip", "suno", "music"]) ? "paperclip" : "van-command",
      assigneeKey: "interface-designer",
      priority: "medium",
      reason: "UI/design language indicates interface work.",
      acceptanceCriteria: ["Visual change is implemented", "Relevant UI tests or lint checks pass", "Before/after behavior is described"],
    };
  }

  if (includesAny(lower, ["security", "secret", "credential", "proxy", "token", "auth", "permission"])) {
    return {
      projectKey: includesAny(lower, ["instagrowth", "parser", "scraper"]) ? "instagrowth" : "van-command",
      assigneeKey: "security-sentinel",
      priority: "high",
      reason: "Security/proxy/credential language requires the security sentinel.",
      acceptanceCriteria: ["Risk is identified", "Secret leakage is avoided", "Fix or mitigation is verified"],
    };
  }

  if (includesAny(lower, ["test", "qa", "verify", "regression", "playwright", "vitest", "e2e"])) {
    return {
      projectKey: includesAny(lower, ["paperclip", "suno", "music"]) ? "paperclip" : "van-command",
      assigneeKey: "qa-gate",
      priority: "medium",
      reason: "Testing/verification language maps to QA.",
      acceptanceCriteria: ["Failing case is reproduced when applicable", "Targeted tests pass", "Residual risk is stated"],
    };
  }

  if (includesAny(lower, ["suno", "music", "song", "track", "minimax", "audio"])) {
    return {
      projectKey: "paperclip-music",
      assigneeKey: "michael",
      priority: "medium",
      reason: "Music pipeline language belongs to Michael inside Paperclip Music.",
      acceptanceCriteria: ["Suno issue exists", "Pipeline status advances or failure is recorded", "Generated artifacts or blocker are visible"],
    };
  }

  if (includesAny(lower, ["instagrowth", "parser", "scraper", "onboarding", "billing", "client", "instagram"])) {
    return {
      projectKey: "instagrowth",
      assigneeKey: "code-architect",
      priority: "high",
      reason: "InstaGrowth product/backend language maps to the code architect for SaaS work.",
      acceptanceCriteria: ["Target InstaGrowth files are identified", "Implementation is verified", "Product impact is summarized"],
    };
  }

  if (includesAny(lower, ["ghost", "device", "geelark", "adb", "account", "fleet"])) {
    return {
      projectKey: "ghost-fleet",
      assigneeKey: "fleet-strategist",
      priority: "high",
      reason: "Fleet/device/account language maps to Paperclip-native fleet strategy.",
      acceptanceCriteria: ["Affected devices/accounts are named", "Action plan is explicit", "Execution evidence or blocker is recorded"],
    };
  }

  return {
    projectKey: "van-command",
    assigneeKey: "cowork",
    priority: "medium",
    reason: "No narrower project matched, so route to Cowork under VAN Command.",
    acceptanceCriteria: ["Owning project is confirmed", "Next executable task is created", "Verification method is stated"],
  };
}

function buildCodingTaskTitle(input: MetatronCodingTaskInput): string {
  const explicit = input.title?.trim();
  if (explicit) return explicit;
  const normalized = input.message.trim().replace(/\s+/g, " ");
  return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized;
}

function buildCodingTaskDescription(
  input: MetatronCodingTaskInput,
  route: MetatronCodingTaskRoute,
): string {
  return [
    "Created by Metatron's Paperclip-native routing layer.",
    "",
    `Request: ${input.message.trim()}`,
    input.requestedBy ? `Requested by: ${input.requestedBy}` : null,
    "",
    `Route reason: ${route.reason}`,
    "",
    "Acceptance criteria:",
    ...route.acceptanceCriteria.map((criterion) => `- ${criterion}`),
  ].filter((line): line is string => line !== null).join("\n");
}

async function ensureTheCompany(db: Db): Promise<MetatronHubBootstrapResult["company"]> {
  const existing = await db
    .select({
      id: companiesTable.id,
      name: companiesTable.name,
      issuePrefix: companiesTable.issuePrefix,
    })
    .from(companiesTable)
    .where(or(eq(companiesTable.issuePrefix, "THE"), eq(companiesTable.name, "THE")))
    .then((rows) => rows.find((row) => row.issuePrefix === "THE") ?? rows[0] ?? null);

  if (existing) {
    return { ...existing, created: false };
  }

  const inserted = await db
    .insert(companiesTable)
    .values({
      ...METATRON_HUB_COMPANY,
      issuePrefix: "THE",
    })
    .onConflictDoNothing({ target: companiesTable.issuePrefix })
    .returning({
      id: companiesTable.id,
      name: companiesTable.name,
      issuePrefix: companiesTable.issuePrefix,
    })
    .then((rows) => rows[0] ?? null);

  if (inserted) {
    return { ...inserted, created: true };
  }

  const raced = await db
    .select({
      id: companiesTable.id,
      name: companiesTable.name,
      issuePrefix: companiesTable.issuePrefix,
    })
    .from(companiesTable)
    .where(eq(companiesTable.issuePrefix, "THE"))
    .then((rows) => rows[0] ?? null);

  if (!raced) {
    throw new Error("Unable to create or load THE company");
  }

  return { ...raced, created: false };
}

export async function ensureMetatronHub(db: Db): Promise<MetatronHubBootstrapResult> {
  const projectsSvc = projectService(db);
  const agentsSvc = agentService(db);

  const company = await ensureTheCompany(db);

  const existingProjects = await projectsSvc.list(company.id);
  const projectsByName = new Map(existingProjects.map((project) => [project.name, project]));
  const seededProjects: MetatronHubBootstrapResult["projects"] = [];

  for (const definition of METATRON_HUB_PROJECTS) {
    const existing = projectsByName.get(definition.name);
    if (existing) {
      seededProjects.push({ key: definition.key, id: existing.id, name: existing.name, created: false });
      continue;
    }

    const created = await projectsSvc.create(company.id, {
      name: definition.name,
      description: `${definition.description}\n\nCanonical path: ${definition.path}`,
      status: definition.status,
      color: definition.color,
    });
    seededProjects.push({ key: definition.key, id: created.id, name: created.name, created: true });
  }

  const existingAgents = await agentsSvc.list(company.id, { includeTerminated: true });
  const agentsByHubKey = new Map<string, (typeof existingAgents)[number]>();
  const agentsByName = new Map(existingAgents.map((agent) => [agent.name, agent]));
  for (const agent of existingAgents) {
    const hubKey = typeof agent.metadata?.metatronHubKey === "string" ? agent.metadata.metatronHubKey : null;
    if (hubKey) agentsByHubKey.set(hubKey, agent);
  }

  const seededAgents: MetatronHubBootstrapResult["agents"] = [];
  const createdOrExistingByKey = new Map<string, { id: string; name: string }>();

  for (const definition of METATRON_HUB_AGENTS) {
    const existing = agentsByHubKey.get(definition.key) ?? agentsByName.get(definition.name);
    if (existing) {
      seededAgents.push({ key: definition.key, id: existing.id, name: existing.name, created: false });
      createdOrExistingByKey.set(definition.key, existing);
      continue;
    }

    const reportsTo = definition.reportsToKey
      ? createdOrExistingByKey.get(definition.reportsToKey)?.id ?? null
      : null;
    const created = await agentsSvc.create(company.id, {
      name: definition.name,
      role: definition.role,
      title: definition.title,
      icon: definition.icon,
      reportsTo,
      capabilities: definition.capabilities,
      adapterType: "process",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: definition.key === "metatron" ? { canCreateAgents: true } : {},
      metadata: { ...definition.metadata, metatronHubAgent: true },
    });
    seededAgents.push({ key: definition.key, id: created.id, name: created.name, created: true });
    createdOrExistingByKey.set(definition.key, created);
  }

  return {
    company,
    projects: seededProjects,
    agents: seededAgents,
  };
}

export async function createMetatronCodingTask(
  db: Db,
  input: MetatronCodingTaskInput,
): Promise<MetatronCodingTaskResult> {
  const hub = await ensureMetatronHub(db);
  const route = routeMetatronCodingTask(input.message);
  const issuesSvc = issueService(db);

  const projectDefinition = METATRON_HUB_PROJECTS.find((project) => project.key === route.projectKey)
    ?? METATRON_HUB_PROJECTS[0];
  const project = hub.projects.find((candidate) => candidate.key === projectDefinition.key);
  if (!project) {
    throw new Error(`Metatron hub project missing after bootstrap: ${projectDefinition.name}`);
  }

  const assigneeDefinition = METATRON_HUB_AGENTS.find((agent) => agent.key === route.assigneeKey)
    ?? METATRON_HUB_AGENTS.find((agent) => agent.key === "cowork")
    ?? METATRON_HUB_AGENTS[0];
  const assignee = hub.agents.find((candidate) => candidate.key === assigneeDefinition.key);
  if (!assignee) {
    throw new Error(`Metatron hub agent missing after bootstrap: ${assigneeDefinition.name}`);
  }

  const issue = await issuesSvc.create(hub.company.id, {
    title: buildCodingTaskTitle(input),
    description: buildCodingTaskDescription(input, route),
    status: "todo",
    priority: route.priority,
    projectId: project.id,
    assigneeAgentId: assignee.id,
    createdByAgentId: hub.agents.find((agent) => agent.key === "metatron")?.id ?? null,
  });

  return {
    route,
    issue: {
      id: issue.id,
      identifier: issue.identifier ?? null,
      title: issue.title,
      projectId: issue.projectId,
      assigneeAgentId: issue.assigneeAgentId,
    },
    project: { key: projectDefinition.key, id: project.id, name: project.name },
    assignee: { key: assigneeDefinition.key, id: assignee.id, name: assignee.name },
  };
}
