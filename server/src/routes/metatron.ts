import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import {
  createMetatronCodingTask,
  ensureMetatronHub,
  FORMER_OPENCLAW_ROLE_BREAKDOWN,
  METATRON_HUB_AGENTS,
  METATRON_HUB_PROJECTS,
  routeMetatronCodingTask,
} from "../services/metatron-hub.js";
import { assertBoard } from "./authz.js";

const createCodingTaskSchema = z.object({
  title: z.string().trim().min(1).optional(),
  message: z.string().trim().min(1),
  requestedBy: z.string().trim().min(1).optional(),
});

const routeCodingTaskSchema = z.object({
  message: z.string().trim().min(1),
});

export function metatronRoutes(db: Db) {
  const router = Router();

  router.get("/metatron/hub-blueprint", (req, res) => {
    assertBoard(req);
    res.json({
      company: { issuePrefix: "THE", name: "THE" },
      projects: METATRON_HUB_PROJECTS,
      agents: METATRON_HUB_AGENTS,
      formerOpenClawRoles: FORMER_OPENCLAW_ROLE_BREAKDOWN,
      runtimePolicy: "paperclip-native",
    });
  });

  router.post("/metatron/bootstrap-the", async (req, res) => {
    assertBoard(req);
    const result = await ensureMetatronHub(db);
    const created =
      result.company.created ||
      result.projects.some((project) => project.created) ||
      result.agents.some((agent) => agent.created);
    res.status(created ? 201 : 200).json(result);
  });

  router.post("/metatron/route-coding-task", validate(routeCodingTaskSchema), (req, res) => {
    assertBoard(req);
    const route = routeMetatronCodingTask(req.body.message);
    res.json({ route });
  });

  router.post("/metatron/coding-tasks", validate(createCodingTaskSchema), async (req, res) => {
    assertBoard(req);
    const result = await createMetatronCodingTask(db, req.body);
    res.status(201).json(result);
  });

  return router;
}
