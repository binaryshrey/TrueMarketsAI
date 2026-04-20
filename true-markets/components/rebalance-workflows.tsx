"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronDown,
  Play,
  Square,
  Info,
  RefreshCw,
  Clock,
  CheckCircle2,
  Calendar,
  Circle,
  X,
  Send,
  Terminal,
  MessageSquare,
  Copy,
  Zap,
  BarChart2,
  Brain,
  ArrowRightLeft,
  ShieldCheck,
  FileText,
  Pencil,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ScanEye,
  TrendingUp,
  XCircle,
  Loader2,
} from "lucide-react";

/* ── types ── */
interface WorkflowAllocation {
  symbol: string;
  name: string;
  image: string;
  pct: number;
}

interface Workflow {
  id: string;
  name: string;
  mode: string;
  allocation_type: string;
  allocations: WorkflowAllocation[];
  engine_type: "truesignal" | "custom";
  data_source: string;
  ai_model: string | null;
  venue: string;
  investment: number;
  rebalance_mode: string;
  threshold: number | null;
  time_interval: string | null;
  condition_tab: string | null;
  condition_coin: string | null;
  condition_direction: string | null;
  condition_value: string | null;
  stop_loss: number | null;
  take_profit: number | null;
  status: "scheduled" | "ongoing" | "completed";
  created_at: string;
}

type NodeExecStatus = "idle" | "running" | "success" | "failed";

interface LogEntry {
  time: string;
  node: string;
  level: "info" | "ok" | "warn" | "error";
  msg: string;
}

/* ── workflow nodes ── */
const WORKFLOW_NODES = [
  {
    id: "trigger",
    type: "TRIGGER",
    label: "Market Trigger",
    desc: "Monitors price feeds and allocation drift. Enforces min cooldown between rebalances to prevent over-trading",
    icon: Zap,
    color: "#f1c232",
    details: [
      { key: "Source", value: "CoinGecko + Alpaca" },
      { key: "Cooldown", value: "1h min interval" },
      { key: "Condition", value: "Threshold breach" },
    ],
  },
  {
    id: "analyze",
    type: "PRE-TRADE",
    label: "Drift Analyzer",
    desc: "Calculates current vs target allocation and identifies which assets are overweight or underweight",
    icon: BarChart2,
    color: "#8b5cf6",
    details: [
      { key: "Method", value: "Weighted deviation" },
      { key: "Tolerance", value: "Dynamic" },
      { key: "Assets", value: "All portfolio" },
    ],
  },
  {
    id: "validate",
    type: "VALIDATOR",
    label: "Validation Gate",
    desc: "Confirms deviation is still valid, checks price hasn't moved too far since trigger, and verifies slippage is within acceptable range",
    icon: ScanEye,
    color: "#a855f7",
    details: [
      { key: "Drift check", value: "Re-verify deviation" },
      { key: "Price staleness", value: "< 10s" },
      { key: "Max slippage", value: "0.5%" },
    ],
  },
  {
    id: "plan",
    type: "PLANNER",
    label: "Trade Planner",
    desc: "",
    icon: Brain,
    color: "#3b82f6",
    details: [],
  },
  {
    id: "execute",
    type: "EXECUTOR",
    label: "Execution Engine",
    desc: "Places market orders through the broker API with idempotent retries and partial-fill handling",
    icon: ArrowRightLeft,
    color: "#10b981",
    details: [
      { key: "Broker", value: "Alpaca / TrueMarkets" },
      { key: "Order type", value: "Market" },
      { key: "Retries", value: "3 (idempotent)" },
    ],
  },
  {
    id: "verify",
    type: "VERIFIER",
    label: "Verification Engine",
    desc: "Confirms all orders filled correctly and reconciles actual vs expected balances with the source of truth DB",
    icon: ShieldCheck,
    color: "#06b6d4",
    details: [
      { key: "Check", value: "Balance reconcile" },
      { key: "Timeout", value: "60s" },
      { key: "Fallback", value: "Retry once" },
    ],
  },
  {
    id: "post-analyze",
    type: "POST-TRADE",
    label: "Post-Trade Analyzer",
    desc: "Evaluates rebalance quality — compares drift before vs after, measures execution quality, and calculates actual benefit of the rebalance",
    icon: TrendingUp,
    color: "#f97316",
    details: [
      { key: "Drift delta", value: "Before vs after" },
      { key: "Exec quality", value: "Slippage + fees" },
      { key: "Benefit score", value: "Net improvement" },
    ],
  },
  {
    id: "report",
    type: "REPORTER",
    label: "Report & Log",
    desc: "Persists execution summary with post-trade metrics, logs to Supabase, and sends notifications",
    icon: FileText,
    color: "#f43f5e",
    details: [
      { key: "Output", value: "JSON + Summary" },
      { key: "Notify", value: "Toast + DB" },
      { key: "Retention", value: "90 days" },
    ],
  },
];

