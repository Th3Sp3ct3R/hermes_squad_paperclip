/**
 * Hermes Control Plane Client
 * Connects to standalone Hermes service (port 19000) for hierarchy, permissions, and approval gates.
 */

const HERMES_CONTROL_URL =
  process.env.HERMES_CONTROL_PLANE_URL || "http://localhost:19000";

export interface AgentHierarchyEntry {
  agentId: string;
  name: string;
  role: string;
  reportsTo?: string;
  team?: string;
  isActive: boolean;
}

export interface RolePermission {
  role: string;
  canSpawn: boolean;
  canApprove: boolean;
  canModifyHierarchy: boolean;
  maxAutonomyLevel: number;
  allowedTools: string[];
}

export interface CanActResponse {
  allowed: boolean;
  reason?: string;
  agentId: string;
  action: string;
}

/**
 * Get full hierarchy, permissions, and autonomy rules from control plane.
 */
export async function getHierarchy() {
  const res = await fetch(`${HERMES_CONTROL_URL}/api/hierarchyCheck`);
  if (!res.ok) throw new Error(`Failed to fetch hierarchy: ${res.statusText}`);
  return res.json();
}

/**
 * Check if an agent can perform a specific action.
 */
export async function canAgentAct(
  agentId: string,
  action: string
): Promise<CanActResponse> {
  const res = await fetch(`${HERMES_CONTROL_URL}/api/canAgentAct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, action }),
  });
  if (!res.ok)
    throw new Error(`canAgentAct failed: ${res.statusText}`);
  return res.json();
}

/**
 * Register or update an agent in the control plane hierarchy.
 */
export async function registerAgent({
  agentId,
  name,
  role,
  reportsTo,
  team,
}: {
  agentId: string;
  name: string;
  role: string;
  reportsTo?: string;
  team?: string;
}) {
  const res = await fetch(`${HERMES_CONTROL_URL}/api/registerAgent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, name, role, reportsTo, team }),
  });
  if (!res.ok)
    throw new Error(`registerAgent failed: ${res.statusText}`);
  return res.json();
}

/**
 * Health check for control plane.
 */
export async function healthCheck() {
  const res = await fetch(`${HERMES_CONTROL_URL}/api/health`);
  return res.json();
}
