"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";

/* ── Agent node definitions ── */
const AGENTS = [
  {
    id: "trigger",
    type: "ORCHESTRATOR",
    label: "Market Trigger",
    color: "#f1c232",
    desc: "Monitors price feeds and market conditions. Fires when trigger criteria are met (price threshold, time interval, or drift ratio).",
  },
  {
    id: "analyze",
    type: "ANALYZER",
    label: "Drift Analyzer",
    color: "#8b5cf6",
    desc: "Calculates portfolio drift from target allocation. Identifies overweight and underweight positions across all assets.",
  },
  {
    id: "validate",
    type: "VALIDATOR",
    label: "Validation Gate",
    color: "#a855f7",
    desc: "Re-verifies market conditions, checks price staleness and slippage. Prevents stale executions.",
  },
  {
    id: "plan",
    type: "PLANNER",
    label: "Trade Planner",
    color: "#3b82f6",
    desc: "AI-driven (Claude) or deterministic planner. Generates optimal trade sizes and order sequence to minimize slippage.",
  },
  {
    id: "execute",
    type: "EXECUTOR",
    label: "Execution Engine",
    color: "#10b981",
    desc: "Places orders via TrueMarkets CLI or Alpaca API. Supports dry-run validation before live execution on Solana.",
  },
  {
    id: "verify",
    type: "VERIFIER",
    label: "Balance Verifier",
    color: "#06b6d4",
    desc: "Reconciles post-trade balances against expected state. Confirms on-chain settlement and fill accuracy.",
  },
  {
    id: "post",
    type: "ANALYZER",
    label: "Post-Trade Analyzer",
    color: "#f97316",
    desc: "Evaluates rebalance quality. Measures drift reduction, execution cost, slippage, and net benefit score.",
  },
  {
    id: "report",
    type: "REPORTER",
    label: "Report & Notify",
    color: "#f43f5e",
    desc: "Persists results to database, sends email report via Resend with full pre/post trade analysis.",
  },
];

const EDGE_LABELS = [
  "prices",
  "drift",
  "verified",
  "trades",
  "orders",
  "balances",
  "metrics",
];

/* Layout: row pairs — [0], [1,2], [3], [4,5], [6], [7]
   Single nodes center, pairs side by side */
const ROWS: Array<[number] | [number, number]> = [
  [0],
  [1, 2],
  [3],
  [4, 5],
  [6],
  [7],
];

const SLIDES = ["/one.png", "/two.png", "/three.png"];

/* Animated arrow style (injected once) */
const ARROW_STYLE_ID = "demo-arrow-animation";
function ensureArrowStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(ARROW_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = ARROW_STYLE_ID;
  style.textContent = `
    @keyframes arrowPulse {
      0%, 100% { opacity: 0.35; transform: translateY(0); }
      50% { opacity: 0.85; transform: translateY(3px); }
    }
    .arrow-animated svg {
      animation: arrowPulse 1.8s ease-in-out infinite;
    }
    .arrow-animated:nth-child(2) svg { animation-delay: 0.15s; }
    .arrow-animated:nth-child(3) svg { animation-delay: 0.3s; }
  `;
  document.head.appendChild(style);
}

function AnimatedArrows({ color }: { color: string }) {
  return (
    <div className="flex flex-col items-center gap-0">
      {[0, 1, 2].map((i) => (
        <span key={i} className="arrow-animated">
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
            <path
              d="M1 1L7 7L13 1"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ))}
    </div>
  );
}

