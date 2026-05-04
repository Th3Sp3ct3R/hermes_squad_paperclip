import { useEffect, useMemo, useRef, useState } from "react";
import type { PluginPageProps, PluginSidebarProps } from "@paperclipai/plugin-sdk/ui";
import { usePluginAction } from "@paperclipai/plugin-sdk/ui";

// ─── Types ──────────────────────────────────────────────────────────────────

type AgentRole =
  | "orchestrator"
  | "reactor"
  | "discoverer"
  | "analyst"
  | "scraper"
  | "browser"
  | "learner"
  | "guardian"
  | "openclaw";
type MessageType = "task" | "result" | "event" | "handoff" | "heartbeat";
type Priority = "low" | "normal" | "high" | "critical";

interface HermesMsg {
  id: string;
  from: AgentRole;
  to: AgentRole | "broadcast";
  type: MessageType;
  payload: any;
  mode: "plan" | "execute" | "verify";
  sessionId: string;
  priority: Priority;
  timestamp: string;
  correlationId?: string;
  __replay?: boolean;
}

type ConnState = "idle" | "connecting" | "open" | "error";

const DEFAULT_API = "https://instagrowth-backend.onrender.com";
const TOKEN_KEY = "hermes_token";
const API_KEY = "hermes_api_url";
const MAX_MESSAGES = 200;

// ─── Page (full /THE/plugins/{id} surface) ──────────────────────────────────

export function HermesFeedPage({ context }: PluginPageProps) {
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [apiUrl, setApiUrl] = useState<string>(() => localStorage.getItem(API_KEY) ?? DEFAULT_API);
  const [filterTo, setFilterTo] = useState<string>("any");
  const [filterType, setFilterType] = useState<string>("any");
  const [filterPriority, setFilterPriority] = useState<string>("any");
  const [conn, setConn] = useState<ConnState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<HermesMsg[]>([]);
  const [autoConnect, setAutoConnect] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    localStorage.setItem(TOKEN_KEY, token);
  }, [token]);
  useEffect(() => {
    localStorage.setItem(API_KEY, apiUrl);
  }, [apiUrl]);

  const streamUrl = useMemo(() => {
    if (!token) return null;
    const params = new URLSearchParams();
    params.set("token", token);
    params.set("replay", "20");
    if (filterTo !== "any") params.set("to", filterTo);
    if (filterType !== "any") params.set("type", filterType);
    if (filterPriority !== "any") params.set("priority", filterPriority);
    return `${apiUrl}/api/hermes/stream?${params.toString()}`;
  }, [apiUrl, token, filterTo, filterType, filterPriority]);

  function disconnect() {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setConn("idle");
  }

  function connect() {
    disconnect();
    if (!streamUrl) {
      setError("Set a JWT token first.");
      return;
    }
    setError(null);
    setConn("connecting");
    const es = new EventSource(streamUrl);
    esRef.current = es;

    es.addEventListener("open", () => setConn("open"));
    es.addEventListener("error", () => setConn("error"));
    es.addEventListener("replay", (e) => {
      try {
        const msg = JSON.parse((e as MessageEvent).data) as HermesMsg;
        msg.__replay = true;
        setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES));
      } catch { /* skip */ }
    });
    es.addEventListener("message", (e) => {
      try {
        const msg = JSON.parse((e as MessageEvent).data) as HermesMsg;
        setMessages((prev) => [msg, ...prev].slice(0, MAX_MESSAGES));
      } catch { /* skip */ }
    });
  }

  useEffect(() => {
    if (autoConnect && conn === "idle" && token) connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, streamUrl]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <span aria-hidden>📡</span> Hermes Feed
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time HermesBus events from operator connectors. Company:{" "}
            <code className="text-xs">{context.companyId ?? "—"}</code>
          </p>
        </div>
        <ConnBadge conn={conn} />
      </header>

      <section className="rounded-lg border bg-card p-4 space-y-3 shadow-sm">
        <h2 className="text-sm font-semibold">Connection</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Backend URL">
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder={DEFAULT_API}
              className="w-full bg-background border rounded px-2 py-1 text-sm"
            />
          </Field>
          <Field label="JWT Token">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="paste a JWT (POST /api/auth/login)"
              className="w-full bg-background border rounded px-2 py-1 text-sm"
            />
          </Field>
        </div>

        <hr className="border-border/60" />

        <div className="grid gap-3 sm:grid-cols-3">
          <FilterSelect
            label="to (agent role)"
            value={filterTo}
            onChange={setFilterTo}
            options={[
              "any", "broadcast", "orchestrator", "reactor", "discoverer", "analyst",
              "scraper", "browser", "learner", "guardian", "openclaw",
            ]}
          />
          <FilterSelect
            label="type"
            value={filterType}
            onChange={setFilterType}
            options={["any", "event", "task", "result", "handoff", "heartbeat"]}
          />
          <FilterSelect
            label="priority"
            value={filterPriority}
            onChange={setFilterPriority}
            options={["any", "critical", "high", "normal", "low"]}
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-1 items-center">
          {conn === "open" || conn === "connecting" ? (
            <button
              onClick={() => { disconnect(); setAutoConnect(false); }}
              className="text-sm border rounded px-3 py-1 hover:bg-accent"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => setAutoConnect(true)}
              disabled={!token}
              className="text-sm bg-primary text-primary-foreground rounded px-3 py-1 disabled:opacity-50"
            >
              Connect
            </button>
          )}
          <button
            onClick={() => setMessages([])}
            className="text-sm text-muted-foreground hover:text-foreground px-2 py-1"
          >
            Clear
          </button>
          {error && <span className="text-xs text-destructive">⚠ {error}</span>}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-lg border bg-card shadow-sm overflow-hidden">
          <header className="px-4 py-2 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Events <span className="text-muted-foreground font-normal">({messages.length})</span>
            </h2>
          </header>
          <div className="max-h-[60vh] overflow-y-auto">
            {messages.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-12">
                {conn === "open" ? "Connected — waiting for events…" : "Connect to start streaming."}
              </div>
            ) : (
              <ul className="divide-y divide-border font-mono text-xs">
                {messages.map((m) => <EventRow key={m.id} msg={m} />)}
              </ul>
            )}
          </div>
        </section>

        <div className="flex flex-col gap-4 sticky top-4 self-start">
          <TasksMdPanel
            title="Cowork Briefing"
            icon="📋"
            path="/Users/growthgod/Desktop/VAN/TASKS.md"
          />
          <TasksMdPanel
            title="Agent Board (OpenClaw)"
            icon="⚔️"
            path="/Users/growthgod/.openclaw/workspace/TASKS.md"
          />
        </div>
      </div>
    </div>
  );
}

