"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Check,
  X,
  Plus,
  Minus,
  ChevronDown,
  Search,
  ArrowRight,
  Sparkles,
  Code2,
  Upload,
} from "lucide-react";
import { RiBankFill } from "react-icons/ri";
import Image from "next/image";
import { toast } from "sonner";

/* ── types ── */
interface CoinOption {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
}

interface AllocationEntry {
  coin: CoinOption;
  pct: number;
}

type Step = "allocation" | "rebalance" | "engine" | "advanced";
type EngineType = "truesignal" | "custom";

type RebalanceMode = "ratio" | "time" | "conditions";
type TimeInterval = "4h" | "12h" | "1d" | "1w";
type ConditionTab = "price" | "percentage";
type ConditionDirection = "above" | "below";

interface PortfolioBalance {
  id: string;
  symbol: string;
  name: string;
  icon: string | null;
  balance: string;
  price_usd?: number;
  value_usd?: number;
  stable: boolean;
  tradeable: boolean;
}

interface PaperPosition {
  symbol: string;
  qty: string;
  market_value: string;
  avg_entry_price: string;
  allocation_pct: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  coins: CoinOption[];
  portfolioBalances: PortfolioBalance[];
  paperPositions: PaperPosition[];
  mode: "live" | "paper";
  availableBalance?: number;
}

/* ── constants ── */
const STEPS: { key: Step; label: string }[] = [
  { key: "allocation", label: "Allocation" },
  { key: "rebalance", label: "Rebalance" },
  { key: "engine", label: "Engine" },
  { key: "advanced", label: "Advanced" },
];

const STEP_ORDER: Step[] = ["allocation", "rebalance", "engine", "advanced"];

const TIME_OPTIONS: { value: TimeInterval; label: string }[] = [
  { value: "4h", label: "4 Hours" },
  { value: "12h", label: "12 Hours" },
  { value: "1d", label: "1 Day" },
  { value: "1w", label: "1 Week" },
];

