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
  PanelLeftClose,
  PanelLeftOpen,
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

interface PreTradeData {
  portfolioValue: number;
  drifts: Array<{
    symbol: string;
    targetPct: number;
    currentPct: number;
    driftPct: number;
    currentValue: number;
    targetValue: number;
    diffUsd: number;
  }>;
  maxDrift: number;
  prices: Record<string, number>;
}

interface PostTradeData {
  driftBefore: number;
  driftAfter: number;
  driftImprovement: number;
  benefitScore: number;
  totalTraded: number;
  totalOrders: number;
  successfulOrders: number;
  failedOrders: number;
  estimatedFees: number;
  orders: Array<{
    symbol: string;
    side: string;
    notional: number;
    orderId: string;
    status: string;
  }>;
  estimatedDrifts: Array<{
    symbol: string;
    targetPct: number;
    newPct: number;
    newDriftPct: number;
  }>;
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

/* ── Lightweight markdown renderer for chat ── */
function ChatMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listKey = 0;

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${listKey++}`} className="my-1 ml-3 space-y-0.5 list-disc marker:text-zinc-600">
          {listItems}
        </ul>,
      );
      listItems = [];
    }
  }

  function renderInline(raw: string, key: number): React.ReactNode {
    // Process **bold**, `code`, and plain text
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g;
    let lastIdx = 0;
    let match;
    let partKey = 0;

    while ((match = regex.exec(raw)) !== null) {
      if (match.index > lastIdx) {
        parts.push(raw.slice(lastIdx, match.index));
      }
      if (match[2]) {
        // **bold**
        parts.push(
          <strong key={`b-${key}-${partKey++}`} className="font-semibold text-zinc-100">
            {match[2]}
          </strong>,
        );
      } else if (match[3]) {
        // `code`
        parts.push(
          <code
            key={`c-${key}-${partKey++}`}
            className="rounded bg-white/[0.08] px-1 py-[1px] text-[10px] font-mono text-emerald-300"
          >
            {match[3]}
          </code>,
        );
      }
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < raw.length) {
      parts.push(raw.slice(lastIdx));
    }
    return parts.length > 0 ? parts : raw;
  }

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    // Bullet list item
    if (/^[-*]\s+/.test(trimmed)) {
      const content = trimmed.replace(/^[-*]\s+/, "");
      listItems.push(<li key={`li-${i}`}>{renderInline(content, i)}</li>);
      return;
    }

    flushList();

    // Empty line
    if (trimmed === "") {
      elements.push(<div key={`br-${i}`} className="h-1" />);
      return;
    }

    // Heading (## or ###)
    if (/^#{2,3}\s+/.test(trimmed)) {
      const content = trimmed.replace(/^#{2,3}\s+/, "");
      elements.push(
        <p key={`h-${i}`} className="font-semibold text-zinc-100 mt-1">
          {renderInline(content, i)}
        </p>,
      );
      return;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`}>{renderInline(trimmed, i)}</p>,
    );
  });

  flushList();

  return <>{elements}</>;
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
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);

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
      text: "I have full context of your workflow config and execution logs. Ask me anything — what happened, why a node failed, trade details, or how to improve it.",
    },
  ]);

  // ── Execution state ──
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeExecStatus>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [preTradeData, setPreTradeData] = useState<PreTradeData | null>(null);
  const [postTradeData, setPostTradeData] = useState<PostTradeData | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoTab, setInfoTab] = useState<"pre" | "post">("pre");
  const [showApiModal, setShowApiModal] = useState(false);
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
    setPreTradeData(null);
    setPostTradeData(null);

    if (!selectedId) return;

    let cancelled = false;
    setLogsLoading(true);

    // Fetch persisted logs and run analysis in parallel
    Promise.all([
      fetch(`/api/rebalance-workflows/logs?workflow_id=${selectedId}`).then((r) => r.json()),
      fetch(`/api/rebalance-workflows/runs?workflow_id=${selectedId}`).then((r) => r.json()),
    ])
      .then(([logsData, runData]) => {
        if (cancelled) return;

        // Restore logs
        if (Array.isArray(logsData.logs) && logsData.logs.length > 0) {
          const restored: LogEntry[] = logsData.logs.map(
            (l: { time: string; node: string; level: string; msg: string }) => ({
              time: l.time,
              node: l.node,
              level: l.level as LogEntry["level"],
              msg: l.msg,
            }),
          );
          setLogs(restored);
        }

        // Restore pre/post trade analysis
        if (runData.run) {
          if (runData.run.pre_trade) {
            setPreTradeData(runData.run.pre_trade as PreTradeData);
          }
          if (runData.run.post_trade) {
            setPostTradeData(runData.run.post_trade as PostTradeData);
          }
        }

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

  const [chatLoading, setChatLoading] = useState(false);

  const handleSendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setChatInput("");
    setChatLoading(true);

    // Add a placeholder for the streaming response
    setChatMessages((prev) => [...prev, { role: "assistant", text: "" }]);

    try {
      const res = await fetch("/api/rebalance-workflows/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          workflow: selected
            ? {
                name: selected.name,
                status: selected.status,
                mode: selected.mode,
                venue: selected.venue,
                data_source: selected.data_source,
                engine_type: selected.engine_type,
                ai_model: selected.ai_model,
                allocation_type: selected.allocation_type,
                allocations: selected.allocations,
                investment: selected.investment,
                rebalance_mode: selected.rebalance_mode,
                threshold: selected.threshold,
                time_interval: selected.time_interval,
                condition_tab: selected.condition_tab,
                condition_coin: selected.condition_coin,
                condition_direction: selected.condition_direction,
                condition_value: selected.condition_value,
                stop_loss: selected.stop_loss,
                take_profit: selected.take_profit,
              }
            : null,
          logs: logs.map((l) => ({
            time: l.time,
            node: l.node,
            level: l.level,
            msg: l.msg,
          })),
          // Send prior messages (excluding the initial system message and current placeholder)
          history: chatMessages
            .slice(1)
            .filter((m) => m.text.length > 0),
        }),
      });

      if (!res.ok || !res.body) {
        setChatMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            text: "Sorry, I couldn't process your question. Please try again.",
          };
          return copy;
        });
        setChatLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const current = accumulated;
        setChatMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", text: current };
          return copy;
        });
      }
    } catch {
      setChatMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          text: "Connection error. Please try again.",
        };
        return copy;
      });
    } finally {
      setChatLoading(false);
    }
  };

  /* ── Execute workflow via SSE ── */
  const handleStartWorkflow = async () => {
    if (!selectedId || isExecuting) return;

    setIsExecuting(true);
    setNodeStatuses({});
    setLogs([]);
    setPreTradeData(null);
    setPostTradeData(null);
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
              } else if (eventType === "pre-trade") {
                setPreTradeData(data as PreTradeData);
              } else if (eventType === "post-trade") {
                setPostTradeData(data as PostTradeData);
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
      {/* ── Left Panel: Collapsible Workflow List ── */}
      <div
        className={`flex flex-shrink-0 flex-col border-r border-white/[0.07] bg-[#0a0a0a] transition-all duration-300 ease-in-out ${
          drawerCollapsed ? "w-[48px]" : "w-[280px]"
        }`}
      >
        <div
          className={`flex items-center border-b border-white/[0.07] py-3 ${
            drawerCollapsed ? "justify-center px-2" : "justify-between px-4"
          }`}
        >
          {!drawerCollapsed && (
            <h2 className="text-sm font-semibold text-zinc-200">Workflows</h2>
          )}
          <div className={`flex items-center ${drawerCollapsed ? "" : "gap-1"}`}>
            {!drawerCollapsed && (
              <button
                onClick={fetchWorkflows}
                className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-300"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                />
              </button>
            )}
            <button
              onClick={() => setDrawerCollapsed(!drawerCollapsed)}
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-300"
            >
              {drawerCollapsed ? (
                <PanelLeftOpen className="h-3.5 w-3.5" />
              ) : (
                <PanelLeftClose className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Collapsed: icon-only workflow indicators */}
        {drawerCollapsed ? (
          <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto pt-2">
            {workflows.map((w) => (
              <button
                key={w.id}
                onClick={() => {
                  setSelectedId(w.id);
                  setDrawerCollapsed(false);
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  w.id === selectedId
                    ? "bg-[#f1c232]/15 text-[#f1c232]"
                    : "text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-400"
                }`}
                title={w.name}
              >
                {w.status === "ongoing" ? (
                  <Clock className="h-3.5 w-3.5" />
                ) : w.status === "completed" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Calendar className="h-3.5 w-3.5" />
                )}
              </button>
            ))}
          </div>
        ) : (
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
        )}
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
              <button
                onClick={() => setShowInfoModal(true)}
                disabled={!preTradeData && !postTradeData}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  preTradeData || postTradeData
                    ? "border-white/[0.10] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]"
                    : "border-zinc-700 bg-zinc-800/50 text-zinc-600 cursor-not-allowed"
                }`}
              >
                <Info className="h-3 w-3" />
                Info
              </button>
              {selected?.venue === "TrueMarkets" && (
                <button
                  onClick={() => setShowApiModal(true)}
                  className="flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20"
                >
                  <Terminal className="h-3 w-3" />
                  APIs
                </button>
              )}
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

        {/* ── Bottom Panel: Frosted Glass Tabbed Chat / Logs ── */}
        {selected && (
          <div
            data-panel
            className="flex h-[240px] flex-shrink-0 flex-col border-t border-white/[0.06] bg-white/[0.02] backdrop-blur-2xl"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
            }}
          >
            {/* Tab bar — frosted header */}
            <div
              className="flex items-center justify-between px-4 py-0 border-b border-white/[0.06]"
              style={{
                background: "rgba(255,255,255,0.025)",
                backdropFilter: "blur(20px) saturate(1.6)",
              }}
            >
              <div className="flex gap-0.5">
                <button
                  onClick={() => setBottomTab("logs")}
                  className={`flex items-center gap-1.5 rounded-t-lg px-3.5 py-2.5 text-[11px] font-semibold tracking-wide transition-all ${
                    bottomTab === "logs"
                      ? "bg-white/[0.06] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                  }`}
                >
                  <Terminal className="h-3 w-3" />
                  Execution Logs
                  {logs.length > 0 && (
                    <span
                      className={`ml-1 rounded-full px-1.5 py-0.5 text-[9px] tabular-nums ${
                        bottomTab === "logs"
                          ? "bg-emerald-400/15 text-emerald-300"
                          : "bg-white/[0.06] text-zinc-500"
                      }`}
                    >
                      {logs.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setBottomTab("chat")}
                  className={`flex items-center gap-1.5 rounded-t-lg px-3.5 py-2.5 text-[11px] font-semibold tracking-wide transition-all ${
                    bottomTab === "chat"
                      ? "bg-white/[0.06] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                  }`}
                >
                  <MessageSquare className="h-3 w-3" />
                  AI Chat
                </button>
              </div>
              {bottomTab === "logs" && (
                <div className="flex items-center gap-3">
                  {isExecuting && (
                    <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] text-emerald-300 backdrop-blur-sm">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      </span>
                      live
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-500">
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        selected.status === "ongoing"
                          ? "bg-emerald-400/10 text-emerald-300"
                          : selected.status === "completed"
                            ? "bg-white/[0.04] text-zinc-400"
                            : "bg-[#f1c232]/10 text-[#f1c232]"
                      }`}
                    >
                      {selected.status}
                    </span>
                  </span>
                  <button
                    className="rounded-md p-1 text-zinc-600 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
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

            {/* Chat content — frosted bubbles */}
            {bottomTab === "chat" && (
              <div className="flex flex-1 flex-col min-h-0">
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
                  {chatMessages.map((m, i) => (
                    <div
                      key={i}
                      className={`flex ${m.role === "user" ? "justify-end" : ""}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[11px] leading-relaxed ${
                          m.role === "user"
                            ? "rounded-br-md bg-[#f1c232]/12 text-zinc-100 shadow-[inset_0_1px_0_rgba(241,194,50,0.15)] backdrop-blur-sm"
                            : "rounded-bl-md bg-white/[0.05] text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm"
                        }`}
                        style={{
                          backdropFilter: "blur(12px) saturate(1.4)",
                        }}
                      >
                        {m.text ? (
                          m.role === "user" ? (
                            m.text
                          ) : (
                            <ChatMarkdown text={m.text} />
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 text-zinc-500">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            thinking...
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Frosted input bar */}
                <div
                  className="border-t border-white/[0.06] px-3 py-2.5"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    backdropFilter: "blur(20px) saturate(1.5)",
                  }}
                >
                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                      placeholder={chatLoading ? "Thinking..." : "Ask about this workflow..."}
                      disabled={chatLoading}
                      className="flex-1 bg-transparent text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600 disabled:opacity-50"
                    />
                    <button
                      onClick={handleSendChat}
                      disabled={chatLoading}
                      className={`rounded-lg p-1.5 transition-all ${
                        chatLoading
                          ? "text-zinc-600"
                          : "text-[#f1c232] hover:bg-[#f1c232]/10 hover:text-[#f5d04a]"
                      }`}
                    >
                      {chatLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Logs content — frosted terminal */}
            {bottomTab === "logs" && (
              <div
                className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[11px]"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.15) 100%)",
                }}
              >
                {logs.length > 0 ? (
                  <>
                    {logs.map((log, i) => (
                      <div
                        key={i}
                        className="flex gap-2 rounded-md px-2 py-[3px] leading-5 transition-colors hover:bg-white/[0.02]"
                      >
                        <span className="text-zinc-600 select-none flex-shrink-0 tabular-nums">
                          {log.time}
                        </span>
                        <span
                          className={`flex-shrink-0 w-[90px] ${
                            log.node === "SYSTEM"
                              ? "text-zinc-500"
                              : "text-zinc-500"
                          }`}
                        >
                          <span className="rounded bg-white/[0.04] px-1 py-[1px] text-[10px]">
                            {log.node}
                          </span>
                        </span>
                        <span
                          className={
                            log.level === "ok"
                              ? "text-emerald-400/90"
                              : log.level === "warn"
                                ? "text-amber-400/90"
                                : log.level === "error"
                                  ? "text-red-400/90"
                                  : "text-zinc-400"
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
                    <p className="text-[12px] text-zinc-600">
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

      {/* ── Info Modal: Pre-Trade / Post-Trade Analysis ── */}
      {showInfoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowInfoModal(false)}
        >
          <div
            className="relative w-full max-w-[560px] max-h-[80vh] overflow-hidden rounded-2xl border border-white/[0.08] shadow-2xl"
            style={{
              background: "linear-gradient(180deg, rgba(18,18,22,0.97) 0%, rgba(10,10,14,0.98) 100%)",
              backdropFilter: "blur(40px) saturate(1.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5"
              style={{ background: "rgba(255,255,255,0.02)" }}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06]">
                  <Info className="h-3.5 w-3.5 text-zinc-300" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  Trade Analysis
                </h3>
                {selected && (
                  <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] text-zinc-500">
                    {selected.name}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tab bar */}
            <div
              className="flex border-b border-white/[0.06] px-5"
              style={{ background: "rgba(255,255,255,0.015)" }}
            >
              <button
                onClick={() => setInfoTab("pre")}
                className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-[11px] font-semibold tracking-wide transition-all ${
                  infoTab === "pre"
                    ? "border-[#8b5cf6] text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <BarChart2 className="h-3 w-3" />
                Pre-Trade
              </button>
              <button
                onClick={() => setInfoTab("post")}
                className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-[11px] font-semibold tracking-wide transition-all ${
                  infoTab === "post"
                    ? "border-[#f97316] text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <TrendingUp className="h-3 w-3" />
                Post-Trade
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto px-5 py-4" style={{ maxHeight: "calc(80vh - 110px)" }}>
              {infoTab === "pre" && (
                preTradeData ? (
                  <div className="space-y-4">
                    {/* Portfolio summary */}
                    <div className="grid grid-cols-3 gap-2">
                      <InfoCard
                        label="Portfolio Value"
                        value={`$${preTradeData.portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      />
                      <InfoCard
                        label="Max Drift"
                        value={`${preTradeData.maxDrift.toFixed(2)}%`}
                        color={preTradeData.maxDrift > 5 ? "#ef4444" : preTradeData.maxDrift > 2 ? "#f1c232" : "#22c55e"}
                      />
                      <InfoCard
                        label="Assets"
                        value={String(preTradeData.drifts.length)}
                      />
                    </div>

                    {/* Prices */}
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        Market Prices
                      </p>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                        {Object.entries(preTradeData.prices).map(([sym, price], i, arr) => (
                          <div
                            key={sym}
                            className={`flex items-center justify-between px-3.5 py-2 ${
                              i < arr.length - 1 ? "border-b border-white/[0.04]" : ""
                            }`}
                          >
                            <span className="text-[11px] font-medium text-zinc-300">{sym}</span>
                            <span className="text-[11px] font-semibold tabular-nums text-zinc-100">
                              ${price.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Drift table */}
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        Allocation Drift
                      </p>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                        {/* Header row */}
                        <div className="flex items-center border-b border-white/[0.06] bg-white/[0.02] px-3.5 py-1.5">
                          <span className="flex-1 text-[10px] font-semibold text-zinc-500">Asset</span>
                          <span className="w-[60px] text-right text-[10px] font-semibold text-zinc-500">Target</span>
                          <span className="w-[60px] text-right text-[10px] font-semibold text-zinc-500">Current</span>
                          <span className="w-[65px] text-right text-[10px] font-semibold text-zinc-500">Drift</span>
                          <span className="w-[80px] text-right text-[10px] font-semibold text-zinc-500">Action</span>
                        </div>
                        {preTradeData.drifts.map((d, i) => (
                          <div
                            key={d.symbol}
                            className={`flex items-center px-3.5 py-2 ${
                              i < preTradeData.drifts.length - 1 ? "border-b border-white/[0.04]" : ""
                            }`}
                          >
                            <span className="flex-1 text-[11px] font-medium text-zinc-200">{d.symbol}</span>
                            <span className="w-[60px] text-right text-[11px] tabular-nums text-zinc-400">
                              {d.targetPct}%
                            </span>
                            <span className="w-[60px] text-right text-[11px] tabular-nums text-zinc-300">
                              {d.currentPct.toFixed(1)}%
                            </span>
                            <span
                              className={`w-[65px] text-right text-[11px] font-semibold tabular-nums ${
                                Math.abs(d.driftPct) > 5
                                  ? "text-red-400"
                                  : Math.abs(d.driftPct) > 2
                                    ? "text-amber-400"
                                    : "text-emerald-400"
                              }`}
                            >
                              {d.driftPct > 0 ? "+" : ""}{d.driftPct.toFixed(1)}%
                            </span>
                            <span className="w-[80px] text-right text-[11px] tabular-nums text-zinc-400">
                              {d.diffUsd > 0 ? (
                                <span className="text-emerald-400">Buy ${Math.abs(d.diffUsd).toFixed(2)}</span>
                              ) : d.diffUsd < 0 ? (
                                <span className="text-red-400">Sell ${Math.abs(d.diffUsd).toFixed(2)}</span>
                              ) : (
                                <span className="text-zinc-600">—</span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-[200px] items-center justify-center">
                    <p className="text-[12px] text-zinc-600">
                      Run the workflow to see pre-trade analysis
                    </p>
                  </div>
                )
              )}

              {infoTab === "post" && (
                postTradeData ? (
                  <div className="space-y-4">
                    {/* Summary cards */}
                    <div className="grid grid-cols-3 gap-2">
                      <InfoCard
                        label="Drift Reduction"
                        value={`${postTradeData.benefitScore.toFixed(1)}%`}
                        color={postTradeData.benefitScore > 80 ? "#22c55e" : postTradeData.benefitScore > 50 ? "#f1c232" : "#ef4444"}
                      />
                      <InfoCard
                        label="Volume"
                        value={`$${postTradeData.totalTraded.toFixed(2)}`}
                      />
                      <InfoCard
                        label="Fees"
                        value={`$${postTradeData.estimatedFees.toFixed(2)}`}
                      />
                    </div>

                    {/* Drift comparison */}
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        Drift Before vs After
                      </p>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                        <div className="flex items-end gap-4">
                          <div className="flex-1">
                            <p className="text-[10px] text-zinc-500">Before</p>
                            <div className="mt-1 flex items-center gap-2">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                                <div
                                  className="h-full rounded-full bg-red-400/70"
                                  style={{ width: `${Math.min(postTradeData.driftBefore, 100)}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-semibold tabular-nums text-red-400">
                                {postTradeData.driftBefore.toFixed(2)}%
                              </span>
                            </div>
                          </div>
                          <div className="flex-1">
                            <p className="text-[10px] text-zinc-500">After</p>
                            <div className="mt-1 flex items-center gap-2">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                                <div
                                  className="h-full rounded-full bg-emerald-400/70"
                                  style={{ width: `${Math.min(postTradeData.driftAfter, 100)}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-semibold tabular-nums text-emerald-400">
                                {postTradeData.driftAfter.toFixed(2)}%
                              </span>
                            </div>
                          </div>
                        </div>
                        <p className="mt-2.5 text-center text-[10px] text-zinc-500">
                          Improvement: <span className="font-semibold text-emerald-400">{postTradeData.driftImprovement.toFixed(2)}pts</span>
                        </p>
                      </div>
                    </div>

                    {/* Orders */}
                    {postTradeData.orders.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          Executed Orders ({postTradeData.successfulOrders}/{postTradeData.totalOrders})
                        </p>
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                          {postTradeData.orders.map((order, i) => (
                            <div
                              key={`${order.symbol}-${i}`}
                              className={`flex items-center justify-between px-3.5 py-2 ${
                                i < postTradeData.orders.length - 1 ? "border-b border-white/[0.04]" : ""
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                    order.side === "buy"
                                      ? "bg-emerald-400/10 text-emerald-400"
                                      : "bg-red-400/10 text-red-400"
                                  }`}
                                >
                                  {order.side.toUpperCase()}
                                </span>
                                <span className="text-[11px] font-medium text-zinc-200">{order.symbol}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-[11px] tabular-nums text-zinc-300">
                                  ${order.notional.toFixed(2)}
                                </span>
                                <span
                                  className={`text-[10px] font-medium ${
                                    order.status === "failed"
                                      ? "text-red-400"
                                      : "text-emerald-400"
                                  }`}
                                >
                                  {order.status === "failed" ? "FAILED" : "FILLED"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Estimated new allocations */}
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        Estimated Post-Rebalance Allocations
                      </p>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                        <div className="flex items-center border-b border-white/[0.06] bg-white/[0.02] px-3.5 py-1.5">
                          <span className="flex-1 text-[10px] font-semibold text-zinc-500">Asset</span>
                          <span className="w-[60px] text-right text-[10px] font-semibold text-zinc-500">Target</span>
                          <span className="w-[60px] text-right text-[10px] font-semibold text-zinc-500">Actual</span>
                          <span className="w-[65px] text-right text-[10px] font-semibold text-zinc-500">Drift</span>
                        </div>
                        {postTradeData.estimatedDrifts.map((d, i) => (
                          <div
                            key={d.symbol}
                            className={`flex items-center px-3.5 py-2 ${
                              i < postTradeData.estimatedDrifts.length - 1 ? "border-b border-white/[0.04]" : ""
                            }`}
                          >
                            <span className="flex-1 text-[11px] font-medium text-zinc-200">{d.symbol}</span>
                            <span className="w-[60px] text-right text-[11px] tabular-nums text-zinc-400">
                              {d.targetPct}%
                            </span>
                            <span className="w-[60px] text-right text-[11px] tabular-nums text-zinc-300">
                              {d.newPct.toFixed(1)}%
                            </span>
                            <span
                              className={`w-[65px] text-right text-[11px] font-semibold tabular-nums ${
                                Math.abs(d.newDriftPct) > 2 ? "text-amber-400" : "text-emerald-400"
                              }`}
                            >
                              {d.newDriftPct > 0 ? "+" : ""}{d.newDriftPct.toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-[200px] items-center justify-center">
                    <p className="text-[12px] text-zinc-600">
                      Run the workflow to see post-trade analysis
                    </p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TrueMarkets APIs Modal ── */}
      {showApiModal && selected?.venue === "TrueMarkets" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowApiModal(false)}
        >
          <div
            className="relative w-full max-w-[600px] max-h-[85vh] overflow-hidden rounded-2xl border border-white/[0.08] shadow-2xl"
            style={{
              background: "linear-gradient(180deg, rgba(18,18,22,0.97) 0%, rgba(10,10,14,0.98) 100%)",
              backdropFilter: "blur(40px) saturate(1.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5"
              style={{ background: "rgba(255,255,255,0.02)" }}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/15">
                  <Terminal className="h-3.5 w-3.5 text-cyan-400" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  TrueMarkets APIs Used
                </h3>
              </div>
              <button
                onClick={() => setShowApiModal(false)}
                className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto px-5 py-4 space-y-3" style={{ maxHeight: "calc(85vh - 60px)" }}>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                The following TrueMarkets CLI commands and APIs are invoked during workflow execution. Each pipeline node uses specific commands to fetch data or execute trades.
              </p>

              <ApiNodeCard
                node="TRIGGER"
                color="#f1c232"
                title="Price Feed"
                commands={[
                  { cmd: `tm price ${(selected?.allocations ?? []).map((a: WorkflowAllocation) => a.symbol.replace(/USD$/i, "")).join(" ")} -o json`, desc: "Fetches real-time prices for all portfolio assets" },
                ]}
                endpoint="TrueMarkets Price API via CLI"
              />

              <ApiNodeCard
                node="PRE-TRADE"
                color="#8b5cf6"
                title="Balance Fetch"
                commands={[
                  { cmd: "tm balances -o json", desc: "Fetches all wallet token balances" },
                  { cmd: `tm price ${(selected?.allocations ?? []).map((a: WorkflowAllocation) => a.symbol.replace(/USD$/i, "")).join(" ")} -o json`, desc: "Enriches balances with USD prices" },
                ]}
                endpoint="TrueMarkets Balances + Price API"
              />

              <ApiNodeCard
                node="VALIDATOR"
                color="#a855f7"
                title="Price Re-verification"
                commands={[
                  { cmd: `tm price ${(selected?.allocations ?? []).map((a: WorkflowAllocation) => a.symbol.replace(/USD$/i, "")).join(" ")} -o json`, desc: "Re-fetches prices to check slippage since trigger" },
                ]}
                endpoint="TrueMarkets Price API via CLI"
              />

              <ApiNodeCard
                node="PLANNER"
                color="#3b82f6"
                title="AI Trade Planning"
                commands={[
                  { cmd: "POST https://openrouter.ai/api/v1/chat/completions", desc: `Generates optimal trade plan via ${selected?.ai_model || "Claude Sonnet 4.5"}` },
                ]}
                endpoint="OpenRouter API (Claude)"
              />

              <ApiNodeCard
                node="EXECUTOR"
                color="#10b981"
                title="Trade Execution"
                commands={[
                  { cmd: "tm buy <token> <amount> --qty-unit quote --dry-run --force -o json", desc: "Dry-run quote for buy orders (validates before execution)" },
                  { cmd: "tm buy <token> <amount> --qty-unit quote --force -o json", desc: "Executes buy order on-chain" },
                  { cmd: "tm sell <token> <amount> --qty-unit base --dry-run --force -o json", desc: "Dry-run quote for sell orders" },
                  { cmd: "tm sell <token> <amount> --qty-unit base --force -o json", desc: "Executes sell order on-chain" },
                ]}
                endpoint="TrueMarkets Trade API via CLI"
              />

              <ApiNodeCard
                node="VERIFIER"
                color="#06b6d4"
                title="Balance Reconciliation"
                commands={[
                  { cmd: "tm balances -o json", desc: "Re-fetches wallet balances after on-chain settlement (2s delay)" },
                  { cmd: `tm price ${(selected?.allocations ?? []).map((a: WorkflowAllocation) => a.symbol.replace(/USD$/i, "")).join(" ")} -o json`, desc: "Enriches post-trade balances with current prices" },
                ]}
                endpoint="TrueMarkets Balances + Price API"
              />

              <ApiNodeCard
                node="REPORTER"
                color="#f43f5e"
                title="Persistence"
                commands={[
                  { cmd: "Supabase: UPDATE rebalance_workflows SET status = 'completed'", desc: "Updates workflow status" },
                  { cmd: "Supabase: INSERT INTO workflow_execution_logs", desc: "Persists all execution logs" },
                  { cmd: "Supabase: UPDATE workflow_execution_runs SET pre_trade, post_trade", desc: "Persists pre/post trade analysis" },
                ]}
                endpoint="Supabase PostgreSQL"
              />

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                  Authentication
                </p>
                <div className="space-y-1.5 text-[11px] text-zinc-400">
                  <p>TrueMarkets CLI authenticates via API key set with <code className="rounded bg-white/[0.06] px-1 py-[1px] text-[10px] font-mono text-cyan-300">tm config set api_key &lt;key&gt;</code></p>
                  <p>Trade payloads are signed locally using ES256. All orders execute on Solana chain by default.</p>
                  <p>CLI reference: <code className="rounded bg-white/[0.06] px-1 py-[1px] text-[10px] font-mono text-cyan-300">github.com/true-markets/cli</code></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── API Node Card sub-component ── */
function ApiNodeCard({
  node,
  color,
  title,
  commands,
  endpoint,
}: {
  node: string;
  color: string;
  title: string;
  commands: Array<{ cmd: string; desc: string }>;
  endpoint: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div
        className="flex items-center justify-between px-3.5 py-2 border-b border-white/[0.04]"
        style={{ background: `${color}08` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
            style={{ backgroundColor: `${color}18`, color }}
          >
            {node}
          </span>
          <span className="text-[11px] font-medium text-zinc-300">{title}</span>
        </div>
        <span className="text-[10px] text-zinc-600">{endpoint}</span>
      </div>
      <div className="px-3.5 py-2.5 space-y-2">
        {commands.map((c, i) => (
          <div key={i}>
            <code className="block rounded-md bg-black/30 px-2.5 py-1.5 text-[10px] font-mono leading-relaxed text-cyan-300 overflow-x-auto">
              {c.cmd}
            </code>
            <p className="mt-1 text-[10px] text-zinc-500">{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function InfoCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      className="rounded-xl border border-white/[0.06] p-3"
      style={{
        background: "rgba(255,255,255,0.02)",
        backdropFilter: "blur(12px)",
      }}
    >
      <p className="text-[10px] font-medium text-zinc-500">{label}</p>
      <p
        className="mt-0.5 text-[15px] font-semibold tabular-nums"
        style={{ color: color || "#e4e4e7" }}
      >
        {value}
      </p>
    </div>
  );
}

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
