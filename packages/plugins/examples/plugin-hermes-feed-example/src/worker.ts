import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Default path to the daily TASKS.md file produced by the Cowork briefing.
 * Override at runtime by setting plugin instance config `tasksMdPath`.
 */
const DEFAULT_TASKS_PATH = path.join(os.homedir(), "Desktop", "VAN", "TASKS.md");

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("hermes-feed plugin worker setup complete");

    // ── Action: read-tasks-md ────────────────────────────────────────────────
    // UI calls this via usePluginAction('read-tasks-md') to get the current
    // contents of VAN/TASKS.md so the dashboard panel can render it.
    ctx.actions.register("read-tasks-md", async (params) => {
      // Resolution order: explicit param > instanceConfig > default.
      const overridePath =
        typeof params.path === "string" && params.path.length > 0 ? params.path : null;
      let configPath: string | null = null;
      try {
        const config = (await ctx.config.get()) as { tasksMdPath?: string } | null;
        if (config && typeof config.tasksMdPath === "string" && config.tasksMdPath.length > 0) {
          configPath = config.tasksMdPath;
        }
      } catch {
        // config read failure is non-fatal; fall through to default
      }
      const targetPath = overridePath ?? configPath ?? DEFAULT_TASKS_PATH;

      try {
        const stat = await fs.stat(targetPath);
        const content = await fs.readFile(targetPath, "utf-8");
        return {
          ok: true,
          path: targetPath,
          content,
          mtime: stat.mtime.toISOString(),
          size: stat.size,
        };
      } catch (err: any) {
        return {
          ok: false,
          path: targetPath,
          error: err?.code === "ENOENT" ? "TASKS.md not found at this path" : (err?.message ?? String(err)),
          content: "",
        };
      }
    });
  },

  async onHealth() {
    return { status: "ok", message: "hermes-feed worker ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
