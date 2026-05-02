import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const PLUGIN_ID = "paperclip.hermes-feed";
const PLUGIN_VERSION = "0.1.0";

const PAGE_ROUTE = "hermes-feed";
const PAGE_SLOT_ID = "hermes-feed-page";
const PAGE_EXPORT = "HermesFeedPage";
const SIDEBAR_SLOT_ID = "hermes-feed-sidebar";
const SIDEBAR_EXPORT = "HermesFeedSidebar";

/**
 * Live HermesBus event feed for InstaGrowth federation operators.
 * Connects to https://instagrowth-backend.onrender.com/api/hermes/stream
 * via SSE (auth: ?token=<jwt>) and renders events with priority colouring
 * and filter controls.
 */
const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Hermes Feed",
  description:
    "Real-time HermesBus event stream from operator connectors (heartbeats, federation push failures, account relogin alerts).",
  author: "Vanta Labs",
  categories: ["ui"],
  capabilities: ["ui.page.register", "ui.sidebar.register"],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      tasksMdPath: {
        type: "string",
        title: "TASKS.md path",
        description:
          "Absolute path to the TASKS.md file the plugin should display. Defaults to ~/Desktop/VAN/TASKS.md.",
        default: "",
      },
      hermesApiUrl: {
        type: "string",
        title: "Hermes API URL",
        description:
          "Base URL for the InstaGrowth backend that hosts /api/hermes/stream and /api/hermes/event.",
        default: "https://instagrowth-backend.onrender.com",
      },
    },
  },
  ui: {
    slots: [
      {
        type: "page",
        id: PAGE_SLOT_ID,
        displayName: "Hermes Feed",
        exportName: PAGE_EXPORT,
        routePath: PAGE_ROUTE,
      },
      {
        type: "sidebar",
        id: SIDEBAR_SLOT_ID,
        displayName: "Hermes Feed",
        exportName: SIDEBAR_EXPORT,
      },
    ],
  },
};

export default manifest;
