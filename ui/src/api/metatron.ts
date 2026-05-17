import { api } from "./client";

export interface MetatronHubBootstrapResult {
  company: { id: string; name: string; issuePrefix: string; created: boolean };
  projects: Array<{ key: string; id: string; name: string; created: boolean }>;
  agents: Array<{ key: string; id: string; name: string; created: boolean }>;
}

export interface MetatronCodingTaskResult {
  route: {
    projectKey: string;
    assigneeKey: string;
    priority: "critical" | "high" | "medium" | "low";
    reason: string;
    acceptanceCriteria: string[];
  };
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

export const metatronApi = {
  bootstrapThe: () => api.post<MetatronHubBootstrapResult>("/metatron/bootstrap-the", {}),
  createCodingTask: (data: { title?: string; message: string; requestedBy?: string }) =>
    api.post<MetatronCodingTaskResult>("/metatron/coding-tasks", data),
};
