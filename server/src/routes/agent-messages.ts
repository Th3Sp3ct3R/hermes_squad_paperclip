import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess } from "./authz.js";
import { agentMessagesService } from "../services/agent-messages.js";

const sendSchema = z
  .object({
    companyId: z.string().uuid(),
    fromAgentId: z.string().uuid().optional().nullable(),
    fromUserId: z.string().min(1).optional().nullable(),
    toAgentId: z.string().uuid().optional().nullable(),
    toUserId: z.string().min(1).optional().nullable(),
    inReplyTo: z.string().uuid().optional().nullable(),
    kind: z.enum(["request", "response", "broadcast", "alert", "chat"]).optional(),
    subject: z.string().max(200).optional(),
    body: z.string().min(1).max(20_000),
    bodyMeta: z.record(z.unknown()).optional(),
    entityType: z.string().max(100).optional(),
    entityId: z.string().max(200).optional(),
  })
  .refine(
    (v) => Number(!!v.fromAgentId) + Number(!!v.fromUserId) === 1,
    { message: "exactly one of fromAgentId/fromUserId must be set" },
  )
  .refine(
    (v) => Number(!!v.toAgentId) + Number(!!v.toUserId) === 1,
    { message: "exactly one of toAgentId/toUserId must be set" },
  );

const listQuerySchema = z.object({
  companyId: z.string().uuid(),
  toAgentId: z.string().uuid().optional(),
  toUserId: z.string().min(1).optional(),
  fromAgentId: z.string().uuid().optional(),
  fromUserId: z.string().min(1).optional(),
  threadId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export function agentMessageRoutes(db: Db) {
  const router = Router();
  const svc = agentMessagesService(db);

  // ── POST /api/agent-messages — send a new message or reply
  router.post("/agent-messages", validate(sendSchema), async (req, res) => {
    const body = req.body as z.infer<typeof sendSchema>;
    assertCompanyAccess(req, body.companyId);
    const message = await svc.send(body);
    res.status(201).json(message);
  });

  // ── GET /api/agent-messages?companyId=&toAgentId=...
  router.get("/agent-messages", async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid query", issues: parsed.error.issues });
      return;
    }
    assertCompanyAccess(req, parsed.data.companyId);
    const messages = await svc.list(parsed.data);
    res.json(messages);
  });

  // ── GET /api/agent-messages/threads/:threadId?companyId=
  router.get("/agent-messages/threads/:threadId", async (req, res) => {
    const threadId = req.params.threadId as string;
    const companyId = String(req.query.companyId ?? "");
    if (!companyId) {
      res.status(400).json({ error: "companyId is required" });
      return;
    }
    assertCompanyAccess(req, companyId);
    const messages = await svc.list({ companyId, threadId });
    res.json(messages);
  });

  // ── PATCH /api/agent-messages/:id  { companyId, action: 'read'|'archived' }
  router.patch(
    "/agent-messages/:id",
    validate(
      z.object({
        companyId: z.string().uuid(),
        action: z.enum(["read", "archived"]),
      }),
    ),
    async (req, res) => {
      const id = req.params.id as string;
      const body = req.body as { companyId: string; action: "read" | "archived" };
      assertCompanyAccess(req, body.companyId);
      const result =
        body.action === "read"
          ? await svc.markRead(id, body.companyId)
          : await svc.archive(id, body.companyId);
      if (!result) {
        res.status(404).json({ error: "message not found" });
        return;
      }
      res.json(result);
    },
  );

  // ── GET /api/agent-messages/unread-count?companyId=&toAgentId=|toUserId=
  router.get("/agent-messages/unread-count", async (req, res) => {
    const companyId = String(req.query.companyId ?? "");
    const toAgentId = req.query.toAgentId
      ? String(req.query.toAgentId)
      : undefined;
    const toUserId = req.query.toUserId
      ? String(req.query.toUserId)
      : undefined;
    if (!companyId) {
      res.status(400).json({ error: "companyId is required" });
      return;
    }
    assertCompanyAccess(req, companyId);
    const count = await svc.unreadCount({ companyId, toAgentId, toUserId });
    res.json({ count });
  });

  return router;
}