interface NodePosition {
  x: number;
  y: number;
}

function getResolvedNodes(workflow: {
  engine_type: "truesignal" | "custom";
  data_source?: string;
  ai_model?: string | null;
  venue?: string;
  rebalance_mode?: string;
  threshold?: number | null;
  time_interval?: string | null;
  condition_coin?: string | null;
  condition_direction?: string | null;
  condition_value?: string | null;
  condition_tab?: string | null;
}) {
  const source = workflow.data_source || "CoinGecko + Alpaca";
  const venue = workflow.venue || "Alpaca";
  const model = workflow.ai_model || "Claude Sonnet 4.5";

  let condition = "Threshold breach";
  if (workflow.rebalance_mode === "ratio" && workflow.threshold) {
    condition = `Coin Ratio > ${workflow.threshold}%`;
  } else if (workflow.rebalance_mode === "time" && workflow.time_interval) {
    const labels: Record<string, string> = {
      "4h": "Every 4 Hours",
      "12h": "Every 12 Hours",
      "1d": "Every 1 Day",
      "1w": "Every 1 Week",
    };
    condition = labels[workflow.time_interval] || `Every ${workflow.time_interval}`;
  } else if (workflow.rebalance_mode === "conditions" && workflow.condition_coin) {
    const coin = workflow.condition_coin.replace(/\/USD$/i, "").replace(/USD$/i, "").toUpperCase();
    const dir = workflow.condition_direction || "above";
    const val = workflow.condition_value || "0";
    if (workflow.condition_tab === "price") {
      condition = `${coin} ${dir} $${val}`;
    } else {
      condition = `${coin} ${dir} ${val}%`;
    }
  }

  return WORKFLOW_NODES.map((node) => {
    if (node.id === "trigger") {
      return {
        ...node,
        details: [
          { key: "Source", value: source },
          { key: "Cooldown", value: "1h min interval" },
          { key: "Condition", value: condition },
        ],
      };
    }
    if (node.id === "plan") {
      if (workflow.engine_type === "truesignal") {
        return {
          ...node,
          label: "TrueSignal Planner",
          desc: `AI-driven planner powered by ${model} — optimizes trade sizes, order sequence, and timing based on real-time market context`,
          details: [
            { key: "Model", value: model },
            { key: "Strategy", value: "Min-slippage" },
            { key: "Max orders", value: "10" },
          ],
        };
      }
      return {
        ...node,
        label: "Custom Script Planner",
        desc: "Deterministic planner using your uploaded script logic — fully reproducible and auditable, you control the exact trade sizing",
        details: [
          { key: "Method", value: "Deterministic" },
          { key: "Runtime", value: "Sandboxed" },
          { key: "Max orders", value: "10" },
        ],
      };
    }
    if (node.id === "execute") {
      return {
        ...node,
        details: [
          { key: "Venue", value: venue },
          { key: "Order type", value: "Market" },
          { key: "Retries", value: "3 (idempotent)" },
        ],
      };
    }
    return node;
  });
}

const NODE_WIDTH = 220;
const NODE_GAP = 60;
const NODE_SPACING = NODE_WIDTH + NODE_GAP;