/* ── component ── */
export default function RebalancePortfolioModal({
  open,
  onClose,
  coins,
  portfolioBalances,
  paperPositions,
  mode,
  availableBalance = 0,
}: Props) {
  const [step, setStep] = useState<Step>("allocation");

  // Step 1 — Allocation
  const [allocationType, setAllocationType] = useState<
    "equal" | "marketcap" | "ai"
  >("equal");
  const [allocations, setAllocations] = useState<AllocationEntry[]>([]);
  const [investment, setInvestment] = useState("");
  const [showCoinPicker, setShowCoinPicker] = useState(false);
  const [coinSearch, setCoinSearch] = useState("");

  // Step 2 — Market Conditions
  const [conditionTab, setConditionTab] = useState<ConditionTab>("price");
  const [conditionCoin, setConditionCoin] = useState("");
  const [conditionDirection, setConditionDirection] =
    useState<ConditionDirection>("above");
  const [conditionValue, setConditionValue] = useState("");

  // Step 3 — Rebalance
  const [rebalanceMode, setRebalanceMode] = useState<RebalanceMode>("ratio");
  const [threshold, setThreshold] = useState(5);
  const [timeInterval, setTimeInterval] = useState<TimeInterval>("1d");

  // Step 3 — Execution Engine
  const [engineType, setEngineType] = useState<EngineType>("truesignal");
  const [customScript, setCustomScript] = useState("");
  const [dataSource, setDataSource] = useState(
    mode === "paper" ? "CoinGecko + Alpaca" : "TrueMarkets",
  );
  const [aiModel, setAiModel] = useState("claude-sonnet-4-5");
  const venue = mode === "paper" ? "Alpaca" : "TrueMarkets";

  // Step 4 — Advanced
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [triggerPrice, setTriggerPrice] = useState("");

  // Market cap loading state
  const [mcapLoading, setMcapLoading] = useState(false);

  // AI recommendation state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStrategy, setAiStrategy] = useState("");

  // Track previous open state to only reset on open transition
  const prevOpenRef = useRef(false);

  // Reset on open — pre-populate with portfolio holdings based on mode
  useEffect(() => {
    // Only reset when transitioning from closed → open
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open || wasOpen) return;

    setStep("allocation");
    setAllocationType("equal");
    setInvestment("");
    setShowCoinPicker(false);
    setCoinSearch("");
    setConditionTab("price");
    setConditionCoin("");
    setConditionDirection("above");
    setConditionValue("");
    setRebalanceMode("ratio");
    setThreshold(5);
    setTimeInterval("1d");
    setEngineType("truesignal");
    setCustomScript("");
    setDataSource(mode === "paper" ? "CoinGecko + Alpaca" : "TrueMarkets");
    setAiModel("claude-sonnet-4-5");
    setStopLoss("");
    setTakeProfit("");
    setTriggerPrice("");

    let entries: AllocationEntry[] = [];

    if (mode === "paper") {
      // Paper mode — use Alpaca positions
      const held = paperPositions.filter((p) => {
        const qty = Number(p.qty);
        return Number.isFinite(qty) && qty > 0;
      });

      entries = held.slice(0, 10).map((p) => {
        // Alpaca symbols can be like "BTC/USD" — normalize
        const sym = p.symbol.replace(/\/USD$/, "");
        const matched = coins.find(
          (c) => c.symbol.toLowerCase() === sym.toLowerCase(),
        );
        return {
          coin: {
            id: matched?.id ?? sym.toLowerCase(),
            symbol: sym,
            name: matched?.name ?? sym,
            image: matched?.image ?? "",
            current_price:
              matched?.current_price ?? (Number(p.avg_entry_price) || 0),
            market_cap: matched?.market_cap ?? 0,
          },
          pct: 0,
        };
      });
    } else {
      // Live mode — use TrueMarkets balances (non-zero, non-stable)
      const held = portfolioBalances.filter((b) => {
        const bal = Number(b.balance);
        return Number.isFinite(bal) && bal > 0 && !b.stable;
      });

      entries = held.slice(0, 10).map((b) => {
        const matched = coins.find(
          (c) => c.symbol.toLowerCase() === b.symbol.toLowerCase(),
        );
        return {
          coin: {
            id: matched?.id ?? b.id,
            symbol: b.symbol,
            name: matched?.name ?? b.name,
            image: matched?.image ?? b.icon ?? "",
            current_price: matched?.current_price ?? b.price_usd ?? 0,
            market_cap: matched?.market_cap ?? 0,
          },
          pct: 0,
        };
      });
    }

    if (entries.length === 0) {
      setAllocations([]);
      return;
    }

    // Equal distribution
    const base = Math.floor(100 / entries.length);
    const remainder = 100 - base * entries.length;
    setAllocations(
      entries.map((e, i) => ({
        ...e,
        pct: base + (i < remainder ? 1 : 0),
      })),
    );
  }, [open, mode, portfolioBalances, paperPositions, coins]);

  /* ── allocation helpers ── */
  const redistributeEqual = useCallback((entries: AllocationEntry[]) => {
    if (entries.length === 0) return entries;
    const base = Math.floor(100 / entries.length);
    const remainder = 100 - base * entries.length;
    return entries.map((e, i) => ({
      ...e,
      pct: base + (i < remainder ? 1 : 0),
    }));
  }, []);

  const redistributeByMarketCap = useCallback(
    (entries: AllocationEntry[]) => {
      if (entries.length === 0) return entries;
      const totalMcap = entries.reduce((s, e) => s + e.coin.market_cap, 0);
      if (totalMcap === 0) return redistributeEqual(entries);
      const raw = entries.map((e) => (e.coin.market_cap / totalMcap) * 100);
      const floored = raw.map(Math.floor);
      let remainder = 100 - floored.reduce((a, b) => a + b, 0);
      const decimals = raw
        .map((v, i) => ({ i, d: v - floored[i] }))
        .sort((a, b) => b.d - a.d);
      for (const { i } of decimals) {
        if (remainder <= 0) break;
        floored[i]++;
        remainder--;
      }
      return entries.map((e, i) => ({ ...e, pct: floored[i] }));
    },
    [redistributeEqual],
  );

  const addCoin = (coin: CoinOption) => {
    if (allocations.find((a) => a.coin.id === coin.id)) return;
    if (allocations.length >= 10) return;
    const next = [...allocations, { coin, pct: 0 }];
    const redistributed =
      allocationType === "equal"
        ? redistributeEqual(next)
        : redistributeByMarketCap(next);
    setAllocations(redistributed);
    setShowCoinPicker(false);
    setCoinSearch("");
  };

  const removeCoin = (id: string) => {
    const next = allocations.filter((a) => a.coin.id !== id);
    const redistributed =
      allocationType === "equal"
        ? redistributeEqual(next)
        : redistributeByMarketCap(next);
    setAllocations(redistributed);
  };

  const adjustPct = (idx: number, delta: number) => {
    setAllocations((prev) => {
      const copy = [...prev];
      const newVal = Math.max(1, Math.min(99, copy[idx].pct + delta));
      const oldVal = copy[idx].pct;
      const diff = newVal - oldVal;
      if (diff === 0) return prev;
      copy[idx] = { ...copy[idx], pct: newVal };
      // distribute the diff to the last item that isn't this one
      for (let i = copy.length - 1; i >= 0; i--) {
        if (i !== idx) {
          const adjusted = copy[i].pct - diff;
          if (adjusted >= 1) {
            copy[i] = { ...copy[i], pct: adjusted };
            return copy;
          }
        }
      }
      return prev;
    });
  };

  const remainingPct = 100 - allocations.reduce((s, a) => s + a.pct, 0);

  const filteredCoins = coins.filter(
    (c) =>
      !allocations.find((a) => a.coin.id === c.id) &&
      (c.name.toLowerCase().includes(coinSearch.toLowerCase()) ||
        c.symbol.toLowerCase().includes(coinSearch.toLowerCase())),
  );

  const currentIdx = STEP_ORDER.indexOf(step);
  const isLastStep = step === "advanced";
  const canProceedStep1 = allocations.length >= 2 && remainingPct === 0;
  const canProceed = step === "allocation" ? canProceedStep1 : true;

  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const payload = {
        name: `Rebalance ${allocations.map((a) => a.coin.symbol.replace(/\/USD$/i, "").toUpperCase()).join("-")}`,
        mode,
        allocation_type: allocationType,
        allocations: allocations.map((a) => ({
          symbol: a.coin.symbol.replace(/\/USD$/i, ""),
          name: a.coin.name,
          image: a.coin.image,
          pct: a.pct,
        })),
        investment: Number(investment) || 0,
        rebalance_mode: rebalanceMode,
        threshold: rebalanceMode === "ratio" ? threshold : null,
        time_interval: rebalanceMode === "time" ? timeInterval : null,
        condition_tab: rebalanceMode === "conditions" ? conditionTab : null,
        condition_coin: rebalanceMode === "conditions" ? conditionCoin : null,
        condition_direction:
          rebalanceMode === "conditions" ? conditionDirection : null,
        condition_value:
          rebalanceMode === "conditions" ? conditionValue : null,
        engine_type: engineType,
        custom_script: engineType === "custom" ? customScript : null,
        data_source: dataSource,
        ai_model: engineType === "truesignal" ? aiModel : null,
        venue,
        stop_loss: stopLoss ? Number(stopLoss) : null,
        take_profit: takeProfit ? Number(takeProfit) : null,
      };

      const res = await fetch("/api/rebalance-workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success("Workflow created", {
          description: `${payload.name} is now scheduled and ready to run.`,
          position: "bottom-right",
        });
      } else {
        toast.error("Failed to create workflow", {
          position: "bottom-right",
        });
      }

      onClose();
    } catch {
      toast.error("Failed to create workflow", {
        position: "bottom-right",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleNext = () => {
    if (isLastStep) {
      handleCreate();
      return;
    }
    const nextIdx = currentIdx + 1;
    if (nextIdx < STEP_ORDER.length) {
      setStep(STEP_ORDER[nextIdx]);
    }
  };

  const handleBack = () => {
    if (currentIdx > 0) {
      setStep(STEP_ORDER[currentIdx - 1]);
    }
  };

  useEffect(() => {
    if (allocations.length === 0) return;

    if (allocationType === "equal") {
      setAllocations((prev) => redistributeEqual(prev));
      setAiStrategy("");
      return;
    }

    let cancelled = false;

    if (allocationType === "ai") {
      // Fetch AI-recommended allocation
      const fetchAiRecommendation = async () => {
        setAiLoading(true);
        setAiStrategy("");
        try {
          const coinsPayload = allocations.map((a) => ({
            symbol: a.coin.symbol.replace(/\/USD$/i, ""),
            name: a.coin.name,
            current_price: a.coin.current_price,
            market_cap: a.coin.market_cap,
          }));

          const res = await fetch("/api/rebalance-recommendation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ coins: coinsPayload }),
          });
          const data = await res.json();
          if (cancelled) return;

          if (data?.allocations && Array.isArray(data.allocations)) {
            const aiMap = new Map<string, { pct: number; reason: string }>();
            for (const a of data.allocations) {
              aiMap.set(a.symbol.toLowerCase(), {
                pct: a.pct,
                reason: a.reason,
              });
            }

            setAllocations((prev) =>
              prev.map((entry) => {
                const normSym = entry.coin.symbol
                  .replace(/\/USD$/i, "")
                  .toLowerCase();
                const rec = aiMap.get(normSym);
                return rec ? { ...entry, pct: rec.pct } : entry;
              }),
            );

            if (typeof data.strategy === "string") {
              setAiStrategy(data.strategy);
            }
          }
        } catch {
          // Fallback to equal on error
          setAllocations((prev) => redistributeEqual(prev));
        } finally {
          if (!cancelled) setAiLoading(false);
        }
      };

      fetchAiRecommendation();
      return () => {
        cancelled = true;
      };
    }

    // "marketcap" — fetch live market cap data
    const fetchMarketCaps = async () => {
      setMcapLoading(true);
      setAiStrategy("");
      try {
        const normalizedSymbols = allocations.map((a) =>
          a.coin.symbol.replace(/\/USD$/i, "").toLowerCase(),
        );

        let mcapMap = new Map<string, number>();

        if (mode === "paper") {
          const idResults = await Promise.all(
            normalizedSymbols.map(async (sym) => {
              try {
                const res = await fetch(
                  `/api/crypto?endpoint=search&query=${encodeURIComponent(sym)}`,
                );
                const data = await res.json();
                if (cancelled) return null;
                const match = data?.coins?.find(
                  (c: { symbol: string }) => c.symbol.toLowerCase() === sym,
                );
                return match ? { sym, id: match.id as string } : null;
              } catch {
                return null;
              }
            }),
          );
          if (cancelled) return;

          const coinIds = idResults
            .filter((r): r is { sym: string; id: string } => r !== null)
            .map((r) => r.id);

          if (coinIds.length > 0) {
            const res = await fetch(
              `/api/crypto?endpoint=coins/markets&vs_currency=usd&ids=${coinIds.join(",")}&order=market_cap_desc&per_page=100&page=1`,
            );
            const data = await res.json();
            if (cancelled) return;
            if (Array.isArray(data)) {
              for (const coin of data) {
                mcapMap.set(coin.symbol.toLowerCase(), coin.market_cap ?? 0);
              }
            }
          }
        } else {
          const res = await fetch(
            `/api/crypto?endpoint=coins/markets&vs_currency=usd&order=market_cap_desc&per_page=100&page=1`,
          );
          const data = await res.json();
          if (cancelled) return;
          if (Array.isArray(data)) {
            for (const coin of data) {
              mcapMap.set(coin.symbol.toLowerCase(), coin.market_cap ?? 0);
            }
          }
        }

        setAllocations((prev) => {
          const updated = prev.map((entry) => {
            const normSym = entry.coin.symbol
              .replace(/\/USD$/i, "")
              .toLowerCase();
            return {
              ...entry,
              coin: {
                ...entry.coin,
                market_cap: mcapMap.get(normSym) ?? entry.coin.market_cap,
              },
            };
          });
          return redistributeByMarketCap(updated);
        });
      } catch {
        setAllocations((prev) => redistributeByMarketCap(prev));
      } finally {
        if (!cancelled) setMcapLoading(false);
      }
    };

    fetchMarketCaps();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocationType]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="rebalance-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          key="rebalance-modal"
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-white/[0.10] bg-[#0a0a0a] shadow-2xl"
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
            <div className="flex items-center gap-2.5">
              <RiBankFill className="h-4 w-4 text-[#f1c232]" />
              <h2 className="text-base font-bold tracking-tight text-white">
                Auto-Rebalance
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-600 transition-colors hover:text-zinc-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Step Indicator ── */}
          <div className="flex items-center gap-2 px-6 pb-2 pt-5">
            {STEPS.map((s, i) => {
              const isActive = i <= currentIdx;
              const isDone = i < currentIdx;
              return (
                <div key={s.key} className="flex flex-1 items-center gap-2">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300 ${
                      isDone
                        ? "bg-[#f1c232] text-white"
                        : isActive
                          ? "border-2 border-[#f1c232] text-[#f1c232]"
                          : "border border-white/[0.12] text-zinc-600"
                    }`}
                  >
                    {isDone ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                  <span
                    className={`text-xs font-mono transition-colors ${
                      isActive ? "text-zinc-200" : "text-zinc-600"
                    }`}
                  >
                    {s.label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`h-px flex-1 transition-colors duration-500 ${
                        isDone ? "bg-[#f1c232]/60" : "bg-white/[0.07]"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Content ── */}
          <div className="flex min-h-[360px] flex-col px-6 py-5">
            <AnimatePresence mode="wait">
              {/* ── Step 1: Allocation ── */}
              {step === "allocation" && (
                <motion.div
                  key="allocation"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.18 }}
                  className="flex flex-1 flex-col gap-4"
                >
                  {/* Allocation type toggle */}
                  <div>
                    <p className="mb-2 text-sm font-semibold text-zinc-200">
                      Allocation
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {(
                        [
                          ["equal", "Equal"],
                          ["marketcap", "By Market Cap"],
                          ["ai", "AI Recommendation"],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setAllocationType(val)}
                          className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400"
                        >
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                              allocationType === val
                                ? "border-[#f1c232] bg-[#f1c232]"
                                : "border-zinc-600"
                            }`}
                          >
                            {allocationType === val && (
                              <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            )}
                          </span>
                          <span
                            className={
                              allocationType === val
                                ? "text-zinc-100"
                                : "text-zinc-400"
                            }
                          >
                            {label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Coin rows */}
                  <div className="flex flex-col gap-1.5">
                    {allocations.map((entry, idx) => (
                      <div
                        key={entry.coin.id}
                        className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-[#0d111b] px-3 py-2"
                      >
                        <span className="w-4 text-[11px] tabular-nums text-zinc-600">
                          {idx + 1}
                        </span>
                        <Image
                          src={entry.coin.image}
                          alt={entry.coin.symbol}
                          width={22}
                          height={22}
                          className="rounded-full"
                        />
                        <span className="min-w-[48px] text-sm font-medium text-zinc-200 uppercase">
                          {entry.coin.symbol}
                        </span>
                        <div className="ml-auto flex items-center gap-1.5">
                          <button
                            onClick={() => adjustPct(idx, -1)}
                            className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.07] text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-10 text-center text-sm font-semibold tabular-nums text-zinc-100">
                            {entry.pct}%
                          </span>
                          <button
                            onClick={() => adjustPct(idx, 1)}
                            className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.07] text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => removeCoin(entry.coin.id)}
                            className="ml-1 flex h-6 w-6 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Remaining / Target */}
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <p>
                      Remaining allocation{" "}
                      <span
                        className={`font-bold ${remainingPct === 0 ? "text-emerald-400" : "text-[#f1c232]"}`}
                      >
                        {remainingPct}%
                      </span>{" "}
                      / Target{" "}
                      <span className="font-bold text-zinc-300">100%</span>
                    </p>
                    {(mcapLoading || aiLoading) && (
                      <span className="flex items-center gap-1 text-[#f1c232]">
                        <svg
                          className="h-3 w-3 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        {aiLoading
                          ? "Getting AI recommendation…"
                          : "Fetching market caps…"}
                      </span>
                    )}
                  </div>

                  {/* AI strategy insight */}
                  {aiStrategy && allocationType === "ai" && (
                    <div className="rounded-lg border border-[#f1c232]/20 bg-[#f1c232]/5 px-3 py-2">
                      <p className="text-[11px] font-semibold text-[#f1c232]">
                        AI Strategy
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">
                        {aiStrategy}
                      </p>
                    </div>
                  )}

                  {/* Add coins */}
                  <div className="relative">
                    <button
                      onClick={() => setShowCoinPicker(!showCoinPicker)}
                      disabled={allocations.length >= 10}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.10] bg-[#0d111b] py-2.5 text-sm text-zinc-400 transition-colors hover:border-white/[0.18] hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Coins
                    </button>

                    {/* Coin picker dropdown */}
                    {showCoinPicker && (
                      <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-white/[0.10] bg-[#111427] shadow-xl">
                        <div className="sticky top-0 border-b border-white/[0.07] bg-[#111427] p-2">
                          <div className="flex items-center gap-2 rounded border border-white/[0.07] bg-[#0a0a0a] px-2.5 py-1.5">
                            <Search className="h-3 w-3 text-zinc-600" />
                            <input
                              type="text"
                              value={coinSearch}
                              onChange={(e) => setCoinSearch(e.target.value)}
                              placeholder="Search coins..."
                              className="flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
                              autoFocus
                            />
                          </div>
                        </div>
                        {filteredCoins.slice(0, 20).map((coin) => (
                          <button
                            key={coin.id}
                            onClick={() => addCoin(coin)}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.04]"
                          >
                            <Image
                              src={coin.image}
                              alt={coin.symbol}
                              width={20}
                              height={20}
                              className="rounded-full"
                            />
                            <span className="text-sm font-medium text-zinc-200 uppercase">
                              {coin.symbol}
                            </span>
                            <span className="text-xs text-zinc-500">
                              {coin.name}
                            </span>
                          </button>
                        ))}
                        {filteredCoins.length === 0 && (
                          <p className="px-3 py-3 text-center text-xs text-zinc-600">
                            No coins found
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Investment */}
                  <div className="mt-auto border-t border-white/[0.07] pt-4">
                    <p className="text-sm font-semibold text-zinc-200">
                      Invest Coin
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Avbl:{" "}
                      <span className="text-zinc-400">
                        {availableBalance.toFixed(2)} USDT
                      </span>
                    </p>
                    <div className="mt-2 flex items-center justify-between rounded-lg border border-white/[0.07] bg-[#0d111b] px-3 py-2.5">
                      <span className="text-sm text-zinc-500">Investment</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={investment}
                          onChange={(e) => setInvestment(e.target.value)}
                          placeholder="0"
                          className="w-20 bg-transparent text-right text-sm font-medium text-zinc-100 outline-none placeholder:text-zinc-600"
                        />
                        <span className="text-sm text-zinc-400">USDT</span>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      Want to invest more funds?{" "}
                      <a
                        href="#"
                        className="font-medium text-[#f1c232] hover:underline"
                      >
                        Transfer
                      </a>{" "}
                      or{" "}
                      <a
                        href="#"
                        className="font-medium text-[#f1c232] hover:underline"
                      >
                        Deposit
                      </a>
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ── Step 2: Rebalance ── */}
              {step === "rebalance" && (
                <motion.div
                  key="rebalance"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.18 }}
                  className="flex flex-1 flex-col gap-5"
                >
                  <div>
                    <p className="mb-3 text-sm font-semibold text-zinc-200">
                      Rebalancing Mode
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          [
                            "ratio",
                            "Coin Ratio",
                            "Rebalance when allocation deviates beyond threshold",
                          ],
                          [
                            "time",
                            "Time-Based",
                            "Rebalance at fixed time intervals throught the day/week",
                          ],
                          [
                            "conditions",
                            "Market Conditions",
                            "Trigger when a coin hits a target price or % move",
                          ],
                        ] as const
                      ).map(([val, title, desc]) => (
                        <button
                          key={val}
                          onClick={() => setRebalanceMode(val)}
                          className={`rounded-lg border p-3 text-left transition-all ${
                            rebalanceMode === val
                              ? "border-[#f1c232]/50 bg-[#f1c232]/5"
                              : "border-white/[0.07] bg-[#0d111b] hover:border-white/[0.14]"
                          }`}
                        >
                          <p
                            className={`text-sm font-semibold ${rebalanceMode === val ? "text-[#f1c232]" : "text-zinc-300"}`}
                          >
                            {title}
                          </p>
                          <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                            {desc}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Ratio threshold */}
                  {rebalanceMode === "ratio" && (
                    <div>
                      <p className="mb-2 text-sm font-semibold text-zinc-200">
                        Deviation Threshold
                      </p>
                      <p className="mb-3 text-xs text-zinc-500">
                        Rebalance when any coin deviates more than this
                        percentage from target
                      </p>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={1}
                          max={20}
                          value={threshold}
                          onChange={(e) => setThreshold(Number(e.target.value))}
                          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/[0.07] accent-[#f1c232] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#f1c232]"
                        />
                        <span className="w-12 rounded border border-white/[0.07] bg-[#0d111b] px-2 py-1 text-center text-sm font-semibold tabular-nums text-zinc-100">
                          {threshold}%
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Time interval */}
                  {rebalanceMode === "time" && (
                    <div>
                      <p className="mb-2 text-sm font-semibold text-zinc-200">
                        Rebalance Interval
                      </p>
                      <p className="mb-3 text-xs text-zinc-500">
                        How often the bot rebalances your portfolio
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {TIME_OPTIONS.map(({ value, label }) => (
                          <button
                            key={value}
                            onClick={() => setTimeInterval(value)}
                            className={`rounded-lg border px-3 py-2 text-center text-xs font-medium transition-all ${
                              timeInterval === value
                                ? "border-[#f1c232]/50 bg-[#f1c232]/10 text-[#f1c232]"
                                : "border-white/[0.07] bg-[#0d111b] text-zinc-400 hover:border-white/[0.14] hover:text-zinc-200"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Market Conditions config */}
                  {rebalanceMode === "conditions" && (
                    <div>
                      <div className="mb-3 flex gap-1 rounded-lg border border-white/[0.07] bg-[#0d111b] p-1">
                        {(
                          [
                            ["price", "Price"],
                            ["percentage", "Percentage"],
                          ] as const
                        ).map(([val, label]) => (
                          <button
                            key={val}
                            onClick={() => setConditionTab(val)}
                            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                              conditionTab === val
                                ? "bg-[#171929] text-zinc-100"
                                : "text-zinc-500 hover:text-zinc-300"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      <div className="rounded-lg border border-white/[0.07] bg-[#0d111b] p-3">
                        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                          <span>Rebalance when</span>
                          <select
                            value={conditionCoin}
                            onChange={(e) => setConditionCoin(e.target.value)}
                            className="rounded-md border border-white/[0.10] bg-[#0a0a0a] px-2.5 py-1.5 text-xs font-medium text-zinc-200 outline-none"
                          >
                            <option value="" disabled>
                              Select coin
                            </option>
                            {allocations.map((a) => (
                              <option key={a.coin.id} value={a.coin.symbol}>
                                {a.coin.symbol
                                  .replace(/\/USD$/i, "")
                                  .toUpperCase()}
                              </option>
                            ))}
                          </select>
                          <span>goes</span>
                          <select
                            value={conditionDirection}
                            onChange={(e) =>
                              setConditionDirection(
                                e.target.value as ConditionDirection,
                              )
                            }
                            className="rounded-md border border-white/[0.10] bg-[#0a0a0a] px-2.5 py-1.5 text-xs font-medium text-zinc-200 outline-none"
                          >
                            <option value="above">above</option>
                            <option value="below">below</option>
                          </select>
                          {conditionTab === "price" ? (
                            <>
                              <span>the price of</span>
                              <div className="flex items-center gap-1 rounded-md border border-white/[0.10] bg-[#0a0a0a] px-2.5 py-1.5">
                                <span className="text-xs text-zinc-500">$</span>
                                <input
                                  type="number"
                                  value={conditionValue}
                                  onChange={(e) =>
                                    setConditionValue(e.target.value)
                                  }
                                  placeholder="0.00"
                                  className="w-20 bg-transparent text-xs font-medium text-zinc-200 outline-none placeholder:text-zinc-600"
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              <span>by</span>
                              <div className="flex items-center gap-1 rounded-md border border-white/[0.10] bg-[#0a0a0a] px-2.5 py-1.5">
                                <input
                                  type="number"
                                  value={conditionValue}
                                  onChange={(e) =>
                                    setConditionValue(e.target.value)
                                  }
                                  placeholder="0"
                                  className="w-16 bg-transparent text-xs font-medium text-zinc-200 outline-none placeholder:text-zinc-600"
                                />
                                <span className="text-xs text-zinc-500">%</span>
                              </div>
                            </>
                          )}
                        </div>

                        {conditionCoin && conditionValue && (
                          <div className="mt-3 rounded-md border border-[#f1c232]/20 bg-[#f1c232]/5 px-3 py-2">
                            <p className="text-[11px] text-zinc-400">
                              Rebalance triggers when{" "}
                              <span className="font-semibold text-zinc-200">
                                {conditionCoin
                                  .replace(/\/USD$/i, "")
                                  .toUpperCase()}
                              </span>{" "}
                              goes{" "}
                              <span className="font-semibold text-zinc-200">
                                {conditionDirection}
                              </span>{" "}
                              {conditionTab === "price" ? (
                                <>
                                  the price of{" "}
                                  <span className="font-semibold text-[#f1c232]">
                                    ${conditionValue}
                                  </span>
                                </>
                              ) : (
                                <>
                                  by{" "}
                                  <span className="font-semibold text-[#f1c232]">
                                    {conditionValue}%
                                  </span>
                                </>
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  <div className="mt-auto rounded-lg border border-white/[0.07] bg-[#0d111b] p-3">
                    <p className="mb-2 text-xs font-semibold text-zinc-400">
                      Summary
                    </p>
                    <div className="space-y-1 text-xs text-zinc-500">
                      <div className="flex justify-between">
                        <span>Assets</span>
                        <span className="text-zinc-300">
                          {allocations
                            .map((a) => a.coin.symbol.toUpperCase())
                            .join(", ")}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Mode</span>
                        <span className="text-zinc-300">
                          {rebalanceMode === "ratio"
                            ? `Coin Ratio (${threshold}%)`
                            : rebalanceMode === "time"
                              ? `Time-Based (${TIME_OPTIONS.find((t) => t.value === timeInterval)?.label})`
                              : `Market Conditions (${conditionTab === "price" ? "Price" : "Percentage"})`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Investment</span>
                        <span className="text-zinc-300">
                          {investment || "0"} USDT
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Step 3: Execution Engine ── */}
              {step === "engine" && (
                <motion.div
                  key="engine"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.18 }}
                  className="flex flex-1 flex-col gap-5"
                >
                  <div>
                    <p className="mb-1 text-sm font-semibold text-zinc-200">
                      Execution Engine
                    </p>
                    <p className="text-xs text-zinc-500">
                      Choose how the planner decides trade sizes and order
                      sequence
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* TrueSignal */}
                    <button
                      onClick={() => setEngineType("truesignal")}
                      className={`flex flex-col rounded-xl border p-4 text-left transition-all ${
                        engineType === "truesignal"
                          ? "border-[#f1c232]/50 bg-[#f1c232]/5"
                          : "border-white/[0.07] bg-[#0d111b] hover:border-white/[0.14]"
                      }`}
                    >
                      <div
                        className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${
                          engineType === "truesignal"
                            ? "bg-[#f1c232]/15"
                            : "bg-white/[0.04]"
                        }`}
                      >
                        <Sparkles
                          className={`h-5 w-5 ${
                            engineType === "truesignal"
                              ? "text-[#f1c232]"
                              : "text-zinc-500"
                          }`}
                        />
                      </div>
                      <p
                        className={`text-sm font-semibold ${
                          engineType === "truesignal"
                            ? "text-[#f1c232]"
                            : "text-zinc-300"
                        }`}
                      >
                        TrueSignal
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                        Powered by Claude Sonnet
                      </p>
                      <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
                        AI-driven planner that optimizes trade sizes, order
                        sequence, and timing based on real-time market
                        conditions and portfolio context.
                      </p>
                      {engineType === "truesignal" && (
                        <div className="mt-3 space-y-1 border-t border-white/[0.06] pt-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-600">
                              Model
                            </span>
                            <span className="text-[10px] font-medium text-zinc-400">
                              Claude Sonnet 4.5
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-600">
                              Strategy
                            </span>
                            <span className="text-[10px] font-medium text-zinc-400">
                              Min-slippage
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-600">
                              Max orders
                            </span>
                            <span className="text-[10px] font-medium text-zinc-400">
                              10
                            </span>
                          </div>
                        </div>
                      )}
                    </button>

                    {/* Custom Script */}
                    <button
                      onClick={() => setEngineType("custom")}
                      className={`flex flex-col rounded-xl border p-4 text-left transition-all ${
                        engineType === "custom"
                          ? "border-[#f1c232]/50 bg-[#f1c232]/5"
                          : "border-white/[0.07] bg-[#0d111b] hover:border-white/[0.14]"
                      }`}
                    >
                      <div
                        className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${
                          engineType === "custom"
                            ? "bg-[#f1c232]/15"
                            : "bg-white/[0.04]"
                        }`}
                      >
                        <Code2
                          className={`h-5 w-5 ${
                            engineType === "custom"
                              ? "text-[#f1c232]"
                              : "text-zinc-500"
                          }`}
                        />
                      </div>
                      <p
                        className={`text-sm font-semibold ${
                          engineType === "custom"
                            ? "text-[#f1c232]"
                            : "text-zinc-300"
                        }`}
                      >
                        Custom Script
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                        Upload your own logic
                      </p>
                      <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
                        Deterministic planner using your own script. Fully
                        reproducible and auditable — you control the exact
                        trade sizing and ordering logic.
                      </p>
                      {engineType === "custom" && (
                        <div className="mt-3 space-y-1 border-t border-white/[0.06] pt-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-600">
                              Method
                            </span>
                            <span className="text-[10px] font-medium text-zinc-400">
                              Deterministic
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-600">
                              Runtime
                            </span>
                            <span className="text-[10px] font-medium text-zinc-400">
                              Sandboxed
                            </span>
                          </div>
                        </div>
                      )}
                    </button>
                  </div>

                  {/* Custom script upload area */}
                  {engineType === "custom" && (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold text-zinc-200">
                          Script Logic
                        </p>
                        <button className="flex items-center gap-1 text-[10px] text-[#f1c232] hover:underline">
                          <Upload className="h-3 w-3" />
                          Upload file
                        </button>
                      </div>
                      <textarea
                        value={customScript}
                        onChange={(e) => setCustomScript(e.target.value)}
                        placeholder={`// Example: simple proportional rebalancer\nfunction plan(portfolio, targets) {\n  const trades = [];\n  for (const asset of portfolio) {\n    const diff = targets[asset.symbol] - asset.pct;\n    if (Math.abs(diff) > 1) {\n      trades.push({ asset: asset.symbol, delta: diff });\n    }\n  }\n  return trades;\n}`}
                        className="h-[140px] w-full rounded-lg border border-white/[0.07] bg-[#08080a] px-3 py-2.5 font-mono text-[11px] leading-relaxed text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-[#f1c232]/30"
                      />
                    </div>
                  )}

                  {/* Data Source */}
                  <div>
                    <p className="mb-2 text-xs font-semibold text-zinc-200">
                      Market Data Source
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ["CoinGecko + Alpaca", "CoinGecko + Alpaca"],
                          ["TrueMarkets", "TrueMarkets"],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => setDataSource(val)}
                          className={`rounded-lg border px-3 py-2 text-center text-xs font-medium transition-all ${
                            dataSource === val
                              ? "border-[#f1c232]/50 bg-[#f1c232]/10 text-[#f1c232]"
                              : "border-white/[0.07] bg-[#0d111b] text-zinc-400 hover:border-white/[0.14] hover:text-zinc-200"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* AI Model — only if TrueSignal */}
                  {engineType === "truesignal" && (
                    <div>
                      <p className="mb-2 text-xs font-semibold text-zinc-200">
                        AI Model
                      </p>
                      <select
                        value={aiModel}
                        onChange={(e) => setAiModel(e.target.value)}
                        className="w-full rounded-lg border border-white/[0.07] bg-[#0d111b] px-3 py-2 text-xs text-zinc-200 outline-none focus:border-[#f1c232]/50"
                      >
                        <option value="claude-sonnet-4-5">
                          Claude Sonnet 4.5
                        </option>
                        <option value="claude-opus-4-6">
                          Claude Opus 4.6
                        </option>
                        <option value="claude-haiku-4-5">
                          Claude Haiku 4.5
                        </option>
                      </select>
                    </div>
                  )}

                </motion.div>
              )}

              {/* ── Step 4: Advanced ── */}
              {step === "advanced" && (
                <motion.div
                  key="advanced"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.18 }}
                  className="flex flex-1 flex-col gap-5"
                >
                  <div>
                    <p className="mb-1 text-sm font-semibold text-zinc-200">
                      Advanced Options
                    </p>
                    <p className="text-xs text-zinc-500">
                      Optional risk controls for your rebalancing strategy
                    </p>
                  </div>

                  {/* Stop-loss */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                      Stop-Loss
                    </label>
                    <p className="mb-2 text-[11px] text-zinc-600">
                      Stop the bot if total portfolio drops below this
                      percentage
                    </p>
                    <div className="flex items-center rounded-lg border border-white/[0.07] bg-[#0d111b] px-3 py-2.5">
                      <span className="mr-1 text-sm text-red-400">-</span>
                      <input
                        type="number"
                        value={stopLoss}
                        onChange={(e) => setStopLoss(e.target.value)}
                        placeholder="e.g. 15"
                        className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                      />
                      <span className="text-xs text-zinc-500">%</span>
                    </div>
                  </div>

                  {/* Take-profit */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                      Take-Profit
                    </label>
                    <p className="mb-2 text-[11px] text-zinc-600">
                      Stop the bot if total portfolio gains exceed this
                      percentage
                    </p>
                    <div className="flex items-center rounded-lg border border-white/[0.07] bg-[#0d111b] px-3 py-2.5">
                      <span className="mr-1 text-sm text-emerald-400">+</span>
                      <input
                        type="number"
                        value={takeProfit}
                        onChange={(e) => setTakeProfit(e.target.value)}
                        placeholder="e.g. 25"
                        className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                      />
                      <span className="text-xs text-zinc-500">%</span>
                    </div>
                  </div>

                  {/* Final summary */}
                  <div className="mt-auto rounded-lg border border-[#f1c232]/20 bg-[#f1c232]/5 p-3">
                    <p className="text-xs font-semibold text-[#f1c232]">
                      Ready to launch
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                      Your rebalancing bot will monitor {allocations.length}{" "}
                      assets and automatically trade to maintain target
                      allocation.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Footer ── */}
          <div className="border-t border-white/[0.07] px-6 py-4">
            {currentIdx === 0 ? (
              <button
                onClick={handleNext}
                disabled={!canProceed}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#f1c232] px-5 py-2.5 text-sm font-semibold text-black transition-all hover:bg-[#f5d04a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={handleBack}
                  className="flex flex-1 items-center justify-center rounded-lg border border-white/[0.10] bg-[#0d111b] px-5 py-2.5 text-sm font-semibold text-zinc-300 transition-all hover:bg-[#171929] hover:text-zinc-100"
                >
                  Back
                </button>
                <button
                  onClick={handleNext}
                  disabled={!canProceed}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#f1c232] px-5 py-2.5 text-sm font-semibold text-black transition-all hover:bg-[#f5d04a] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isLastStep
                    ? creating
                      ? "Creating…"
                      : "Create Strategy"
                    : "Next"}
                  {!isLastStep && <ArrowRight className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
