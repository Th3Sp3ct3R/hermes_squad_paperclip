/**
 * Agent Messages service — directed messaging for agent↔agent and
 * user↔agent. Uses the `agent_messages` table.
 *
 * Sender + recipient are polymorphic:
 *   - sender:    fromAgentId  XOR  fromUserId   (one set, one null)
 *   - recipient: toAgentId    XOR  toUserId
 *
 * Threads: every message has a stable thread_id. The first message in a
 * conversation is its own thread (thread_id = id). Replies inherit the
 * parent's thread_id and link via in_reply_to.
 *
 * Live updates: every send fires a publishLiveEvent so subscribed
 * dashboards / agent inboxes see the message in real time.
 */
import { agentMessages, type AgentMessage, type Db } from "@paperclipai/db";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { logger } from "../middleware/logger.js";
import { publishLiveEvent } from "./live-events.js";

export interface SendAgentMessageInput {
  companyId: string;
  fromAgentId?: string | null;
  fromUserId?: string | null;
  toAgentId?: string | null;
  toUserId?: string | null;
  /** When this is a reply, parent message id. */
  inReplyTo?: string | null;
  kind?: "request" | "response" | "broadcast" | "alert" | "chat";
  subject?: string;
  body: string;
  bodyMeta?: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
}

export interface ListAgentMessagesInput {
  companyId: string;
  /** Filter to messages received by this agent. */
  toAgentId?: string;
  /** Filter to messages received by this user. */
  toUserId?: string;
  /** Filter to messages sent by this agent. */
  fromAgentId?: string;
  /** Filter to messages sent by this user. */
  fromUserId?: string;
  /** All messages in a single thread. */
  threadId?: string;
  /** Default 50, max 200. */
  limit?: number;
}

