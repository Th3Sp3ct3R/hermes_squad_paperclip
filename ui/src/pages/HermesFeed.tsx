import { useEffect, useMemo, useRef, useState } from "react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, AlertTriangle, CheckCircle2, Plug, PlugZap, Trash2 } from "lucide-react";

/**
 * HermesFeed — real-time SSE feed of HermesBus events from the InstaGrowth
 * backend (https://instagrowth-backend.onrender.com/api/hermes/stream).
 *
 * Architecture:
 *   DO connector → POST /api/hermes/event → HermesBus.send → emits 'message'
 *   → /api/hermes/stream subscriber (THIS component over EventSource)
 *
 * Auth: dual-mode JWT — header (server-side) OR ?token= (browser EventSource).
 *       Token is persisted in localStorage('hermes_token').
 */

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

// ─── Config ─────────────────────────────────────────────────────────────────

const DEFAULT_API = "https://instagrowth-backend.onrender.com";
const TOKEN_KEY = "hermes_token";
const API_KEY = "hermes_api_url";
const MAX_MESSAGES = 200;

// ─── Component ──────────────────────────────────────────────────────────────

export function HermesFeed() {
  const { setBreadcrumbs } = useBreadcrumbs();
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
    setBreadcrumbs([{ label: "Akashic Stream 𓂀" }]);
  }, [setBreadcrumbs]);

  // Persist config to localStorage as it changes
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

  // Open / close EventSource
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
    es.addEventListener("error", () => {
      setConn("error");
      // EventSource auto-reconnects, no need to do it manually
    });
    es.addEventListener("replay", (e) => {
      try {
        const msg = JSON.parse((e as MessageEvent).data) as HermesMsg;
        msg.__replay = true;
        setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES));
      } catch { /* skip malformed */ }
    });
    es.addEventListener("message", (e) => {
      try {
        const msg = JSON.parse((e as MessageEvent).data) as HermesMsg;
        setMessages((prev) => [msg, ...prev].slice(0, MAX_MESSAGES));
      } catch { /* skip malformed */ }
    });
  }

  // Auto-connect when toggled on
  useEffect(() => {
    if (autoConnect && conn === "idle" && token) connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, streamUrl]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <span aria-hidden style={{ fontSize: "1.6rem" }}>𓂀</span>
            Akashic Stream
          </h1>
          <p className="text-sm text-muted-foreground italic">
            The eye that records all. Real-time HermesBus events from
            operator connectors (federation api → SSE).
          </p>
        </div>
        <ConnBadge conn={conn} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="hermes-api">Backend URL</Label>
              <Input
                id="hermes-api"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder={DEFAULT_API}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hermes-token">JWT Token</Label>
              <Input
                id="hermes-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="paste a JWT — login at /api/auth/login"
                type="password"
              />
            </div>
          </div>

          <Separator />

          <div className="grid gap-2 sm:grid-cols-3">
            <FilterSelect
              label="to (agent role)"
              value={filterTo}
              onValueChange={setFilterTo}
              options={[
                ["any", "any"],
                ["broadcast", "broadcast"],
                ["orchestrator", "orchestrator"],
                ["reactor", "reactor"],
                ["discoverer", "discoverer"],
                ["analyst", "analyst"],
                ["scraper", "scraper"],
                ["browser", "browser"],
                ["learner", "learner"],
                ["guardian", "guardian"],
                ["openclaw", "openclaw"],
              ]}
            />
            <FilterSelect
              label="type"
              value={filterType}
              onValueChange={setFilterType}
              options={[
                ["any", "any"],
                ["event", "event"],
                ["task", "task"],
                ["result", "result"],
                ["handoff", "handoff"],
                ["heartbeat", "heartbeat"],
              ]}
            />
            <FilterSelect
              label="priority"
              value={filterPriority}
              onValueChange={setFilterPriority}
              options={[
                ["any", "any"],
                ["critical", "critical"],
                ["high", "high"],
                ["normal", "normal"],
                ["low", "low"],
              ]}
            />
          </div>

          <div className="flex gap-2 flex-wrap pt-1">
            {conn === "open" || conn === "connecting" ? (
              <Button variant="outline" onClick={() => { disconnect(); setAutoConnect(false); }}>
                <Plug className="h-4 w-4 mr-1" /> Disconnect
              </Button>
            ) : (
              <Button onClick={() => { setAutoConnect(true); }} disabled={!token}>
                <PlugZap className="h-4 w-4 mr-1" /> Connect
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setMessages([])}>
              <Trash2 className="h-4 w-4 mr-1" /> Clear
            </Button>
            {error && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {error}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-sm">
            Events <span className="text-muted-foreground font-normal">({messages.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[60vh]">
            {messages.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-12">
                {conn === "open"
                  ? "Connected — waiting for events…"
                  : "Connect to start streaming."}
              </div>
            ) : (
              <ul className="divide-y divide-border font-mono text-xs">
                {messages.map((m) => (
                  <EventRow key={m.id} msg={m} />
                ))}
              </ul>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function ConnBadge({ conn }: { conn: ConnState }) {
  if (conn === "open") {
    return (
      <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
        <CheckCircle2 className="h-3 w-3 mr-1" /> connected
      </Badge>
    );
  }
  if (conn === "connecting") {
    return <Badge variant="outline">connecting…</Badge>;
  }
  if (conn === "error") {
    return (
      <Badge variant="outline" className="text-destructive border-destructive/30">
        <AlertTriangle className="h-3 w-3 mr-1" /> error
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-muted-foreground">idle</Badge>;
}

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
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
