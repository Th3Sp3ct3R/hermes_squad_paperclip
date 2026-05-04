/**
 * Agent Messages — directed message channel for both agent↔agent and
 * user↔agent communication.
 *
 * Sender + recipient are polymorphic (agent OR user). Each row sets exactly
 * one of {fromAgentId, fromUserId} and one of {toAgentId, toUserId}.
 *
 * Messages can chain into threads via in_reply_to + thread_id. The thread_id
 * is stable across the whole conversation; in_reply_to lets the UI render
 * a tree if needed.
 *
 * Dashboard usages:
 *   - Cassiel detects stuck batch → from_agent=Cassiel, to_agent=Michael,
 *     kind='alert', body="batch X stuck 6h, 32 issues stranded"
 *   - User clicks "Message Zadkiel" → from_user=julian, to_agent=Zadkiel,
 *     kind='request', body="rework the chorus on track 7"
 *   - Raphael needs human input → from_agent=Raphael, to_user=julian,
 *     kind='request', body="canon variant unclear, please pick A or B"
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    // Sender — exactly one of these is set
    fromAgentId: uuid("from_agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    fromUserId: text("from_user_id"),

    // Recipient — exactly one of these is set
    toAgentId: uuid("to_agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    toUserId: text("to_user_id"),

    /** Threading. Self-referential. NULL on the first message in a thread. */
    inReplyTo: uuid("in_reply_to"),
    /** Stable across the whole conversation (= id of the first message). */
    threadId: uuid("thread_id").notNull(),

    /** 'request' | 'response' | 'broadcast' | 'alert' | 'chat' */
    kind: text("kind").notNull().default("chat"),
    /** Optional short subject line — useful for inbox previews. */
    subject: text("subject"),
    /** Markdown body. */
    body: text("body").notNull(),
    /** Optional structured payload — e.g. issue refs, batch IDs, audio URLs. */
    bodyMeta: jsonb("body_meta").$type<Record<string, unknown>>(),

    /** Optional cross-link to another entity in the system. */
    entityType: text("entity_type"),
    entityId: text("entity_id"),

    /** 'unread' | 'read' | 'replied' | 'archived' */
    status: text("status").notNull().default("unread"),
    readAt: timestamp("read_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index("agent_messages_company_created_idx").on(
      table.companyId,
      table.createdAt,
    ),
    threadIdx: index("agent_messages_thread_idx").on(table.threadId),
    toAgentIdx: index("agent_messages_to_agent_idx").on(
      table.toAgentId,
      table.status,
      table.createdAt,
    ),
    toUserIdx: index("agent_messages_to_user_idx").on(
      table.toUserId,
      table.status,
      table.createdAt,
    ),
  }),
);

export type AgentMessage = typeof agentMessages.$inferSelect;
export type AgentMessageInsert = typeof agentMessages.$inferInsert;
