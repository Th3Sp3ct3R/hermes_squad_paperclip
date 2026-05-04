"use client";
import { useEffect, useRef, useState, useCallback } from "react";

// ── design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: "#080808",
  card: "#0a0a0a",
  border: "rgba(255,255,255,0.08)",
  blue: "#3b82f6",
  purple: "#c084fc",
  red: "#ef4444",
  green: "#10b981",
  gold: "#c9a449",
  muted: "#6e6e6e",
  label: "#a1a1a1",
  dim: "#4a4a4a",
};

// ── event type ────────────────────────────────────────────────────────────────
type FeedEventKind = "error" | "cache" | "tool_run" | "info" | "warn" | "agent" | string;

interface FeedEvent {
  id: number;
  ts: string;
  kind: FeedEventKind;
  agent?: string;
  message: string;
  raw?: string;
}

// ── line color by kind ────────────────────────────────────────────────────────
function lineColor(kind: FeedEventKind): string {
  switch (kind) {
    case "error":    return C.red;
    case "cache":    return C.green;
    case "tool_run": return C.purple;
    case "warn":     return C.gold;
    case "agent":    return C.blue;
    default:         return "#7a7a7a";
  }
}

// ── parse raw SSE message ─────────────────────────────────────────────────────
let _idCounter = 0;
function parseEvent(rawData: string): FeedEvent {
  _idCounter += 1;
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  try {
    const parsed = JSON.parse(rawData);
    return {
      id: _idCounter,
      ts,
      kind: (parsed.kind ?? parsed.type ?? "info") as FeedEventKind,
      agent: parsed.agent ?? parsed.agentKey,
      message: parsed.text ?? parsed.message ?? parsed.msg ?? rawData,
      raw: rawData,
    };
  } catch {
    return {
      id: _idCounter,
      ts,
      kind: "info",
      message: rawData,
      raw: rawData,
    };
  }
}

// ── section header ────────────────────────────────────────────────────────────
function SectionHeader({ live }: { live: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <div style={{ width: 3, height: 16, background: C.green, borderRadius: 2, flexShrink: 0 }} />
      <span style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 11,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        fontVariant: "small-caps",
        color: C.label,
        fontWeight: 500,
      }}>
        𓂀 AKASHIC STREAM
      </span>

      {/* live indicator */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        <div
          className={live ? "animate-pulse-glow" : undefined}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: live ? C.green : C.muted,
            boxShadow: live ? `0 0 6px ${C.green}` : "none",
          }}
        />
        <span style={{
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          fontSize: 9,
          letterSpacing: "0.12em",
          color: live ? C.green : C.muted,
        }}>
          {live ? "LIVE" : "DISCONNECTED"}
        </span>
      </div>
    </div>
  );
}

// ── feed line ─────────────────────────────────────────────────────────────────
function FeedLine({ event }: { event: FeedEvent }) {
  const color = lineColor(event.kind);

  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      padding: "3px 0",
      lineHeight: 1.5,
    }}>
      {/* timestamp */}
      <span style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 11,
        color: C.dim,
        flexShrink: 0,
        minWidth: 60,
        userSelect: "none",
      }}>
        {event.ts}
      </span>

      {/* agent tag */}
      {event.agent && (
        <span style={{
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          fontSize: 11,
          color: C.blue,
          flexShrink: 0,
          minWidth: 72,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          [{event.agent}]
        </span>
      )}

      {/* kind tag for non-agent events */}
      {!event.agent && event.kind !== "info" && (
        <span style={{
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          fontSize: 11,
          color,
          flexShrink: 0,
          minWidth: 72,
        }}>
          [{event.kind}]
        </span>
      )}

      {/* message */}
      <span style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 11,
        color,
        wordBreak: "break-all",
        flex: 1,
      }}>
        {event.message}
      </span>
    </div>
  );
}

// ── max events kept in memory ─────────────────────────────────────────────────
const MAX_EVENTS = 100;

// ── main component ─────────────────────────────────────────────────────────────
export default function LiveFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  const addEvent = useCallback((evt: FeedEvent) => {
    setEvents((prev) => {
      const next = [...prev, evt];
      return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
    });
  }, []);

  // auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  // SSE connection
  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (esRef.current) {
        esRef.current.close();
      }

      const es = new EventSource("/api/feed/stream");
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setError(null);
        addEvent({
          id: ++_idCounter,
          ts: new Date().toLocaleTimeString("en-US", { hour12: false }),
          kind: "info",
          message: "Stream connected",
        });
      };

      es.onmessage = (e) => {
        const evt = parseEvent(e.data);
        addEvent(evt);
      };

      // named event types
      const kinds: FeedEventKind[] = ["error", "cache", "tool_run", "agent", "warn", "info"];
      for (const kind of kinds) {
        es.addEventListener(kind, (e: MessageEvent) => {
          addEvent(parseEvent(e.data));
        });
      }

      es.onerror = () => {
        setConnected(false);
        es.close();
        esRef.current = null;
        setError("Stream disconnected — retrying…");
        retryTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [addEvent]);

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: "20px 24px",
    }}>
      <SectionHeader live={connected} />

      {/* terminal viewport */}
      <div style={{
        background: C.bg,
        borderRadius: 6,
        border: `1px solid rgba(255,255,255,0.05)`,
        padding: "12px 14px",
        height: 360,
        overflowY: "auto",
        overflowX: "hidden",
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(255,255,255,0.08) transparent",
        position: "relative",
      }}>
        {events.length === 0 && !error && (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.dim,
            fontFamily: "'Geist Mono', ui-monospace, monospace",
            fontSize: 11,
            letterSpacing: "0.08em",
          }}>
            {connected ? "Waiting for events…" : "Connecting…"}
          </div>
        )}

        {error && events.length === 0 && (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.muted,
            fontFamily: "'Geist Mono', ui-monospace, monospace",
            fontSize: 11,
          }}>
            {error}
          </div>
        )}

        {events.map((evt) => (
          <FeedLine key={evt.id} event={evt} />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* status bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 10,
        padding: "0 2px",
      }}>
        <span style={{
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          fontSize: 9,
          color: C.dim,
          letterSpacing: "0.08em",
        }}>
          {events.length}/{MAX_EVENTS} events retained
        </span>
        {error && (
          <span style={{
            fontFamily: "'Geist Mono', ui-monospace, monospace",
            fontSize: 9,
            color: C.muted,
            letterSpacing: "0.06em",
          }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