export function agentMessagesService(db: Db) {
  return {
    /**
     * Send a new message OR a reply. Validates exactly one sender + one
     * recipient is set. Computes threadId — if inReplyTo is given, inherits
     * the parent's threadId; otherwise this message starts a new thread
     * (threadId = its own id, set after insert via UPDATE).
     */
    async send(input: SendAgentMessageInput): Promise<AgentMessage> {
      const senderCount =
        Number(!!input.fromAgentId) + Number(!!input.fromUserId);
      const recipientCount =
        Number(!!input.toAgentId) + Number(!!input.toUserId);
      if (senderCount !== 1) {
        throw new Error(
          "[agent-messages] exactly one of fromAgentId/fromUserId must be set",
        );
      }
      if (recipientCount !== 1) {
        throw new Error(
          "[agent-messages] exactly one of toAgentId/toUserId must be set",
        );
      }
      if (!input.body.trim()) {
        throw new Error("[agent-messages] body is required");
      }

      // Resolve thread_id
      let threadId: string;
      if (input.inReplyTo) {
        const parent = await db
          .select({ threadId: agentMessages.threadId })
          .from(agentMessages)
          .where(eq(agentMessages.id, input.inReplyTo))
          .limit(1);
        if (!parent[0]) {
          throw new Error(
            `[agent-messages] inReplyTo references missing message ${input.inReplyTo}`,
          );
        }
        threadId = parent[0].threadId;
      } else {
        // Self-thread — set to a fresh UUID, then we'll backfill to the new
        // message's id after insert (so threads are always traceable from
        // their first message). We use a placeholder + UPDATE because
        // INSERT RETURNING can't reference its own id in the same statement.
        threadId = crypto.randomUUID();
      }

      const [row] = await db
        .insert(agentMessages)
        .values({
          companyId: input.companyId,
          fromAgentId: input.fromAgentId ?? null,
          fromUserId: input.fromUserId ?? null,
          toAgentId: input.toAgentId ?? null,
          toUserId: input.toUserId ?? null,
          inReplyTo: input.inReplyTo ?? null,
          threadId,
          kind: input.kind ?? "chat",
          subject: input.subject ?? null,
          body: input.body,
          bodyMeta: input.bodyMeta ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
        })
        .returning();
      if (!row) throw new Error("[agent-messages] insert returned no row");

      // For top-of-thread messages, retro-set threadId to match own id.
      if (!input.inReplyTo) {
        await db
          .update(agentMessages)
          .set({ threadId: row.id })
          .where(eq(agentMessages.id, row.id));
        row.threadId = row.id;
      }

      // Realtime fan-out
      try {
        publishLiveEvent({
          companyId: input.companyId,
          type: "activity.logged",
          payload: {
            kind: "agent_message.created",
            messageId: row.id,
            threadId: row.threadId,
            from: input.fromAgentId
              ? { kind: "agent", id: input.fromAgentId }
              : { kind: "user", id: input.fromUserId },
            to: input.toAgentId
              ? { kind: "agent", id: input.toAgentId }
              : { kind: "user", id: input.toUserId },
            messageKind: row.kind,
            subject: row.subject ?? null,
            preview: input.body.slice(0, 140),
          },
        });
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[agent-messages] live event publish failed (non-fatal)",
        );
      }

      return row;
    },

    /** List messages with the given filters. Default 50 most recent. */
    async list(input: ListAgentMessagesInput): Promise<AgentMessage[]> {
      const conditions = [eq(agentMessages.companyId, input.companyId)];
      if (input.threadId) {
        conditions.push(eq(agentMessages.threadId, input.threadId));
      }
      if (input.toAgentId) {
        conditions.push(eq(agentMessages.toAgentId, input.toAgentId));
      }
      if (input.toUserId) {
        conditions.push(eq(agentMessages.toUserId, input.toUserId));
      }
      if (input.fromAgentId) {
        conditions.push(eq(agentMessages.fromAgentId, input.fromAgentId));
      }
      if (input.fromUserId) {
        conditions.push(eq(agentMessages.fromUserId, input.fromUserId));
      }
      const limit = Math.min(input.limit ?? 50, 200);
      // For thread fetches, sort ascending so the conversation reads top→bottom.
      const orderCol = input.threadId
        ? agentMessages.createdAt
        : desc(agentMessages.createdAt);
      return db
        .select()
        .from(agentMessages)
        .where(and(...conditions))
        .orderBy(orderCol)
        .limit(limit);
    },

    /** Mark a message read (sets read_at + status). */
    async markRead(messageId: string, companyId: string): Promise<AgentMessage | null> {
      const now = new Date();
      const [row] = await db
        .update(agentMessages)
        .set({ status: "read", readAt: now, updatedAt: now })
        .where(
          and(
            eq(agentMessages.id, messageId),
            eq(agentMessages.companyId, companyId),
          ),
        )
        .returning();
      return row ?? null;
    },

    /** Archive a message (hide from inbox). */
    async archive(messageId: string, companyId: string): Promise<AgentMessage | null> {
      const now = new Date();
      const [row] = await db
        .update(agentMessages)
        .set({ status: "archived", updatedAt: now })
        .where(
          and(
            eq(agentMessages.id, messageId),
            eq(agentMessages.companyId, companyId),
          ),
        )
        .returning();
      return row ?? null;
    },

    /** Counts for a recipient (used by sidebar/inbox badges). */
    async unreadCount(input: {
      companyId: string;
      toAgentId?: string;
      toUserId?: string;
    }): Promise<number> {
      const conditions = [
        eq(agentMessages.companyId, input.companyId),
        eq(agentMessages.status, "unread"),
      ];
      if (input.toAgentId) {
        conditions.push(eq(agentMessages.toAgentId, input.toAgentId));
      } else if (input.toUserId) {
        conditions.push(eq(agentMessages.toUserId, input.toUserId));
      } else {
        return 0;
      }
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(agentMessages)
        .where(and(...conditions));
      return rows[0]?.count ?? 0;
    },
  };
}