function getDefaultNodePositions(): NodePosition[] {
  return WORKFLOW_NODES.map((_, i) => ({
    x: 60 + i * NODE_SPACING,
    y: 80,
  }));
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ── Wave animation CSS (injected once) ── */
const WAVE_STYLE_ID = "rebalance-wave-animation";
function ensureWaveStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(WAVE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = WAVE_STYLE_ID;
  style.textContent = `
    @keyframes waveShimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .node-wave-running {
      position: relative;
      overflow: hidden;
    }
    .node-wave-running::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: linear-gradient(
        90deg,
        transparent 0%,
        var(--wave-color) 50%,
        transparent 100%
      );
      background-size: 200% 100%;
      animation: waveShimmer 1.5s ease-in-out infinite;
      pointer-events: none;
      z-index: 2;
    }
  `;
  document.head.appendChild(style);
}

export default function RebalanceWorkflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [expandScheduled, setExpandScheduled] = useState(true);
  const [expandOngoing, setExpandOngoing] = useState(true);
  const [expandCompleted, setExpandCompleted] = useState(true);

  // Canvas pan state
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOffsetStart = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Node positions & dragging
  const [nodePositions, setNodePositions] = useState<NodePosition[]>(
    getDefaultNodePositions,
  );
  const [draggingNode, setDraggingNode] = useState<number | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragNodeStart = useRef({ x: 0, y: 0 });

  // Drawer
  const [drawerNodeIdx, setDrawerNodeIdx] = useState<number | null>(null);
  const [drawerMode, setDrawerMode] = useState<"view" | "edit">("view");
  const [editDetails, setEditDetails] = useState<
    { key: string; value: string }[]
  >([]);

  // Chat
  const [chatInput, setChatInput] = useState("");
  const [bottomTab, setBottomTab] = useState<"chat" | "logs">("logs");
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([
    {
      role: "assistant",
      text: "I'm monitoring your rebalance workflow. Ask me about status, allocation drift, or execution history.",
    },
  ]);

  // ── Execution state ──
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeExecStatus>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Inject wave animation styles
  useEffect(() => {
    ensureWaveStyles();
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Load persisted logs when workflow changes
  useEffect(() => {
    setNodePositions(getDefaultNodePositions());
    setCanvasOffset({ x: 0, y: 0 });
    setZoom(1);
    setDrawerNodeIdx(null);

    if (isExecuting) return;

    setNodeStatuses({});
    setLogs([]);

    if (!selectedId) return;

    let cancelled = false;
    setLogsLoading(true);

    fetch(`/api/rebalance-workflows/logs?workflow_id=${selectedId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.logs) || data.logs.length === 0) {
          setLogsLoading(false);
          return;
        }
        const restored: LogEntry[] = data.logs.map(
          (l: { time: string; node: string; level: string; msg: string }) => ({
            time: l.time,
            node: l.node,
            level: l.level as LogEntry["level"],
            msg: l.msg,
          }),
        );
        setLogs(restored);
        setLogsLoading(false);
      })
      .catch(() => {
        setLogsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, isExecuting]);

  // Canvas pan handlers
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    if ((e.target as HTMLElement).closest("[data-panel]")) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY };
    panOffsetStart.current = { ...canvasOffset };
  };

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (draggingNode !== null) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setNodePositions((prev) => {
          const copy = [...prev];
          copy[draggingNode] = {
            x: dragNodeStart.current.x + dx,
            y: dragNodeStart.current.y + dy,
          };
          return copy;
        });
        return;
      }
      if (!isPanning) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setCanvasOffset({
        x: panOffsetStart.current.x + dx,
        y: panOffsetStart.current.y + dy,
      });
    },
    [isPanning, draggingNode],
  );

  const handleCanvasMouseUp = useCallback(() => {
    setIsPanning(false);
    setDraggingNode(null);
  }, []);

  const handleNodeMouseDown = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    setDraggingNode(idx);
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragNodeStart.current = { ...nodePositions[idx] };
  };

  const handleNodeClick = (idx: number) => {
    if (draggingNode === null) {
      setDrawerNodeIdx(idx === drawerNodeIdx ? null : idx);
      setDrawerMode("view");
    }
  };

  const handleEditNode = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    setDrawerNodeIdx(idx);
    setDrawerMode("edit");
    setEditDetails(resolvedNodes[idx].details.map((d) => ({ ...d })));
  };

  const handleDeleteWorkflow = async () => {
    if (!selectedId) return;
    try {
      await fetch("/api/rebalance-workflows", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId }),
      });
      setWorkflows((prev) => prev.filter((w) => w.id !== selectedId));
      setSelectedId(null);
      setDrawerNodeIdx(null);
    } catch {
      // silent
    }
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setChatInput("");
    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Workflow "${selected?.name ?? ""}": Status is ${selected?.status ?? "unknown"}. ${
            selected?.rebalance_mode === "ratio"
              ? `Monitoring for ${selected.threshold}% deviation threshold.`
              : selected?.rebalance_mode === "time"
                ? `Scheduled to run every ${selected.time_interval}.`
                : "Watching market conditions for trigger."
          } All ${(selected?.allocations ?? []).length} assets are being tracked.`,
        },
      ]);
    }, 800);
  };

  /* ── Execute workflow via SSE ── */
  const handleStartWorkflow = async () => {
    if (!selectedId || isExecuting) return;

    setIsExecuting(true);
    setNodeStatuses({});
    setLogs([]);
    setBottomTab("logs");

    // Update local status to ongoing
    setWorkflows((prev) =>
      prev.map((w) => (w.id === selectedId ? { ...w, status: "ongoing" as const } : w)),
    );

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/rebalance-workflows/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        setLogs((prev) => [
          ...prev,
          {
            time: new Date().toLocaleTimeString("en-US", { hour12: false }),
            node: "SYSTEM",
            level: "error",
            msg: `Failed to start workflow: ${err.error || res.statusText}`,
          },
        ]);
        setIsExecuting(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            try {
              const data = JSON.parse(dataStr);

              if (eventType === "log") {
                setLogs((prev) => [...prev, data as LogEntry]);
              } else if (eventType === "node-status") {
                setNodeStatuses((prev) => ({
                  ...prev,
                  [data.nodeId]: data.status as NodeExecStatus,
                }));
              } else if (eventType === "complete") {
                const newStatus = data.status === "completed" ? "completed" : "scheduled";
                setWorkflows((prev) =>
                  prev.map((w) =>
                    w.id === selectedId ? { ...w, status: newStatus as Workflow["status"] } : w,
                  ),
                );
              }
            } catch {
              // skip malformed events
            }
            eventType = "";
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setLogs((prev) => [
          ...prev,
          {
            time: new Date().toLocaleTimeString("en-US", { hour12: false }),
            node: "SYSTEM",
            level: "error",
            msg: `Connection error: ${(err as Error).message}`,
          },
        ]);
      }
    } finally {
      setIsExecuting(false);
      abortRef.current = null;
    }
  };

  const handleStopWorkflow = async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setIsExecuting(false);

    // Reset status back to scheduled
    if (selectedId) {
      try {
        await fetch("/api/rebalance-workflows/status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: selectedId, status: "scheduled" }),
        });
        setWorkflows((prev) =>
          prev.map((w) => (w.id === selectedId ? { ...w, status: "scheduled" as const } : w)),
        );
      } catch {
        // silent
      }
    }

    setLogs((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString("en-US", { hour12: false }),
        node: "SYSTEM",
        level: "warn",
        msg: "Workflow stopped by user",
      },
    ]);
  };

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rebalance-workflows");
      const data = await res.json();
      if (Array.isArray(data.workflows)) {
        setWorkflows(data.workflows);
        if (data.workflows.length > 0 && !selectedId) {
          setSelectedId(data.workflows[0].id);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const scheduled = workflows.filter((w) => w.status === "scheduled");
  const ongoing = workflows.filter((w) => w.status === "ongoing");
  const completed = workflows.filter((w) => w.status === "completed");
  const selected = workflows.find((w) => w.id === selectedId) ?? null;
  const resolvedNodes = getResolvedNodes({
    engine_type: selected?.engine_type ?? "truesignal",
    data_source: selected?.data_source,
    ai_model: selected?.ai_model,
    venue: selected?.venue,
    rebalance_mode: selected?.rebalance_mode,
    threshold: selected?.threshold,
    time_interval: selected?.time_interval,
    condition_coin: selected?.condition_coin,
    condition_direction: selected?.condition_direction,
    condition_value: selected?.condition_value,
    condition_tab: selected?.condition_tab,
  });
  const drawerNode =
    drawerNodeIdx !== null ? resolvedNodes[drawerNodeIdx] : null;

  return (
    <div className="flex h-[calc(100vh-120px)] gap-0 overflow-hidden rounded-xl border border-white/[0.07]">
      {/* ── Left Panel: Workflow List ── */}
      <div className="flex w-[280px] flex-shrink-0 flex-col border-r border-white/[0.07] bg-[#0a0a0a]">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-200">Workflows</h2>
          <button
            onClick={fetchWorkflows}
            className="text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && workflows.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-8 text-xs text-zinc-500">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Loading workflows...
            </div>
          ) : workflows.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-zinc-600">
              No workflows yet. Create one from the Portfolio page.
            </div>
          ) : (
            <>
              <SectionHeader
                label="Scheduled"
                count={scheduled.length}
                icon={<Calendar className="h-3.5 w-3.5 text-[#f1c232]" />}
                expanded={expandScheduled}
                onToggle={() => setExpandScheduled(!expandScheduled)}
              />
              {expandScheduled &&
                scheduled.map((w) => (
                  <WorkflowRow
                    key={w.id}
                    workflow={w}
                    selected={w.id === selectedId}
                    onClick={() => setSelectedId(w.id)}
                  />
                ))}

              <SectionHeader
                label="Ongoing"
                count={ongoing.length}
                icon={<Clock className="h-3.5 w-3.5 text-emerald-400" />}
                expanded={expandOngoing}
                onToggle={() => setExpandOngoing(!expandOngoing)}
              />
              {expandOngoing &&
                ongoing.map((w) => (
                  <WorkflowRow
                    key={w.id}
                    workflow={w}
                    selected={w.id === selectedId}
                    onClick={() => setSelectedId(w.id)}
                  />
                ))}

              <SectionHeader
                label="Completed"
                count={completed.length}
                icon={<CheckCircle2 className="h-3.5 w-3.5 text-zinc-500" />}
                expanded={expandCompleted}
                onToggle={() => setExpandCompleted(!expandCompleted)}
              />
              {expandCompleted &&
                completed.map((w) => (
                  <WorkflowRow
                    key={w.id}
                    workflow={w}
                    selected={w.id === selectedId}
                    onClick={() => setSelectedId(w.id)}
                  />
                ))}
            </>
          )}
        </div>
      </div>

      {/* ── Center: Canvas + Bottom Panels ── */}
      <div className="flex flex-1 flex-col bg-[#171717]">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2.5">
          <div className="flex items-center gap-2">
            {selected ? (
              <span className="text-sm font-medium text-zinc-200">
                {selected.name}
              </span>
            ) : (
              <span className="text-sm text-zinc-500">Select a workflow</span>
            )}
            {selected && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  selected.status === "ongoing"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : selected.status === "completed"
                      ? "bg-zinc-500/15 text-zinc-400"
                      : "bg-[#f1c232]/15 text-[#f1c232]"
                }`}
              >
                {selected.status.toUpperCase()}
              </span>
            )}
            {isExecuting && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
            )}
          </div>
          {selected && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleStartWorkflow}
                disabled={isExecuting}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  isExecuting
                    ? "border-zinc-700 bg-zinc-800/50 text-zinc-600 cursor-not-allowed"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                }`}
              >
                <Play className="h-3 w-3" />
                Start
              </button>
              <button
                onClick={handleStopWorkflow}
                disabled={!isExecuting}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  !isExecuting
                    ? "border-zinc-700 bg-zinc-800/50 text-zinc-600 cursor-not-allowed"
                    : "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                }`}
              >
                <Square className="h-3 w-3" />
                Stop
              </button>
              <button className="flex items-center gap-1.5 rounded-md border border-white/[0.10] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.06]">
                <Info className="h-3 w-3" />
                Info
              </button>
              <button
                onClick={handleDeleteWorkflow}
                disabled={isExecuting}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  isExecuting
                    ? "border-zinc-700 bg-zinc-800/50 text-zinc-600 cursor-not-allowed"
                    : "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                }`}
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Canvas + Drawer row */}
        <div className="flex flex-1 min-h-0">
          {/* Canvas */}
          <div
            ref={canvasRef}
            className="relative flex-1 overflow-hidden select-none"
            style={{
              cursor: isPanning
                ? "grabbing"
                : draggingNode !== null
                  ? "grabbing"
                  : "grab",
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          >
            {/* Dot grid */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(circle, #535b69 1.5px, transparent 1.5px)",
                backgroundSize: "32px 32px",
                backgroundPosition: `${canvasOffset.x % 32}px ${canvasOffset.y % 32}px`,
              }}
            />

            {selected ? (
              <div
                className="relative h-full w-full origin-top-left"
                style={{ transform: `scale(${zoom})` }}
              >
                {/* SVG connectors with arrows */}
                <svg
                  className="absolute inset-0 h-full w-full pointer-events-none"
                  style={{ zIndex: 1 }}
                >
                  <defs>
                    {resolvedNodes.map((node, idx) => (
                      <marker
                        key={`arrow-${idx}`}
                        id={`arrowhead-${idx}`}
                        markerWidth="10"
                        markerHeight="8"
                        refX="9"
                        refY="4"
                        orient="auto"
                      >
                        <path
                          d="M 0 0 L 10 4 L 0 8 L 2 4 Z"
                          fill={node.color}
                          fillOpacity="0.6"
                        />
                      </marker>
                    ))}
                  </defs>
                  {nodePositions.map((pos, idx) => {
                    if (idx >= WORKFLOW_NODES.length - 1) return null;
                    const next = nodePositions[idx + 1];
                    const color = WORKFLOW_NODES[idx].color;
                    const x1 = pos.x + canvasOffset.x + NODE_WIDTH;
                    const y1 = pos.y + canvasOffset.y + 55;
                    const x2 = next.x + canvasOffset.x;
                    const y2 = next.y + canvasOffset.y + 55;
                    const midX = (x1 + x2) / 2;
                    return (
                      <path
                        key={`line-${idx}`}
                        d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                        fill="none"
                        stroke={color}
                        strokeOpacity="0.25"
                        strokeWidth="2"
                        markerEnd={`url(#arrowhead-${idx})`}
                      />
                    );
                  })}
                </svg>

                {/* Node cards */}
                {resolvedNodes.map((node, idx) => {
                  const pos = nodePositions[idx];
                  const Icon = node.icon;
                  const isActive = drawerNodeIdx === idx;
                  const execStatus = nodeStatuses[node.id] || "idle";
                  const isRunning = execStatus === "running";
                  const isSuccess = execStatus === "success";
                  const isFailed = execStatus === "failed";

                  return (
                    <div
                      key={node.id}
                      data-node
                      className="group absolute w-[220px]"
                      style={{
                        left: pos.x + canvasOffset.x,
                        top: pos.y + canvasOffset.y,
                        zIndex: draggingNode === idx ? 20 : 10,
                        cursor: draggingNode === idx ? "grabbing" : "grab",
                      }}
                      onMouseDown={(e) => handleNodeMouseDown(e, idx)}
                      onMouseUp={() => handleNodeClick(idx)}
                    >
                      <div
                        className={`rounded-xl border p-3 transition-all ${isRunning ? "node-wave-running" : ""}`}
                        style={{
                          borderColor: isRunning
                            ? node.color
                            : isSuccess
                              ? "#22c55e"
                              : isFailed
                                ? "#ef4444"
                                : isActive
                                  ? node.color
                                  : `${node.color}30`,
                          backgroundColor: "#0c0c10",
                          boxShadow: isRunning
                            ? `0 0 30px ${node.color}30, inset 0 0 0 1px ${node.color}50`
                            : isSuccess
                              ? `0 0 20px #22c55e15, inset 0 0 0 1px #22c55e30`
                              : isFailed
                                ? `0 0 20px #ef444415, inset 0 0 0 1px #ef444430`
                                : isActive
                                  ? `0 0 24px ${node.color}20, inset 0 0 0 1px ${node.color}40`
                                  : `0 0 12px ${node.color}08`,
                          // CSS variable for wave animation color
                          "--wave-color": `${node.color}15`,
                        } as React.CSSProperties}
                      >
                        {/* Header */}
                        <div className="mb-2 flex items-center gap-2">
                          <div
                            className="flex h-7 w-7 items-center justify-center rounded-lg"
                            style={{
                              backgroundColor: isRunning
                                ? `${node.color}30`
                                : isSuccess
                                  ? "#22c55e18"
                                  : isFailed
                                    ? "#ef444418"
                                    : `${node.color}18`,
                            }}
                          >
                            {isRunning ? (
                              <Loader2
                                className="h-3.5 w-3.5 animate-spin"
                                style={{ color: node.color }}
                              />
                            ) : isSuccess ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            ) : isFailed ? (
                              <XCircle className="h-3.5 w-3.5 text-red-400" />
                            ) : (
                              <Icon
                                className="h-3.5 w-3.5"
                                style={{ color: node.color }}
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="text-[10px] font-bold tracking-wider"
                                style={{
                                  color: isSuccess
                                    ? "#22c55e99"
                                    : isFailed
                                      ? "#ef444499"
                                      : `${node.color}99`,
                                }}
                              >
                                {node.type}
                              </span>
                              {isSuccess && (
                                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                              )}
                              {isFailed && (
                                <XCircle className="h-3 w-3 text-red-400" />
                              )}
                            </div>
                            <p className="text-xs font-semibold text-zinc-200 truncate">
                              {node.label}
                            </p>
                          </div>
                          <button
                            data-node
                            onClick={(e) => handleEditNode(e, idx)}
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-zinc-600 opacity-0 transition-all group-hover:opacity-100 hover:border-white/[0.16] hover:text-zinc-300"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Details rows */}
                        <div className="space-y-1 border-t border-white/[0.06] pt-2">
                          {node.details.map((d) => (
                            <div
                              key={d.key}
                              className="flex items-center justify-between"
                            >
                              <span className="text-[10px] text-zinc-600">
                                {d.key}
                              </span>
                              <span className="text-[10px] font-medium text-zinc-400">
                                {d.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="relative flex h-full items-center justify-center">
                <div className="text-center">
                  <Circle className="mx-auto h-10 w-10 text-zinc-800" />
                  <p className="mt-3 text-sm text-zinc-600">
                    Select a workflow to view its pipeline
                  </p>
                </div>
              </div>
            )}

            {/* Canvas controls */}
            {selected && (
              <div
                data-panel
                className="absolute bottom-4 left-4 z-30 flex flex-col gap-1 rounded-xl border border-white/[0.10] bg-[#0c0c10]/90 p-1.5 backdrop-blur-sm"
              >
                <button
                  onClick={() => setZoom((z) => Math.min(z + 0.15, 2))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-200"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setZoom((z) => Math.max(z - 0.15, 0.3))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-200"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setZoom(1);
                    setCanvasOffset({ x: 0, y: 0 });
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-200"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* ── Right Drawer ── */}
          {drawerNode && (
            <div
              data-panel
              className="flex w-[280px] flex-shrink-0 flex-col border-l border-white/[0.07] bg-[#0a0a0a]"
            >
              <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-200">
                    {drawerMode === "edit" ? "Edit Node" : "Properties"}
                  </span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{
                      backgroundColor: `${drawerNode.color}18`,
                      color: drawerNode.color,
                    }}
                  >
                    {drawerNode.type}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {drawerMode === "view" && (
                    <button
                      onClick={() => {
                        setDrawerMode("edit");
                        setEditDetails(
                          drawerNode.details.map((d) => ({ ...d })),
                        );
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setDrawerNodeIdx(null);
                      setDrawerMode("view");
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="space-y-4 p-4">
                  <div>
                    <p className="mb-1 text-[10px] font-semibold tracking-wider text-zinc-600">
                      NODE NAME
                    </p>
                    <div className="rounded-md border border-white/[0.07] bg-[#0d111b] px-3 py-2 text-xs text-zinc-200">
                      {drawerNode.label}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-semibold tracking-wider text-zinc-600">
                      DESCRIPTION
                    </p>
                    <div className="rounded-md border border-white/[0.07] bg-[#0d111b] px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
                      {drawerNode.desc}
                    </div>
                  </div>

                  {/* Execution status in drawer */}
                  {drawerNodeIdx !== null && nodeStatuses[resolvedNodes[drawerNodeIdx].id] && (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold tracking-wider text-zinc-600">
                        EXECUTION STATUS
                      </p>
                      <div className="rounded-md border border-white/[0.07] bg-[#0d111b] px-3 py-2">
                        <span
                          className={`text-xs font-semibold ${
                            nodeStatuses[resolvedNodes[drawerNodeIdx].id] === "success"
                              ? "text-emerald-400"
                              : nodeStatuses[resolvedNodes[drawerNodeIdx].id] === "failed"
                                ? "text-red-400"
                                : nodeStatuses[resolvedNodes[drawerNodeIdx].id] === "running"
                                  ? "text-amber-400"
                                  : "text-zinc-500"
                          }`}
                        >
                          {nodeStatuses[resolvedNodes[drawerNodeIdx].id]?.toUpperCase() || "IDLE"}
                        </span>
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-1 text-[10px] font-semibold tracking-wider text-zinc-600">
                      CONFIGURATION
                    </p>
                    {drawerMode === "view" ? (
                      <div className="space-y-0 rounded-md border border-white/[0.07] bg-[#0d111b]">
                        {drawerNode.details.map((d, i) => (
                          <div
                            key={d.key}
                            className={`flex items-center justify-between px-3 py-2 ${
                              i < drawerNode.details.length - 1
                                ? "border-b border-white/[0.05]"
                                : ""
                            }`}
                          >
                            <span className="text-xs text-zinc-500">
                              {d.key}
                            </span>
                            <span className="text-xs font-medium text-zinc-200">
                              {d.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {editDetails.map((d, i) => (
                          <div key={d.key}>
                            <label className="mb-1 block text-[10px] text-zinc-500">
                              {d.key}
                            </label>
                            <input
                              type="text"
                              value={d.value}
                              onChange={(e) => {
                                setEditDetails((prev) => {
                                  const copy = [...prev];
                                  copy[i] = {
                                    ...copy[i],
                                    value: e.target.value,
                                  };
                                  return copy;
                                });
                              }}
                              className="w-full rounded-md border border-white/[0.10] bg-[#0d111b] px-3 py-2 text-xs text-zinc-200 outline-none focus:border-[#f1c232]/50"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {drawerMode === "view" && selected && (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold tracking-wider text-zinc-600">
                        WORKFLOW CONTEXT
                      </p>
                      <div className="space-y-0 rounded-md border border-white/[0.07] bg-[#0d111b]">
                        <div className="flex items-center justify-between border-b border-white/[0.05] px-3 py-2">
                          <span className="text-xs text-zinc-500">Mode</span>
                          <span className="text-xs font-medium text-zinc-200">
                            {selected.mode === "paper" ? "Paper" : "Live"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-white/[0.05] px-3 py-2">
                          <span className="text-xs text-zinc-500">Assets</span>
                          <span className="text-xs font-medium text-zinc-200">
                            {(selected.allocations ?? []).length}
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-xs text-zinc-500">
                            Investment
                          </span>
                          <span className="text-xs font-medium text-zinc-200">
                            ${selected.investment} USDT
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {drawerMode === "edit" && (
                <div className="border-t border-white/[0.07] px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDrawerMode("view")}
                      className="flex-1 rounded-md border border-white/[0.10] bg-[#0d111b] py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-[#171929] hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setDrawerMode("view")}
                      className="flex-1 rounded-md bg-[#f1c232] py-2 text-xs font-semibold text-black transition-colors hover:bg-[#f5d04a]"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Bottom Panel: Tabbed Chat / Logs ── */}
        {selected && (
          <div
            data-panel
            className="flex h-[220px] flex-shrink-0 flex-col border-t border-white/[0.07]"
          >
            {/* Tab bar */}
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-0">
              <div className="flex">
                <button
                  onClick={() => setBottomTab("logs")}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                    bottomTab === "logs"
                      ? "border-emerald-400 text-zinc-200"
                      : "border-transparent text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  <Terminal className="h-3 w-3" />
                  Live Execution Logs
                  {logs.length > 0 && (
                    <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] tabular-nums text-emerald-400">
                      {logs.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setBottomTab("chat")}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                    bottomTab === "chat"
                      ? "border-[#f1c232] text-zinc-200"
                      : "border-transparent text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  <MessageSquare className="h-3 w-3" />
                  Workflow Chat
                </button>
              </div>
              {bottomTab === "logs" && (
                <div className="flex items-center gap-3">
                  {isExecuting && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                      </span>
                      executing
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-600">
                    status:{" "}
                    <span
                      className={
                        selected.status === "ongoing"
                          ? "text-emerald-400"
                          : selected.status === "completed"
                            ? "text-zinc-400"
                            : "text-[#f1c232]"
                      }
                    >
                      {selected.status}
                    </span>
                  </span>
                  <button
                    className="text-zinc-600 hover:text-zinc-400"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        logs.map((l) => `[${l.time}] [${l.node}] ${l.msg}`).join("\n"),
                      );
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Chat content */}
            {bottomTab === "chat" && (
              <div className="flex flex-1 flex-col min-h-0">
                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
                  {chatMessages.map((m, i) => (
                    <div
                      key={i}
                      className={`flex ${m.role === "user" ? "justify-end" : ""}`}
                    >
                      <p
                        className={`max-w-[85%] rounded-lg px-3 py-1.5 text-[11px] leading-relaxed ${
                          m.role === "user"
                            ? "bg-[#f1c232]/15 text-zinc-200"
                            : "bg-white/[0.04] text-zinc-400"
                        }`}
                      >
                        {m.text}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="border-t border-white/[0.07] px-3 py-2">
                  <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-[#0d111b] px-3 py-1.5">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                      placeholder="Type a message..."
                      className="flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
                    />
                    <button
                      onClick={handleSendChat}
                      className="text-[#f1c232] hover:text-[#f5d04a]"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Logs content */}
            {bottomTab === "logs" && (
              <div className="flex-1 overflow-y-auto bg-[#08080a] px-4 py-2 font-mono text-[11px]">
                {logs.length > 0 ? (
                  <>
                    {logs.map((log, i) => (
                      <div key={i} className="flex gap-2 leading-5">
                        <span className="text-zinc-700 select-none flex-shrink-0">
                          {log.time}
                        </span>
                        <span
                          className={`flex-shrink-0 w-[90px] ${
                            log.node === "SYSTEM" ? "text-zinc-500" : "text-zinc-600"
                          }`}
                        >
                          [{log.node}]
                        </span>
                        <span
                          className={
                            log.level === "ok"
                              ? "text-emerald-400"
                              : log.level === "warn"
                                ? "text-[#f1c232]"
                                : log.level === "error"
                                  ? "text-red-400"
                                  : "text-zinc-500"
                          }
                        >
                          {log.msg}
                        </span>
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-zinc-600">
                      {logsLoading
                        ? "Loading execution logs..."
                        : isExecuting
                          ? "Starting workflow execution..."
                          : "Click Start to execute the workflow pipeline"}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function SectionHeader({
  label,
  count,
  icon,
  expanded,
  onToggle,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 border-b border-white/[0.04] bg-white/[0.02] px-4 py-2 text-left"
    >
      <ChevronDown
        className={`h-3 w-3 text-zinc-600 transition-transform ${
          !expanded ? "-rotate-90" : ""
        }`}
      />
      {icon}
      <span className="flex-1 text-xs font-semibold text-zinc-300">
        {label}
      </span>
      <span className="text-[10px] tabular-nums text-zinc-600">{count}</span>
    </button>
  );
}

function WorkflowRow({
  workflow,
  selected,
  onClick,
}: {
  workflow: Workflow;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full flex-col gap-0.5 border-b border-white/[0.04] px-4 py-2.5 text-left transition-colors ${
        selected
          ? "bg-[#f1c232]/5 border-l-2 border-l-[#f1c232]"
          : "hover:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-200 truncate max-w-[160px]">
          {workflow.name}
        </span>
        <span className="text-[10px] tabular-nums text-zinc-600">
          {formatDate(workflow.created_at)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-zinc-500">
          {(workflow.allocations ?? [])
            .map((a: WorkflowAllocation) => a.symbol.toUpperCase())
            .join(", ")}
        </span>
        <span className="text-[10px] text-zinc-600">·</span>
        <span className="text-[10px] text-zinc-500">
          {workflow.mode === "paper" ? "Paper" : "Live"}
        </span>
      </div>
    </button>
  );
}