// ─── TASKS.md panel ─────────────────────────────────────────────────────────
// Reusable sticky right-rail card. Polls the plugin worker (which reads the
// given path from disk) every 30s and renders the markdown.

interface TasksMdPanelProps {
  title: string;
  icon: string;
  path: string;
}

function TasksMdPanel({ title, icon, path }: TasksMdPanelProps) {
  const readTasks = usePluginAction("read-tasks-md");
  const [data, setData] = useState<{
    ok: boolean;
    path?: string;
    content: string;
    mtime?: string;
    error?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const result = await readTasks({ path }) as any;
      setData(result);
    } catch (err: any) {
      setData({ ok: false, content: "", error: err?.message ?? String(err) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return (
    <section className="rounded-lg border bg-card shadow-sm overflow-hidden flex flex-col max-h-[40vh]">
      <header className="px-4 py-2 border-b flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <span aria-hidden>{icon}</span> {title}
          {loading && <span className="text-xs text-muted-foreground">refreshing…</span>}
        </h2>
        <button
          onClick={refresh}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-label="refresh"
        >
          ↻
        </button>
      </header>
      <div className="overflow-y-auto p-4 flex-1">
        {!data ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : !data.ok ? (
          <div className="text-xs text-amber-500/90 space-y-2">
            <p>⚠ {data.error}</p>
            <p className="text-muted-foreground">
              Looking at: <code className="text-[11px]">{data.path}</code>
            </p>
          </div>
        ) : (
          <>
            <pre className="text-xs whitespace-pre-wrap break-words font-mono leading-snug">
              {data.content}
            </pre>
            {data.mtime && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                updated {new Date(data.mtime).toLocaleString()}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// ─── Sidebar (small status pill in left nav) ────────────────────────────────

export function HermesFeedSidebar({ context }: PluginSidebarProps) {
  // Use the plugin's page route under the company prefix to avoid breaking
  // the router's company prefix detection (relative <a> tags cause the
  // router to pick up "PLUGINS" as the company prefix).
  const prefix = context?.companyPrefix ?? "THE";
  return (
    <a
      href={`/${prefix}/hermes-feed`}
      className="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-accent transition-colors"
    >
      <span aria-hidden>𓂀</span>
      <span>Akashic Stream</span>
    </a>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-background border rounded px-2 py-1 text-sm"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  );
}

function ConnBadge({ conn }: { conn: ConnState }) {
  const map: Record<ConnState, [string, string]> = {
    open: ["text-emerald-500 border-emerald-500/30", "● connected"],
    connecting: ["text-zinc-300 border-zinc-500/30", "connecting…"],
    error: ["text-destructive border-destructive/30", "⚠ error"],
    idle: ["text-muted-foreground border-border", "idle"],
  };
  const [cls, label] = map[conn];
  return (
    <span className={`text-xs px-2 py-1 rounded border ${cls}`}>{label}</span>
  );
}

function EventRow({ msg }: { msg: HermesMsg }) {
  const ts = new Date(msg.timestamp);
  const kind = msg.payload?.kind ?? "";
  const summary = useMemo(() => {
    if (kind) return kind;
    try { return JSON.stringify(msg.payload).slice(0, 120); } catch { return ""; }
  }, [kind, msg.payload]);

  return (
    <li className={`px-4 py-2 grid grid-cols-[auto_auto_auto_auto_1fr] gap-3 items-start ${msg.__replay ? "opacity-60" : ""}`}>
      <span className="text-muted-foreground tabular-nums whitespace-nowrap">
        {ts.toLocaleTimeString()}
      </span>
      <PriorityDot priority={msg.priority} />
      <span className="text-zinc-300 whitespace-nowrap">
        {msg.from} <span className="text-muted-foreground">→</span> {msg.to}
      </span>
      <span className="text-muted-foreground whitespace-nowrap">[{msg.type}]</span>
      <details className="min-w-0">
        <summary className="cursor-pointer truncate select-none">{summary}</summary>
        <pre className="mt-2 text-xs text-muted-foreground bg-muted/40 p-2 rounded overflow-auto max-w-full">
{JSON.stringify(msg, null, 2)}
        </pre>
      </details>
    </li>
  );
}

function PriorityDot({ priority }: { priority: Priority }) {
  const cls =
    priority === "critical" ? "bg-red-500"
    : priority === "high" ? "bg-amber-400"
    : priority === "low" ? "bg-zinc-500" : "bg-emerald-400";
  return <span className={`mt-1 h-2 w-2 rounded-full ${cls}`} title={priority} />;
}
