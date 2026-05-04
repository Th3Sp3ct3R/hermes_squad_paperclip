/**
 * Agent Messages API client.
 * Wraps POST /api/agent-messages for sending messages from users to agents.
 */
import { api } from "./client";

export type AgentMessageKind = "request" | "response" | "broadcast" | "alert" | "chat";

export interface SendAgentMessageInput {
  companyId: string;
  fromUserId: string;
  toAgentId: string;
  kind?: AgentMessageKind;
  subject?: string;
  body: string;
  bodyMeta?: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
}

export interface AgentMessage {
  id: string;
  companyId: string;
  fromAgentId: string | null;
  fromUserId: string | null;
  toAgentId: string | null;
  toUserId: string | null;
  kind: AgentMessageKind;
  subject: string | null;
  body: string;
  createdAt: string;
}

export const agentMessagesApi = {
  send: (input: SendAgentMessageInput) =>
    api.post<AgentMessage>("/agent-messages", input),
};
