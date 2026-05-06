/**
 * Hermes Voice WebSocket server.
 *
 * Mounts at /api/hermes/voice via HTTP upgrade.
 * Each connection gets a HermesVoiceSession instance.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { HermesVoiceSession } from "./voice-session.js";

let wss: WebSocketServer | null = null;
const activeSessions = new Map<WebSocket, HermesVoiceSession>();

/**
 * Initialize the Hermes voice WebSocket server.
 * Call this once during server startup, passing the HTTP server instance.
 */
export function initHermesVoiceWs(server: Server): void {
  wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws: WebSocket) => {
    const session = new HermesVoiceSession(ws);
    activeSessions.set(ws, session);

    ws.on("close", () => {
      activeSessions.delete(ws);
    });
  });

  // Handle HTTP upgrade for /api/hermes/voice
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = req.url ?? "";

    if (url.startsWith("/api/hermes/voice")) {
      wss!.handleUpgrade(req, socket, head, (ws) => {
        wss!.emit("connection", ws, req);
      });
    }
    // Note: don't call socket.destroy() here — other upgrade handlers
    // (like live-events-ws) may handle non-matching paths
  });
}

/**
 * Get the count of active voice sessions (for monitoring).
 */
export function getActiveVoiceSessionCount(): number {
  return activeSessions.size;
}