export default function DemoPage() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  useEffect(() => {
    ensureArrowStyles();
  }, []);

  const nextSlide = useCallback(() => {
    setActiveSlide((prev) => (prev + 1) % SLIDES.length);
  }, []);

  useEffect(() => {
    const interval = setInterval(nextSlide, 5000);
    return () => clearInterval(interval);
  }, [nextSlide]);

  return (
    <div className="flex min-h-screen bg-[#08080a] text-zinc-100">
      {/* ── Left: Image Slider ── */}
      <div className="flex w-1/2 flex-col items-center mt-8 border-r border-white/[0.06] px-2">
        <div className="mb-8 max-w-[680px] text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            TrueMarkets Portfolio Rebalance System
          </p>
          <h2
            className="mt-2 text-[28px] font-light leading-tight text-zinc-200"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            Automated portfolio rebalancing powered by AI agents
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-zinc-400">
            Eight specialized agents collaborate to monitor markets, analyze
            drift, plan optimal trades, execute on-chain, and report results —
            all in a single pipeline.
          </p>
        </div>

        <div className="mt-24 relative w-full aspect-[16/10] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0c0c10] shadow-2xl">
          {SLIDES.map((src, i) => (
            <div
              key={src}
              className="absolute inset-0 transition-opacity duration-700 ease-in-out"
              style={{ opacity: activeSlide === i ? 1 : 0 }}
            >
              <Image
                src={src}
                alt={`Demo slide ${i + 1}`}
                fill
                className="object-cover"
                priority={i === 0}
              />
            </div>
          ))}

          <div
            className="absolute inset-x-0 bottom-0 h-16"
            style={{
              background: "linear-gradient(transparent, rgba(8,8,10,0.9))",
            }}
          />
        </div>

        {/* Dots */}
        <div className="mt-5 flex items-center gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveSlide(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                activeSlide === i
                  ? "w-6 bg-[#f1c232]"
                  : "w-2 bg-white/[0.15] hover:bg-white/[0.25]"
              }`}
            />
          ))}
        </div>
      </div>

      {/* ── Right: Pipeline + Explanations side by side ── */}
      <div className="flex w-1/2 flex-col">
        {/* Pipeline header */}
        <div className="border-b border-white/[0.06] px-4 py-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Rebalance Pipeline &middot; Agent System
          </p>
          {/* <h1
            className="mt-2 text-[28px] font-light text-zinc-200"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            Agents Workflow
          </h1> */}
        </div>

        {/* Pipeline flow + explanations side by side */}
        <div className="flex flex-1 min-h-0 mt-16">
          {/* Pipeline flow */}
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <div className="mx-auto max-w-[420px] space-y-0">
              {ROWS.map((row, rowIdx) => {
                const arrowColor = AGENTS[row[0]].color;
                const agentsBefore = ROWS.slice(0, rowIdx).reduce(
                  (s, r) => s + r.length,
                  0,
                );

                return (
                  <div key={rowIdx}>
                    {rowIdx > 0 && (
                      <div className="flex flex-col items-center gap-0 py-1">
                        <span
                          className="mb-1 rounded-full border px-2 py-0.5 text-[9px] font-medium tracking-wide"
                          style={{
                            borderColor: `${AGENTS[ROWS[rowIdx - 1][0]].color}30`,
                            color: `${AGENTS[ROWS[rowIdx - 1][0]].color}99`,
                            backgroundColor: `${AGENTS[ROWS[rowIdx - 1][0]].color}08`,
                          }}
                        >
                          {EDGE_LABELS[agentsBefore - 1] || "signal"}
                        </span>
                        <AnimatedArrows color={arrowColor} />
                      </div>
                    )}

                    {row.length === 1 ? (
                      <div className="flex justify-center">
                        <AgentNode
                          agent={AGENTS[row[0]]}
                          hovered={hoveredAgent === AGENTS[row[0]].id}
                          onHover={setHoveredAgent}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <AgentNode
                          agent={AGENTS[row[0]]}
                          hovered={hoveredAgent === AGENTS[row[0]].id}
                          onHover={setHoveredAgent}
                        />
                        <div className="flex flex-col items-center gap-0.5">
                          <span
                            className="h-1 w-1 rounded-full"
                            style={{
                              backgroundColor: `${AGENTS[row[0]].color}50`,
                            }}
                          />
                          <span
                            className="h-px w-3"
                            style={{
                              background: `linear-gradient(90deg, ${AGENTS[row[0]].color}30, ${AGENTS[row[1]].color}30)`,
                            }}
                          />
                          <span
                            className="h-1 w-1 rounded-full"
                            style={{
                              backgroundColor: `${AGENTS[row[1]].color}50`,
                            }}
                          />
                        </div>
                        <AgentNode
                          agent={AGENTS[row[1]]}
                          hovered={hoveredAgent === AGENTS[row[1]].id}
                          onHover={setHoveredAgent}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agent explanations — right column */}
          <div className="w-[400px] flex-shrink-0 overflow-y-auto border-l border-white/[0.06] px-3 py-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
              Agent Reference
            </p>
            <div className="space-y-1">
              {AGENTS.map((agent) => (
                <div
                  key={`desc-${agent.id}`}
                  className={`flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors duration-200 cursor-pointer ${
                    hoveredAgent === agent.id ? "bg-white/[0.04]" : ""
                  }`}
                  onMouseEnter={() => setHoveredAgent(agent.id)}
                  onMouseLeave={() => setHoveredAgent(null)}
                >
                  <span
                    className="mt-[5px] h-1.5 w-1.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: agent.color }}
                  />
                  <div className="min-w-0">
                    <p
                      className="text-[11px] font-semibold"
                      style={{ color: agent.color }}
                    >
                      {agent.label}
                    </p>
                    <p className="text-[10px] leading-relaxed text-zinc-400">
                      {agent.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Agent Node Card ── */
function AgentNode({
  agent,
  hovered,
  onHover,
}: {
  agent: (typeof AGENTS)[number];
  hovered: boolean;
  onHover: (id: string | null) => void;
}) {
  return (
    <div
      className="w-[200px] cursor-pointer transition-all duration-200"
      onMouseEnter={() => onHover(agent.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div
        className="rounded-xl border p-3 transition-all duration-200"
        style={{
          borderColor: hovered ? agent.color : `${agent.color}25`,
          backgroundColor: hovered ? `${agent.color}08` : "#0c0c10",
          boxShadow: hovered
            ? `0 0 30px ${agent.color}15, inset 0 0 0 1px ${agent.color}20`
            : "none",
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full flex-shrink-0 transition-shadow duration-200"
            style={{
              backgroundColor: agent.color,
              boxShadow: hovered ? `0 0 8px ${agent.color}60` : "none",
            }}
          />
          <div className="min-w-0 flex-1">
            <p
              className="text-[9px] font-bold tracking-[0.12em]"
              style={{ color: `${agent.color}90` }}
            >
              {agent.type}
            </p>
            <p className="text-[12px] font-semibold text-zinc-200 truncate">
              {agent.label}
            </p>
          </div>
          <span
            className="h-1.5 w-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: `${agent.color}40` }}
          />
        </div>
      </div>
    </div>
  );
}
