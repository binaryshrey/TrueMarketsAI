"use client";

import { useState, useEffect, useRef, useCallback, useDeferredValue } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import TradingDashboardModal from "@/components/trading-dashboard-modal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Search,
  Send,
  X,
  RefreshCw,
  BarChart2,
  Zap,
  Globe,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  CircleUserRound,
} from "lucide-react";

// ApexCharts — no SSR
const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => <div className="w-20 h-9" />,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoinData {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_1h_in_currency?: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency?: number;
  price_change_24h: number;
  market_cap: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  sparkline_in_7d?: { price: number[] };
}

interface GlobalData {
  total_market_cap: { usd: number };
  total_volume: { usd: number };
  market_cap_change_percentage_24h_usd: number;
  market_cap_percentage: { btc: number; eth: number };
}

interface SentimentData {
  value: number;
  classification: string;
  label: string;
  tone: "bearish" | "neutral" | "bullish";
  timestamp: number;
}

interface PredictionMarket {
  id: string;
  slug?: string | null;
  question?: string;
  outcomes: string[];
  outcomePrices: string[];
  discussionOptions?: Array<{
    label: string;
    price: number;
    tokenId?: string | null;
    history: Array<{ t: number; p: number }>;
  }>;
  histories?: Array<{
    label: string;
    tokenId: string | null;
    history: Array<{ t: number; p: number }>;
  }>;
  volume: string;
  endDate: string | null;
  image: string | null;
}

interface CoinDetail {
  id: string;
  name: string;
  symbol: string;
  image: string | null;
  current_price: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  ath: number;
  atl: number;
  last_updated: string;
  prices: [number, number][];
  asset_type?: "crypto" | "equity";
}

interface CoinCardMeta {
  assetType: "crypto" | "equity";
  coinId?: string;
  symbol: string;
  name: string;
  range: string;
  loading: boolean;
  data?: CoinDetail;
  buyIntent?: boolean;
}

interface NewsItem {
  title: string;
  link: string;
  source?: string;
  publishedAt?: string;
}

interface PortfolioPosition {
  symbol: string;
  side: string;
  qty: string;
  avg_entry_price: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: number;
  unrealized_intraday_pl: string;
  unrealized_intraday_plpc: number;
  allocation_pct: number;
}

interface PortfolioOrder {
  id: string;
  symbol: string;
  side: string;
  type: string;
  status: string;
  time_in_force: string;
  qty: string;
  filled_qty: string;
  limit_price: string | null;
  submitted_at: string;
  filled_at: string;
}

interface PortfolioData {
  summary: {
    equity: number;
    last_equity: number;
    cash: number;
    buying_power: number;
    day_pnl: number;
    day_pnl_pct: number;
    unrealized_pnl_total: number;
    unrealized_pnl_pct: number;
    positions_count: number;
    pending_orders_count: number;
    partially_filled_orders_count: number;
    filled_orders_count: number;
  };
  account: {
    account_number?: string;
    status?: string;
    currency?: string;
  };
  positions: PortfolioPosition[];
  orders: {
    pending: PortfolioOrder[];
    partially_filled: PortfolioOrder[];
    filled: PortfolioOrder[];
  };
  fetched_at: string;
}

interface PortfolioContextPayload {
  fetched_at: string;
  summary: PortfolioData["summary"];
  top_positions: Array<{
    symbol: string;
    qty: string;
    avg_entry_price: string;
    market_value: string;
    unrealized_pl: string;
    unrealized_plpc: number;
  }>;
  pending_orders: Array<{
    symbol: string;
    side: string;
    type: string;
    status: string;
    qty: string;
    filled_qty: string;
    limit_price: string | null;
  }>;
  partially_filled_orders: Array<{
    symbol: string;
    side: string;
    type: string;
    status: string;
    qty: string;
    filled_qty: string;
    limit_price: string | null;
  }>;
  recent_filled_orders: Array<{
    symbol: string;
    side: string;
    type: string;
    status: string;
    qty: string;
    filled_qty: string;
    limit_price: string | null;
  }>;
}

interface NewsContextPayload {
  fetched_from_message_id: string;
  headlines: Array<{
    title: string;
    source?: string;
    publishedAt?: string;
    link: string;
  }>;
}

interface MarketSummaryItem {
  id: string;
  title: string;
  body: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  coinCard?: CoinCardMeta;
  portfolio?: PortfolioData;
  portfolioLoading?: boolean;
  news?: NewsItem[];
  followUps?: string[];
  newsLoading?: boolean;
}

type AlpacaOrderSide = "buy" | "sell";
type AlpacaOrderType = "market" | "limit";
type AlpacaTimeInForce = "gtc" | "ioc";

interface AlpacaConfigResponse {
  configured: boolean;
  orderUrl?: string;
}

interface AlpacaPlacedOrder {
  id: string;
  status: string;
  symbol: string;
  side: string;
  type: string;
  time_in_force: string;
  qty: string;
  limit_price?: string | null;
  submitted_at?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(price: number): string {
  if (price >= 1000)
    return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

function fmtBig(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toFixed(0)}`;
}

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtVolumeMultiple(volume: number, marketCap: number): string {
  if (!Number.isFinite(volume) || !Number.isFinite(marketCap) || marketCap <= 0) {
    return "--";
  }

  return `${((volume / marketCap) * 10).toFixed(1)}x`;
}

const DEFAULT_POSITION_NOTIONAL = 100;

function formatQtyFromNotional(
  price: number,
  notional = DEFAULT_POSITION_NOTIONAL,
) {
  if (!Number.isFinite(price) || price <= 0) return "1";
  const qty = notional / price;
  if (!Number.isFinite(qty) || qty <= 0) return "1";
  if (qty >= 1) return qty.toFixed(4).replace(/\.?0+$/, "");
  return qty.toFixed(6).replace(/\.?0+$/, "");
}

function formatRelativeUpdate(timestamp: number | null): string {
  if (!timestamp) return "Updated just now";

  const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (diffMinutes <= 1) return "Updated 1 minute ago";
  if (diffMinutes < 60) return `Updated ${diffMinutes} minutes ago`;

  const diffHours = Math.round(diffMinutes / 60);
  return `Updated ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
}

function buildLinePath(
  points: number[],
  width: number,
  height: number,
  padding = 2,
): string {
  if (points.length === 0) return "";

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  return points.reduce((path, point, index) => {
    const x =
      padding + (index / Math.max(points.length - 1, 1)) * Math.max(innerWidth, 0);
    const normalized = (point - min) / range;
    const y = padding + (1 - normalized) * Math.max(innerHeight, 0);

    return `${path}${index === 0 ? "M" : " L"} ${x} ${y}`;
  }, "");
}

function buildLinePathWithBounds(
  points: number[],
  min: number,
  max: number,
  width: number,
  height: number,
  padding = 4,
): string {
  if (points.length === 0) return "";

  const range = max - min || 1;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  return points.reduce((path, point, index) => {
    const x =
      padding + (index / Math.max(points.length - 1, 1)) * Math.max(innerWidth, 0);
    const normalized = (point - min) / range;
    const y = padding + (1 - normalized) * Math.max(innerHeight, 0);

    return `${path}${index === 0 ? "M" : " L"} ${x} ${y}`;
  }, "");
}

function pctCompact(n?: number): string {
  if (!Number.isFinite(n)) return "--";
  return `${Math.abs(n ?? 0).toFixed(1)}%`;
}

// ─── Card Sparkline (full-width area chart) ───────────────────────────────────

function CardSparkline({
  data,
  positive,
  height = 52,
}: {
  data: number[];
  positive: boolean;
  height?: number;
}) {
  const color = positive ? "#22c55e" : "#ef4444";
  const filtered = data.filter(Boolean).slice(-40);

  const series = [{ data: filtered }];
  const options = {
    chart: {
      type: "area" as const,
      sparkline: { enabled: true },
      animations: { enabled: false },
      background: "transparent",
    },
    stroke: { curve: "smooth" as const, width: 1.5 },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.25,
        opacityTo: 0.02,
        stops: [0, 100],
        colorStops: [
          { offset: 0, color, opacity: 0.25 },
          { offset: 100, color, opacity: 0.02 },
        ],
      },
    },
    tooltip: { enabled: false },
    colors: [color],
    grid: { show: false },
  };

  if (filtered.length < 2) return <div style={{ height }} className="w-full" />;

  return (
    <ReactApexChart
      type="area"
      series={series}
      options={options}
      width="100%"
      height={height}
    />
  );
}

function buildStepPath(
  points: number[],
  width: number,
  height: number,
  padding = 8,
): string {
  if (points.length === 0) return "";

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  return points.reduce((path, point, index) => {
    const x =
      padding + (index / Math.max(points.length - 1, 1)) * Math.max(innerWidth, 0);
    const y = padding + (1 - point) * Math.max(innerHeight, 0);

    if (index === 0) {
      return `M ${x} ${y}`;
    }

    return `${path} H ${x} V ${y}`;
  }, "");
}

function formatDiscussionLabel(label: string): string {
  const moneyMatch = label.match(/\$\d[\d,]*(?:\.\d+)?/);
  if (moneyMatch) return moneyMatch[0];

  const dateMatch = label.match(
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/i,
  );
  if (dateMatch) return dateMatch[0];

  return label;
}

function normalizeDiscussionQuestion(question?: string): string {
  const normalized = (question ?? "").toLowerCase();

  if (normalized.includes("what price will bitcoin hit in 2026")) {
    return "What price will Bitcoin hit in 2026?";
  }

  if (
    normalized.includes("microstrategy sells any bitcoin by") ||
    normalized.includes("strategy sells any bitcoin by")
  ) {
    return "MicroStrategy sells any Bitcoin by ___ ?";
  }

  return question ?? "";
}

function DiscussionChartCard({ market }: { market: PredictionMarket }) {
  const rankedOutcomes = (market.discussionOptions ?? [])
    .map((option) => ({
      label: formatDiscussionLabel(option.label),
      price: option.price,
      history: option.history,
    }))
    .filter((item) => item.label)
    .sort((a, b) => b.price - a.price)
    .slice(0, 2);

  const fallbackOutcomes = [
    { label: "Yes", price: 0.62, history: [] as Array<{ t: number; p: number }> },
    { label: "No", price: 0.38, history: [] as Array<{ t: number; p: number }> },
  ];
  const topOutcomes =
    rankedOutcomes.length >= 2 ? rankedOutcomes : fallbackOutcomes;
  const primarySeries =
    topOutcomes[0].history?.map((point) => point.p).filter(Number.isFinite) ?? [];
  const secondarySeries =
    topOutcomes[1].history?.map((point) => point.p).filter(Number.isFinite) ?? [];
  const fallbackPrimarySeries = [0.62, 0.64, 0.61, 0.66, 0.68, 0.7, 0.73];
  const fallbackSecondarySeries = [0.38, 0.36, 0.39, 0.34, 0.32, 0.3, 0.27];
  const resolvedPrimarySeries =
    primarySeries.length >= 2 ? primarySeries : fallbackPrimarySeries;
  const resolvedSecondarySeries =
    secondarySeries.length >= 2 ? secondarySeries : fallbackSecondarySeries;

  const chartWidth = 560;
  const chartHeight = 88;
  const primaryPath = buildStepPath(
    resolvedPrimarySeries,
    chartWidth,
    chartHeight,
    6,
  );
  const secondaryPath = buildStepPath(
    resolvedSecondarySeries,
    chartWidth,
    chartHeight,
    6,
  );

  return (
    <a
      href={
        market.slug
          ? `https://polymarket.com/event/${market.slug}`
          : "https://polymarket.com"
      }
      target="_blank"
      rel="noopener noreferrer"
      className="group relative overflow-hidden rounded-[22px] border border-white/[0.06] bg-[radial-gradient(circle_at_top,rgba(24,26,34,0.95),rgba(8,8,11,0.98)_62%)] p-3.5 transition-colors hover:border-white/[0.12]"
    >
      <div className="pointer-events-none absolute inset-x-6 bottom-0 h-px bg-white/[0.04]" />

      <div className="mb-2.5 flex items-start justify-between gap-4">
        <h3 className="max-w-[68%] text-[13px] font-medium leading-snug text-zinc-300 md:text-[14px]">
          {normalizeDiscussionQuestion(market.question)}
        </h3>

        <div className="shrink-0 space-y-1 text-right">
          {topOutcomes.map((outcome, index) => (
            <div key={`${market.id}-${outcome.label}`} className="leading-none">
              <div
                className={`text-[12px] font-medium md:text-[13px] ${
                  index === 0 ? "text-[#5a9bff]" : "text-zinc-400"
                }`}
              >
                {outcome.label}{" "}
                <span className="ml-2 tabular-nums">
                  {Math.round(outcome.price * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative h-[88px] w-full">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-full w-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d={secondaryPath}
            fill="none"
            stroke="rgba(140,145,155,0.35)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={primaryPath}
            fill="none"
            stroke="#4d91ff"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </a>
  );
}

function MarketLeaderSparkline({ data }: { data: number[] }) {
  const filtered = data.filter(Number.isFinite).slice(-36);
  const first = filtered[0] ?? 0;
  const last = filtered[filtered.length - 1] ?? 0;
  const positive = last >= first;
  const path = buildLinePath(filtered, 72, 26, 2);

  if (filtered.length < 2) {
    return <div className="h-[26px] w-[72px]" />;
  }

  return (
    <svg
      viewBox="0 0 72 26"
      className="h-[26px] w-[72px]"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke={positive ? "#22c55e" : "#ff3b3b"}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MarketSentimentMeter({ score }: { score: number }) {
  const activeBars = Math.max(2, Math.min(10, Math.round(score * 10)));

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 10 }, (_, index) => (
        <span
          key={index}
          className={`h-4 w-1 rounded-full ${
            index < activeBars ? "bg-white/[0.16]" : "bg-white/[0.06]"
          }`}
        />
      ))}
    </div>
  );
}

function PredictionBrowseCard({ market }: { market: PredictionMarket }) {
  const options = [...(market.discussionOptions ?? [])]
    .filter((option) => option.label)
    .sort((a, b) => b.price - a.price);
  const topOptions = options.slice(0, 2);
  const remainingCount = Math.max(0, options.length - topOptions.length);
  const volume = Number.parseFloat(market.volume ?? "0");

  return (
    <a
      href={
        market.slug
          ? `https://polymarket.com/event/${market.slug}`
          : "https://polymarket.com"
      }
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-[18px] border border-white/[0.07] bg-[#0a0a0a] p-4 transition-colors hover:border-white/[0.12] hover:bg-[#0d0d0f]"
    >
      <h3 className="mb-1 line-clamp-2 text-[15px] font-semibold leading-snug text-zinc-100">
        {normalizeDiscussionQuestion(market.question)}
      </h3>
      <p className="mb-3 text-[13px] text-zinc-500">{fmtBig(volume)} vol</p>

      <div className="space-y-2">
        {topOptions.map((option) => {
          const history = option.history ?? [];
          const last = history[history.length - 1]?.p;
          const prev = history[history.length - 2]?.p;
          const delta =
            Number.isFinite(last) && Number.isFinite(prev)
              ? ((last ?? 0) - (prev ?? 0)) * 100
              : 0;
          const deltaLabel = `${Math.abs(delta).toFixed(0)}%`;
          const deltaTone =
            delta > 0
              ? "text-emerald-400"
              : delta < 0
                ? "text-red-400"
                : "text-zinc-600";

          return (
          <div
            key={`${market.id}-${option.label}`}
            className="flex items-center justify-between gap-4"
          >
            <span className="min-w-0 truncate text-[14px] text-zinc-400">
              {formatDiscussionLabel(option.label)}
            </span>
            <div className="flex shrink-0 items-center gap-4">
              <span className="text-[15px] font-semibold tabular-nums text-zinc-100">
                {Math.round(option.price * 100)}%
              </span>
              <span
                className={`inline-flex min-w-[42px] items-center justify-end gap-0.5 text-[13px] font-medium tabular-nums ${deltaTone}`}
              >
                {delta > 0 ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : delta < 0 ? (
                  <ArrowDownRight className="h-3 w-3" />
                ) : null}
                {deltaLabel}
              </span>
            </div>
          </div>
        )})}
        {remainingCount > 0 && (
          <p className="pt-0.5 text-[14px] text-zinc-600">+{remainingCount} more</p>
        )}
      </div>
    </a>
  );
}

const WATCHLIST_RANGES = ["1D", "1M", "6M"] as const;

type WatchlistRange = (typeof WATCHLIST_RANGES)[number];
type WatchlistHistoryPoint = [number, number];

function buildFallbackHistory(coin: CoinData): WatchlistHistoryPoint[] {
  const sparkline = coin.sparkline_in_7d?.price ?? [];
  if (sparkline.length < 2) {
    const now = Date.now();
    const price = coin.current_price || 0;
    return [
      [now - 60 * 60 * 1000, price],
      [now, price],
    ];
  }

  const now = Date.now();
  const step = (7 * 24 * 60 * 60 * 1000) / Math.max(sparkline.length - 1, 1);

  return sparkline.map(
    (price, index) =>
      [now - (sparkline.length - 1 - index) * step, price] as WatchlistHistoryPoint,
  );
}

function formatWatchlistAxisLabel(
  timestamp: number,
  range: WatchlistRange,
): string {
  const date = new Date(timestamp);

  switch (range) {
    case "1D":
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    case "1M":
    case "6M":
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    case "YTD":
    case "1Y":
      return date.toLocaleDateString("en-US", {
        month: "short",
      });
    case "5Y":
      return date.toLocaleDateString("en-US", {
        year: "numeric",
      });
    default:
      return "";
  }
}

function buildWatchlistAxisLabels(
  prices: WatchlistHistoryPoint[],
  range: WatchlistRange,
  count = 6,
): string[] {
  if (!prices.length) return [];

  const total = Math.min(count, prices.length);

  return Array.from({ length: total }, (_, index) => {
    const targetIndex =
      total === 1
        ? prices.length - 1
        : Math.round((index / (total - 1)) * (prices.length - 1));

    return formatWatchlistAxisLabel(prices[targetIndex][0], range);
  });
}

function formatWatchlistHoverLabel(
  timestamp: number,
  range: WatchlistRange,
): string {
  const date = new Date(timestamp);

  switch (range) {
    case "1D":
      return date.toLocaleString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
      });
    case "1M":
    case "5Y":
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    default:
      return date.toLocaleDateString("en-US");
  }
}

function WatchlistMoversChart({ coins }: { coins: CoinData[] }) {
  const palette = ["#39c7d9", "#f08c67", "#e6cf57", "#c38ae6", "#ff5a66", "#5fd1a5"];
  const chartWidth = 1180;
  const chartHeight = 360;
  const chartPadding = 18;
  const [range, setRange] = useState<WatchlistRange>("1D");
  const [renderedRange, setRenderedRange] = useState<WatchlistRange>("1D");
  const [loadingRange, setLoadingRange] = useState(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [historyByRange, setHistoryByRange] = useState<
    Partial<Record<WatchlistRange, Record<string, WatchlistHistoryPoint[]>>>
  >({});
  const coinKey = coins.map((coin) => coin.id).join("|");

  useEffect(() => {
    let cancelled = false;
    const cachedSeries = historyByRange[range] ?? {};
    const hasFullRange = coins.every((coin) => cachedSeries[coin.id]?.length);

    if (hasFullRange) {
      if (renderedRange !== range) {
        setRenderedRange(range);
      }
      setLoadingRange(false);
      return;
    }

    const missingCoins = coins.filter((coin) => !(cachedSeries[coin.id]?.length));

    if (!missingCoins.length) return;

    const loadHistory = async () => {
      setLoadingRange(true);

      try {
        const results: Array<{
          coinId: string;
          prices: WatchlistHistoryPoint[];
        }> = [];

        for (let index = 0; index < missingCoins.length; index += 2) {
          const batch = missingCoins.slice(index, index + 2);
          const batchResults = await Promise.all(
            batch.map(async (coin) => {
              try {
                const res = await fetch(
                  `/api/coin-detail?coinId=${encodeURIComponent(coin.id)}&range=${range}&historyOnly=1`,
                );
                if (!res.ok) throw new Error(`${res.status}`);

                const detail = (await res.json()) as Pick<CoinDetail, "prices">;
                return {
                  coinId: coin.id,
                  prices:
                    detail.prices?.filter(
                      (point): point is WatchlistHistoryPoint =>
                        Array.isArray(point) &&
                        point.length === 2 &&
                        Number.isFinite(point[0]) &&
                        Number.isFinite(point[1]),
                    ) ?? [],
                };
              } catch {
                return {
                  coinId: coin.id,
                  prices: buildFallbackHistory(coin),
                };
              }
            }),
          );

          results.push(...batchResults);

          if (cancelled) return;
        }

        if (cancelled) return;

        setHistoryByRange((prev) => {
          const nextRangeSeries = { ...(prev[range] ?? {}) };
          results.forEach(({ coinId, prices }) => {
            nextRangeSeries[coinId] = prices;
          });

          return {
            ...prev,
            [range]: nextRangeSeries,
          };
        });
        setRenderedRange(range);
      } finally {
        if (!cancelled) {
          setLoadingRange(false);
        }
      }
    };

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [coinKey, coins, historyByRange, range, renderedRange]);

  useEffect(() => {
    setHoverRatio(null);
  }, [renderedRange]);

  const percentSeries = coins
    .map((coin, index) => {
      const prices =
        historyByRange[renderedRange]?.[coin.id] ??
        (renderedRange === "1D" ? buildFallbackHistory(coin) : []);
      if (prices.length < 2 || !prices[0]?.[1]) return null;

      const base = prices[0][1];
      if (!Number.isFinite(base) || base === 0) return null;

      const points = prices.map(([, price]) => ((price - base) / base) * 100);
      const latest = prices[prices.length - 1]?.[1] ?? coin.current_price;
      const deltaPrice = latest - base;
      const deltaPct = ((latest - base) / base) * 100;

      return {
        coin,
        color: palette[index % palette.length],
        points,
        prices,
        latest,
        deltaPrice,
        deltaPct,
      };
    })
    .filter(
      (
        item,
      ): item is {
        coin: CoinData;
        color: string;
        points: number[];
        prices: WatchlistHistoryPoint[];
        latest: number;
        deltaPrice: number;
        deltaPct: number;
      } => Boolean(item),
    );

  const allValues = percentSeries.flatMap((item) => item.points);
  const min = Math.min(...allValues, -5);
  const max = Math.max(...allValues, 1);
  const timeLabels = buildWatchlistAxisLabels(
    percentSeries[0]?.prices ?? [],
    renderedRange,
  );
  const hoverAnchorSeries = percentSeries[0] ?? null;
  const hoverIndex =
    hoverRatio !== null && hoverAnchorSeries
      ? Math.round(hoverRatio * Math.max(hoverAnchorSeries.prices.length - 1, 0))
      : null;
  const hoverX =
    hoverIndex !== null && hoverAnchorSeries
      ? chartPadding +
        (hoverIndex / Math.max(hoverAnchorSeries.prices.length - 1, 1)) *
          Math.max(chartWidth - chartPadding * 2, 0)
      : null;
  const hoveredSeries =
    hoverRatio !== null
      ? percentSeries.map((series) => {
          const pointIndex = Math.round(
            hoverRatio * Math.max(series.prices.length - 1, 0),
          );
          const point = series.prices[pointIndex];
          const pctPoint = series.points[pointIndex] ?? 0;
          const x =
            chartPadding +
            (pointIndex / Math.max(series.prices.length - 1, 1)) *
              Math.max(chartWidth - chartPadding * 2, 0);
          const normalized = (pctPoint - min) / (max - min || 1);
          const y =
            chartPadding +
            (1 - normalized) * Math.max(chartHeight - chartPadding * 2, 0);

          return {
            ...series,
            pointIndex,
            point,
            pctPoint,
            x,
            y,
          };
        })
      : [];
  const hoverTimestamp =
    hoverIndex !== null ? hoverAnchorSeries?.prices[hoverIndex]?.[0] ?? null : null;
  const tooltipLeftClass =
    hoverRatio !== null && hoverRatio > 0.62 ? "right-5" : "left-5";

  return (
    <div className="border-y border-white/[0.07] bg-[#0a0a0a]">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1">
            {WATCHLIST_RANGES.map((itemRange) => (
              <button
                key={itemRange}
                type="button"
                onClick={() => setRange(itemRange)}
                className={`rounded-xl px-3 py-2 text-[12px] font-medium transition-colors ${
                  range === itemRange
                    ? "bg-white/[0.08] text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                aria-pressed={range === itemRange}
              >
                {itemRange}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="rounded-2xl border border-white/[0.08] px-4 py-2 text-[13px] text-zinc-400 transition-colors hover:border-white/[0.12] hover:text-zinc-200"
          >
            Compare
          </button>
        </div>

        <div
          className="relative h-[360px] overflow-hidden rounded-[18px] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(255,255,255,0.015),transparent)]"
          onMouseLeave={() => setHoverRatio(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const nextRatio = (event.clientX - rect.left) / rect.width;
            setHoverRatio(Math.max(0, Math.min(1, nextRatio)));
          }}
        >
          <div className="pointer-events-none absolute inset-0">
            {Array.from({ length: 10 }, (_, index) => (
              <div
                key={`v-${index}`}
                className="absolute top-0 bottom-0 w-px bg-white/[0.04]"
                style={{ left: `${(index / 9) * 100}%` }}
              />
            ))}
            {Array.from({ length: 5 }, (_, index) => (
              <div
                key={`h-${index}`}
                className="absolute left-0 right-0 h-px bg-white/[0.04]"
                style={{ top: `${(index / 4) * 100}%` }}
              />
            ))}
            <div
              className="absolute left-0 right-0 h-px border-t border-dashed border-white/[0.18]"
              style={{
                top: `${chartPadding + ((max - 0) / (max - min || 1)) * (chartHeight - chartPadding * 2)}px`,
              }}
            />
          </div>

          <div className="pointer-events-none absolute left-5 top-6 text-[12px] text-zinc-500">
            0%
          </div>

          {hoverTimestamp && hoveredSeries.length > 0 && (
            <div
              className={`pointer-events-none absolute top-5 z-10 min-w-[190px] rounded-2xl border border-white/[0.08] bg-black/75 px-3 py-2.5 backdrop-blur-md ${tooltipLeftClass}`}
            >
              <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                {formatWatchlistHoverLabel(hoverTimestamp, renderedRange)}
              </p>
              <div className="space-y-1.5">
                {hoveredSeries.map((series) => (
                  <div
                    key={`${series.coin.id}-${series.pointIndex}`}
                    className="flex items-center justify-between gap-3 text-[12px]"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: series.color }}
                      />
                      <span className="truncate text-zinc-300">
                        {series.coin.symbol.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="font-medium tabular-nums text-zinc-100">
                        {fmt(series.point?.[1] ?? series.latest)}
                      </p>
                      <p
                        className={`tabular-nums ${
                          series.pctPoint >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {series.pctPoint >= 0 ? "+" : ""}
                        {series.pctPoint.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loadingRange && (
            <div className="pointer-events-none absolute right-5 top-5 flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/40 px-2.5 py-1 text-[11px] text-zinc-400 backdrop-blur-sm">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Updating
            </div>
          )}

          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className={`h-full w-full transition-opacity ${
              loadingRange ? "opacity-75" : "opacity-100"
            }`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {hoverX !== null && (
              <line
                x1={hoverX}
                x2={hoverX}
                y1={0}
                y2={chartHeight}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1"
                strokeDasharray="4 6"
              />
            )}
            {percentSeries.map((series) => (
              <path
                key={series.coin.id}
                d={buildLinePathWithBounds(
                  series.points,
                  min,
                  max,
                  chartWidth,
                  chartHeight,
                  chartPadding,
                )}
                fill="none"
                stroke={series.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {hoveredSeries.map((series) =>
              series.point ? (
                <g key={`${series.coin.id}-hover`}>
                  <circle
                    cx={series.x}
                    cy={series.y}
                    r="5"
                    fill="rgba(0,0,0,0.72)"
                    stroke={series.color}
                    strokeWidth="2"
                  />
                  <circle
                    cx={series.x}
                    cy={series.y}
                    r="2.25"
                    fill={series.color}
                  />
                </g>
              ) : null,
            )}
          </svg>

          <div className="pointer-events-none absolute bottom-4 left-5 right-5 flex items-center justify-between text-[11px] text-zinc-500">
            {timeLabels.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="grid grid-cols-[10px_minmax(0,1.6fr)_0.9fr_0.8fr_0.8fr] items-center gap-4 border-b border-white/[0.06] px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
          <span />
          <span>Asset</span>
          <span className="text-right">Price</span>
          <span className="text-right">{renderedRange} Change</span>
          <span className="text-right">{renderedRange} %</span>
        </div>
        {percentSeries.map((series) => {
          const coin = series.coin;
          const priceChange = series.deltaPrice;
          const pctChange = series.deltaPct;
          const positive = pctChange >= 0;

          return (
            <div
              key={coin.id}
              className="grid grid-cols-[10px_minmax(0,1.6fr)_0.9fr_0.8fr_0.8fr] items-center gap-4 border-b border-white/[0.06] px-4 py-3 last:border-b-0"
            >
              <span
                className="h-10 w-2 rounded-full"
                style={{ backgroundColor: series.color }}
              />
              <div className="flex min-w-0 items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coin.image}
                  alt={coin.name}
                  className="h-10 w-10 rounded-xl bg-black/30 object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-zinc-100">
                    {coin.name}
                  </p>
                  <p className="truncate text-[12px] text-zinc-500">
                    {coin.symbol.toUpperCase()} · CRYPTO
                  </p>
                </div>
              </div>
              <div className="text-right text-[14px] font-medium tabular-nums text-zinc-300">
                {fmt(series.latest)}
              </div>
              <div className={`text-right text-[14px] font-medium tabular-nums ${positive ? "text-emerald-400" : "text-red-400"}`}>
                {positive ? "+" : "-"}
                {fmt(Math.abs(priceChange))}
              </div>
              <div className="flex justify-end">
                <span
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-[13px] font-medium tabular-nums ${
                    positive
                      ? "bg-emerald-500/12 text-emerald-400"
                      : "bg-red-500/12 text-red-400"
                  }`}
                >
                  {positive ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {pctCompact(pctChange)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  // Split on **bold**, *italic*, `code` markers
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return (
    <>
      {tokens.map((token, i) => {
        if (token.startsWith("**") && token.endsWith("**"))
          return (
            <strong key={i} className="font-semibold text-white">
              {token.slice(2, -2)}
            </strong>
          );
        if (token.startsWith("*") && token.endsWith("*"))
          return (
            <em key={i} className="italic text-zinc-300">
              {token.slice(1, -1)}
            </em>
          );
        if (token.startsWith("`") && token.endsWith("`"))
          return (
            <code
              key={i}
              className="bg-white/10 rounded px-1 font-mono text-sm text-zinc-300"
            >
              {token.slice(1, -1)}
            </code>
          );
        return token;
      })}
    </>
  );
}

const SOURCE_URLS: Record<string, string> = {
  CoinGecko: "https://www.coingecko.com",
  "Yahoo Finance": "https://finance.yahoo.com",
  Alpaca: "https://alpaca.markets",
  Polymarket: "https://polymarket.com",
  "Alternative.me": "https://alternative.me/crypto/fear-and-greed-index/",
  "Claude AI": "https://claude.ai",
};

function makeMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildPortfolioContext(
  portfolio?: PortfolioData,
): PortfolioContextPayload | undefined {
  if (!portfolio) return undefined;

  return {
    fetched_at: portfolio.fetched_at,
    summary: portfolio.summary,
    top_positions: portfolio.positions.slice(0, 12).map((p) => ({
      symbol: p.symbol,
      qty: p.qty,
      avg_entry_price: p.avg_entry_price,
      market_value: p.market_value,
      unrealized_pl: p.unrealized_pl,
      unrealized_plpc: p.unrealized_plpc,
    })),
    pending_orders: portfolio.orders.pending.slice(0, 20).map((o) => ({
      symbol: o.symbol,
      side: o.side,
      type: o.type,
      status: o.status,
      qty: o.qty,
      filled_qty: o.filled_qty,
      limit_price: o.limit_price,
    })),
    partially_filled_orders: portfolio.orders.partially_filled
      .slice(0, 20)
      .map((o) => ({
        symbol: o.symbol,
        side: o.side,
        type: o.type,
        status: o.status,
        qty: o.qty,
        filled_qty: o.filled_qty,
        limit_price: o.limit_price,
      })),
    recent_filled_orders: portfolio.orders.filled.slice(0, 20).map((o) => ({
      symbol: o.symbol,
      side: o.side,
      type: o.type,
      status: o.status,
      qty: o.qty,
      filled_qty: o.filled_qty,
      limit_price: o.limit_price,
    })),
  };
}

function buildNewsContext(
  messages: ChatMessage[],
): NewsContextPayload | undefined {
  const latestNewsMessage = [...messages]
    .reverse()
    .find(
      (m) =>
        m.role === "assistant" && Array.isArray(m.news) && m.news.length > 0,
    );

  if (!latestNewsMessage?.news?.length) return undefined;

  return {
    fetched_from_message_id: latestNewsMessage.id,
    headlines: latestNewsMessage.news.slice(0, 6).map((n) => ({
      title: n.title,
      source: n.source,
      publishedAt: n.publishedAt,
      link: n.link,
    })),
  };
}

function SourcesFooter({ raw }: { raw: string }) {
  // raw = "CoinGecko · Polymarket · Claude AI"
  const sources = raw
    .split(/\s*·\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-2 mt-1 border-t border-white/6">
      <span className="text-sm text-zinc-600">Sources:</span>
      {sources.map((src) => {
        const url = SOURCE_URLS[src];
        return url ? (
          <a
            key={src}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 border border-white/8 text-sm text-zinc-400 hover:text-zinc-200 hover:border-white/16 transition-colors"
          >
            {src}
            <ExternalLink className="w-2 h-2 opacity-60" />
          </a>
        ) : (
          <span
            key={src}
            className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/8 text-sm text-zinc-400"
          >
            {src}
          </span>
        );
      })}
    </div>
  );
}

function MarkdownMessage({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let orderedItems: string[] = [];
  let sourcesRaw: string | null = null;

  const flushList = () => {
    if (listItems.length) {
      blocks.push(
        <ul
          key={blocks.length}
          className="list-disc list-inside space-y-0.5 text-zinc-300 text-sm"
        >
          {listItems.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      listItems = [];
    }
    if (orderedItems.length) {
      blocks.push(
        <ol
          key={blocks.length}
          className="list-decimal list-inside space-y-0.5 text-zinc-300 text-sm"
        >
          {orderedItems.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      orderedItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect **Sources:** line (Claude appends this at the end)
    const srcMatch = line.match(/^\*\*Sources:\*\*\s*(.+)/);
    if (srcMatch) {
      flushList();
      sourcesRaw = srcMatch[1].trim();
      continue;
    }

    if (/^### /.test(line)) {
      flushList();
      blocks.push(
        <p
          key={blocks.length}
          className="text-sm font-semibold text-zinc-200 mt-2"
        >
          {renderInline(line.slice(4))}
        </p>,
      );
    } else if (/^## /.test(line)) {
      flushList();
      blocks.push(
        <p key={blocks.length} className="text-sm font-bold text-white mt-2">
          {renderInline(line.slice(3))}
        </p>,
      );
    } else if (/^# /.test(line)) {
      flushList();
      blocks.push(
        <p key={blocks.length} className="text-sm font-bold text-white mt-2">
          {renderInline(line.slice(2))}
        </p>,
      );
    } else if (/^> /.test(line)) {
      flushList();
      blocks.push(
        <blockquote
          key={blocks.length}
          className="border-l-2 border-zinc-600 pl-3 text-zinc-400 italic text-sm"
        >
          {renderInline(line.slice(2))}
        </blockquote>,
      );
    } else if (/^[-*] /.test(line)) {
      if (orderedItems.length) flushList();
      listItems.push(line.slice(2));
    } else if (/^\d+\. /.test(line)) {
      if (listItems.length) flushList();
      orderedItems.push(line.replace(/^\d+\. /, ""));
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      blocks.push(
        <p
          key={blocks.length}
          className="text-sm text-zinc-300 leading-relaxed"
        >
          {renderInline(line)}
        </p>,
      );
    }
  }
  flushList();

  return (
    <div className="space-y-1.5">
      {blocks}
      {streaming && (
        <span className="inline-block w-0.5 h-3.5 bg-zinc-400 animate-pulse ml-0.5 align-middle" />
      )}
      {!streaming && sourcesRaw && <SourcesFooter raw={sourcesRaw} />}
    </div>
  );
}

function MessageContext({
  message,
  disabled,
  onFollowUp,
}: {
  message: ChatMessage;
  disabled: boolean;
  onFollowUp: (prompt: string) => void;
}) {
  const hasNews = Boolean(message.news?.length);
  const hasFollowUps = Boolean(message.followUps?.length);

  if (!message.newsLoading && !hasNews && !hasFollowUps) return null;

  return (
    <div className="mt-2.5 space-y-2">
      {message.newsLoading && (
        <div className="flex items-center gap-1.5 text-sm text-zinc-500">
          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
          Fetching related news…
        </div>
      )}

      {hasNews && (
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
          <p className="text-sm text-zinc-500 uppercase tracking-wide mb-1.5">
            Related News
          </p>
          <div className="space-y-1.5">
            {(message.news ?? []).slice(0, 3).map((item) => (
              <a
                key={`${item.link}-${item.title}`}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md border border-white/8 bg-white/[0.02] px-2 py-1.5 hover:border-white/16 hover:bg-white/[0.04] transition-colors"
              >
                <p className="text-sm text-zinc-200 leading-snug">
                  {item.title}
                </p>
                <p className="text-sm text-zinc-500 mt-0.5">
                  {[item.source, item.publishedAt].filter(Boolean).join(" · ")}
                </p>
              </a>
            ))}
          </div>
        </div>
      )}

      {hasFollowUps && (
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
          <p className="text-sm text-zinc-500 uppercase tracking-wide mb-1.5">
            Suggested Follow-Ups
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(message.followUps ?? []).slice(0, 3).map((q) => (
              <button
                key={q}
                type="button"
                disabled={disabled}
                onClick={() => onFollowUp(q)}
                className="text-left px-2 py-1 rounded-md border border-white/10 bg-white/[0.03] text-sm text-zinc-300 hover:text-white hover:border-white/20 hover:bg-white/[0.06] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Coin Detail Card ─────────────────────────────────────────────────────────

const RANGES = ["1D", "1W", "1M", "3M", "1Y"] as const;

function CoinDetailCard({ meta }: { meta: CoinCardMeta }) {
  const assetType = meta.assetType;
  const [range, setRange] = useState(meta.range);
  // localDetail is only set after a range-tab fetch; fall back to meta.data
  // so when meta.data arrives via prop update the card re-renders correctly.
  const [localDetail, setLocalDetail] = useState<CoinDetail | undefined>(
    undefined,
  );
  const detail = localDetail ?? meta.data;
  const [loadingRange, setLoadingRange] = useState(false);
  const [showTradeWidget, setShowTradeWidget] = useState(false);
  const [checkingConfig, setCheckingConfig] = useState(false);
  const [alpacaConfig, setAlpacaConfig] = useState<AlpacaConfigResponse | null>(
    null,
  );
  const [orderSide, setOrderSide] = useState<AlpacaOrderSide>("buy");
  const [orderType, setOrderType] = useState<AlpacaOrderType>("market");
  const [timeInForce, setTimeInForce] = useState<AlpacaTimeInForce>("gtc");
  const [tradeSymbol, setTradeSymbol] = useState(() => {
    const base = (meta.symbol || "BTC").toUpperCase();
    return meta.assetType === "crypto" ? `${base}USD` : base;
  });
  const [quantity, setQuantity] = useState("1");
  const [limitPrice, setLimitPrice] = useState(() => {
    const p = meta.data?.current_price ?? 0;
    if (p <= 0) return "";
    return p >= 1 ? p.toFixed(2) : p.toFixed(6);
  });
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<AlpacaPlacedOrder | null>(
    null,
  );
  const detailSymbol = detail?.symbol;
  const detailPrice = detail?.current_price;

  useEffect(() => {
    if (showTradeWidget || !detailSymbol || detailPrice === undefined) return;
    setTradeSymbol(
      assetType === "crypto"
        ? `${detailSymbol.toUpperCase()}USD`
        : detailSymbol.toUpperCase(),
    );
    setQuantity(formatQtyFromNotional(detailPrice));
    setLimitPrice(
      detailPrice >= 1 ? detailPrice.toFixed(2) : detailPrice.toFixed(6),
    );
    setOrderSide("buy");
  }, [assetType, showTradeWidget, detailPrice, detailSymbol]);

  const changeRange = async (r: string) => {
    if (r === range || loadingRange) return;
    setRange(r);

    // For crypto, 1D and 1W are derived from cached 7D sparkline.
    const base = meta.data;
    if (assetType === "crypto" && base) {
      if (r === "1D") {
        // Last 24 hourly points from the 168-point 7D sparkline
        setLocalDetail({ ...base, prices: base.prices.slice(-24) });
        return;
      }
      if (r === "1W") {
        // All 168 points — fall back to original meta.data
        setLocalDetail(undefined);
        return;
      }
    }

    setLoadingRange(true);
    try {
      if (assetType === "crypto" && !meta.coinId) {
        throw new Error("coinId missing");
      }
      const res =
        assetType === "crypto"
          ? await fetch(`/api/coin-detail?coinId=${meta.coinId}&range=${r}`)
          : await fetch(
              `/api/equity-detail?symbol=${encodeURIComponent(
                detail?.symbol || meta.symbol,
              )}&range=${r}`,
            );
      if (!res.ok) throw new Error(`${res.status}`);
      const d: CoinDetail = await res.json();
      if (d.prices?.length) setLocalDetail(d);
    } catch {
      // Keep existing data on rate-limit / error — only range label updates
    } finally {
      setLoadingRange(false);
    }
  };

  const checkAlpacaConfig = useCallback(async () => {
    setCheckingConfig(true);
    setTradeError(null);
    try {
      const res = await fetch("/api/alpaca/config");
      const payload = (await res.json()) as AlpacaConfigResponse;
      setAlpacaConfig(payload);
      if (!res.ok) setAlpacaConfig({ configured: false });
    } catch {
      setAlpacaConfig({ configured: false });
    } finally {
      setCheckingConfig(false);
    }
  }, []);

  const toggleTradeWidget = async () => {
    if (showTradeWidget) {
      setShowTradeWidget(false);
      return;
    }
    setShowTradeWidget(true);
    setPlacedOrder(null);
    await checkAlpacaConfig();
  };

  const submitOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!alpacaConfig?.configured || submittingOrder) return;

    const qty = parseFloat(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setTradeError("Quantity must be a number greater than 0.");
      return;
    }

    const normalizedSymbol = tradeSymbol.trim().toUpperCase();
    if (!normalizedSymbol) {
      setTradeError("Symbol is required.");
      return;
    }

    let parsedLimitPrice: number | undefined;
    if (orderType === "limit") {
      parsedLimitPrice = parseFloat(limitPrice);
      if (!Number.isFinite(parsedLimitPrice) || parsedLimitPrice <= 0) {
        setTradeError("Limit price must be a number greater than 0.");
        return;
      }
    }

    setSubmittingOrder(true);
    setTradeError(null);
    setPlacedOrder(null);

    try {
      const res = await fetch("/api/alpaca/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: normalizedSymbol,
          side: orderSide,
          type: orderType,
          timeInForce,
          qty,
          limitPrice: parsedLimitPrice,
        }),
      });

      const payload = (await res.json()) as
        | { order?: AlpacaPlacedOrder; error?: string }
        | undefined;

      if (!res.ok) {
        throw new Error(payload?.error || `Order failed (${res.status}).`);
      }

      if (!payload?.order) {
        throw new Error("Order response was empty.");
      }

      setPlacedOrder(payload.order);
    } catch (err) {
      setTradeError("Order could not be placed. Please try again.");
    } finally {
      setSubmittingOrder(false);
    }
  };

  if (meta.loading || !detail) {
    return (
      <div className="bg-[#0a0a0a] border border-white/[0.07] rounded-xl p-6 flex items-center gap-3">
        <RefreshCw className="w-4 h-4 animate-spin text-zinc-500" />
        <span className="text-sm text-zinc-500">
          Loading {meta.name || meta.symbol} data…
        </span>
      </div>
    );
  }

  const pos = detail.price_change_percentage_24h >= 0;
  const chartData = detail.prices.map(([, price]) => price);
  const changeAbs = Math.abs(detail.price_change_24h);

  const stats = [
    { label: "Market Cap", value: fmtBig(detail.market_cap) },
    { label: "24H Volume", value: fmtBig(detail.total_volume) },
    { label: "24H High", value: fmt(detail.high_24h) },
    { label: "24H Low", value: fmt(detail.low_24h) },
    { label: "All-Time High", value: fmt(detail.ath) },
    { label: "All-Time Low", value: fmt(detail.atl) },
  ];

  return (
    <div className="bg-[#0a0a0a] border border-white/[0.07] rounded-xl overflow-hidden w-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            {detail.image && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={detail.image}
                alt={detail.name}
                className="w-7 h-7 rounded-full"
              />
            )}
            <div>
              <p className="text-base font-semibold text-white leading-tight">
                {detail.name} USD
              </p>
              <p className="text-sm text-zinc-500 uppercase tracking-wide">
                {detail.symbol} ·{" "}
                {assetType === "crypto" ? "CRYPTO" : "EQUITY / ETF"}
              </p>
            </div>
          </div>
          <a
            href="https://app.alpaca.markets"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/25 hover:border-emerald-500/50 transition-colors whitespace-nowrap shrink-0"
          >
            Open Alpaca
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>

        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-bold tabular-nums">
            {fmt(detail.current_price)}
          </span>
          <span
            className={`text-sm font-medium tabular-nums ${pos ? "text-emerald-400" : "text-red-400"}`}
          >
            {pos ? "+" : "-"}
            {fmt(changeAbs)}
          </span>
          <span
            className={`text-sm font-medium flex items-center gap-0.5 ${pos ? "text-emerald-400" : "text-red-400"}`}
          >
            {pos ? (
              <ArrowUpRight className="w-3.5 h-3.5" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5" />
            )}
            {Math.abs(detail.price_change_percentage_24h).toFixed(2)}%
          </span>
        </div>

        <p className="text-sm text-zinc-600 mt-1.5">
          {new Date(detail.last_updated).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZoneName: "short",
          })}
        </p>
      </div>

      {/* Range tabs */}
      <div className="flex border-b border-white/[0.05] px-3">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => changeRange(r)}
            className={`px-2.5 py-2 text-sm font-medium border-b-2 transition-colors ${
              range === r
                ? "border-white text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div
        className={
          loadingRange
            ? "opacity-40 pointer-events-none transition-opacity"
            : "transition-opacity"
        }
      >
        <CardSparkline data={chartData} positive={pos} height={120} />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-px bg-white/[0.04] border-t border-white/[0.05]">
        {stats.map(({ label, value }) => (
          <div key={label} className="bg-[#0a0a0a] px-3 py-2.5">
            <p className="text-sm text-zinc-600 mb-0.5">{label}</p>
            <p className="text-sm font-semibold text-zinc-200 tabular-nums">
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Source */}
      <div className="px-3 py-2 border-t border-white/5 flex items-center justify-between">
        <span className="text-sm text-zinc-700">
          Chart:{" "}
          {assetType === "crypto"
            ? range === "1D" || range === "1W"
              ? "7D sparkline (CoinGecko)"
              : "CoinGecko market chart"
            : "Yahoo Finance chart"}
        </span>
        <a
          href={
            assetType === "crypto"
              ? "https://www.coingecko.com"
              : `https://finance.yahoo.com/quote/${encodeURIComponent(
                  detail.symbol,
                )}`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 border border-white/8 text-sm text-zinc-400 hover:text-zinc-200 hover:border-white/16 transition-colors"
        >
          {assetType === "crypto" ? "CoinGecko" : "Yahoo Finance"}
          <ExternalLink className="w-2 h-2 opacity-60" />
        </a>
      </div>

      {/* Trade links — always visible, more prominent on buyIntent */}
      <div
        className={`${meta.buyIntent ? "border-emerald-500/20 bg-emerald-500/5" : "border-white/5"} border-t`}
      >
        <div className="px-3 py-2 flex items-center gap-2">
          <span className="text-sm text-zinc-500 mr-1">Trade on</span>
          <button
            type="button"
            onClick={() => {
              void toggleTradeWidget();
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-colors"
          >
            {showTradeWidget ? "Close Widget" : "In-App Widget"}
            {showTradeWidget ? (
              <ChevronUp className="w-2 h-2 opacity-70" />
            ) : (
              <ChevronDown className="w-2 h-2 opacity-70" />
            )}
          </button>
          <a
            href="https://app.alpaca.markets"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-400 hover:bg-yellow-500/20 hover:border-yellow-500/40 transition-colors"
          >
            Alpaca
            <ExternalLink className="w-2 h-2 opacity-60" />
          </a>
          <span className="text-[9px] text-zinc-700 ml-auto">
            DYOR · Not financial advice
          </span>
        </div>

        {showTradeWidget && (
          <div className="border-t border-white/5 px-3 py-3 space-y-2.5">
            {checkingConfig && (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Checking Alpaca credentials…
              </div>
            )}

            {!checkingConfig && !alpacaConfig?.configured && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                <p className="text-sm text-amber-300 font-medium">
                  Alpaca keys are not configured on the server.
                </p>
                <p className="text-sm text-zinc-300 mt-1">
                  Add `APCA_API_KEY_ID` and `APCA_API_SECRET_KEY` in
                  `false-markets/.env.local`, then restart `npm run dev`.
                </p>
              </div>
            )}

            {!checkingConfig && alpacaConfig?.configured && (
              <form onSubmit={submitOrder} className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm text-zinc-500 space-y-1">
                    Symbol
                    <input
                      value={tradeSymbol}
                      onChange={(e) =>
                        setTradeSymbol(e.target.value.toUpperCase())
                      }
                      className="w-full bg-[#000] border border-white/10 rounded-md px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-white/25"
                      placeholder="BTCUSD"
                    />
                  </label>
                  <label className="text-sm text-zinc-500 space-y-1">
                    Side
                    <select
                      value={orderSide}
                      onChange={(e) =>
                        setOrderSide(e.target.value as AlpacaOrderSide)
                      }
                      className="w-full bg-[#000] border border-white/10 rounded-md px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-white/25"
                    >
                      <option value="buy">Buy</option>
                      <option value="sell">Sell</option>
                    </select>
                  </label>
                  <label className="text-sm text-zinc-500 space-y-1">
                    Order Type
                    <select
                      value={orderType}
                      onChange={(e) =>
                        setOrderType(e.target.value as AlpacaOrderType)
                      }
                      className="w-full bg-[#000] border border-white/10 rounded-md px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-white/25"
                    >
                      <option value="market">Market</option>
                      <option value="limit">Limit</option>
                    </select>
                  </label>
                  <label className="text-sm text-zinc-500 space-y-1">
                    Time In Force
                    <select
                      value={timeInForce}
                      onChange={(e) =>
                        setTimeInForce(e.target.value as AlpacaTimeInForce)
                      }
                      className="w-full bg-[#000] border border-white/10 rounded-md px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-white/25"
                    >
                      <option value="gtc">GTC</option>
                      <option value="ioc">IOC</option>
                    </select>
                  </label>
                  <label className="text-sm text-zinc-500 space-y-1">
                    Quantity
                    <input
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      className="w-full bg-[#000] border border-white/10 rounded-md px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-white/25"
                      placeholder="0.01"
                    />
                  </label>
                  <label className="text-sm text-zinc-500 space-y-1">
                    Price (USD)
                    <input
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(e.target.value)}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      disabled={orderType !== "limit"}
                      className="w-full bg-[#000] border border-white/10 rounded-md px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-white/25 disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder={detail.current_price.toString()}
                    />
                  </label>
                </div>
                <p className="text-sm text-zinc-600">
                  Quantity auto-sizes to about ${DEFAULT_POSITION_NOTIONAL}{" "}
                  notional.
                </p>

                {tradeError && (
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-sm text-red-300">
                    {tradeError}
                  </div>
                )}

                {placedOrder && (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-sm text-emerald-300 space-y-0.5">
                    <p>
                      Order submitted:{" "}
                      <span className="font-semibold">
                        {placedOrder.symbol}
                      </span>
                    </p>
                    <p>
                      {placedOrder.side.toUpperCase()} {placedOrder.qty} ·{" "}
                      {placedOrder.type.toUpperCase()} ·{" "}
                      {placedOrder.time_in_force.toUpperCase()} · Status{" "}
                      {placedOrder.status.toUpperCase()}
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submittingOrder}
                  className="w-full rounded-md bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm font-semibold py-2 hover:bg-emerald-500/30 hover:border-emerald-500/45 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingOrder
                    ? "Submitting Order..."
                    : `Place ${orderSide.toUpperCase()} Order`}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PortfolioCard({ data }: { data: PortfolioData }) {
  const s = data.summary;
  const dayPos = s.day_pnl >= 0;
  const unrlPos = s.unrealized_pnl_total >= 0;

  const chip = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

  return (
    <div className="bg-[#0a0a0a] border border-white/[0.07] rounded-xl overflow-hidden w-full">
      <div className="px-4 py-3 border-b border-white/[0.05]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-base font-semibold text-white leading-tight">
              Portfolio Snapshot
            </p>
            <p className="text-sm text-zinc-500">
              {new Date(data.fetched_at).toLocaleString("en-US")}
            </p>
          </div>
          <span className="text-sm text-zinc-500">
            {data.account.status || "active"} · {data.account.currency || "USD"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.04]">
        <div className="bg-[#0a0a0a] px-3 py-2.5">
          <p className="text-sm text-zinc-600">Equity</p>
          <p className="text-[12px] font-semibold text-zinc-200 tabular-nums">
            {fmtBig(s.equity)}
          </p>
        </div>
        <div className="bg-[#0a0a0a] px-3 py-2.5">
          <p className="text-sm text-zinc-600">Cash</p>
          <p className="text-[12px] font-semibold text-zinc-200 tabular-nums">
            {fmtBig(s.cash)}
          </p>
        </div>
        <div className="bg-[#0a0a0a] px-3 py-2.5">
          <p className="text-sm text-zinc-600">Day P/L</p>
          <p
            className={`text-[12px] font-semibold tabular-nums ${
              dayPos ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {dayPos ? "+" : ""}
            {fmtBig(s.day_pnl)} ({chip(s.day_pnl_pct)})
          </p>
        </div>
        <div className="bg-[#0a0a0a] px-3 py-2.5">
          <p className="text-sm text-zinc-600">Unrealized P/L</p>
          <p
            className={`text-[12px] font-semibold tabular-nums ${
              unrlPos ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {unrlPos ? "+" : ""}
            {fmtBig(s.unrealized_pnl_total)} ({chip(s.unrealized_pnl_pct)})
          </p>
        </div>
      </div>

      <div className="px-3 py-2 border-t border-white/5">
        <p className="text-sm text-zinc-600 mb-1.5">
          Positions ({s.positions_count})
        </p>
        {data.positions.length === 0 ? (
          <p className="text-sm text-zinc-500">No open positions.</p>
        ) : (
          <div className="space-y-1.5">
            {data.positions.slice(0, 8).map((p) => {
              const pl = Number(p.unrealized_pl);
              const pos = pl >= 0;
              return (
                <div
                  key={`${p.symbol}-${p.side}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-white/8 bg-white/[0.02] px-2 py-1.5"
                >
                  <div>
                    <p className="text-sm text-zinc-200 font-semibold">
                      {p.symbol}
                    </p>
                    <p className="text-sm text-zinc-500">
                      Qty {p.qty} · Avg $
                      {Number(p.avg_entry_price || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-zinc-500">
                      MV {fmtBig(Number(p.market_value || 0))}
                    </p>
                    <p
                      className={`text-sm font-semibold ${
                        pos ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {pos ? "+" : ""}
                      {fmtBig(pl)} ({chip(p.unrealized_plpc)})
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/[0.04] border-t border-white/5">
        <div className="bg-[#0a0a0a] px-3 py-2.5">
          <p className="text-sm text-zinc-600 mb-1">Pending Orders</p>
          <p className="text-[12px] font-semibold text-zinc-200">
            {s.pending_orders_count}
          </p>
        </div>
        <div className="bg-[#0a0a0a] px-3 py-2.5">
          <p className="text-sm text-zinc-600 mb-1">Partially Filled</p>
          <p className="text-[12px] font-semibold text-zinc-200">
            {s.partially_filled_orders_count}
          </p>
        </div>
        <div className="bg-[#0a0a0a] px-3 py-2.5">
          <p className="text-sm text-zinc-600 mb-1">Filled (Recent)</p>
          <p className="text-[12px] font-semibold text-zinc-200">
            {s.filled_orders_count}
          </p>
        </div>
      </div>
    </div>
  );
}

function PortfolioStatTile({
  label,
  value,
  tone = "neutral",
  detail,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
  detail?: string;
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
        ? "text-red-400"
        : "text-zinc-100";

  return (
    <div className="border border-white/[0.07] bg-[#0a0a0a] px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>
      <p className={`mt-2 text-[20px] font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
      {detail && <p className="mt-1 text-[12px] text-zinc-500">{detail}</p>}
    </div>
  );
}

function PortfolioPositionsTable({ positions }: { positions: PortfolioPosition[] }) {
  return (
    <div className="overflow-hidden border-y border-white/[0.07] bg-[#0a0a0a]">
      <div className="grid grid-cols-[1.1fr_0.75fr_0.9fr_0.95fr_0.95fr_1fr_0.85fr] gap-4 border-b border-white/[0.06] px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
        <span>Asset</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Avg Entry</span>
        <span className="text-right">Market Value</span>
        <span className="text-right">Cost Basis</span>
        <span className="text-right">Unrealized P/L</span>
        <span className="text-right">Alloc</span>
      </div>

      {positions.length === 0 ? (
        <div className="px-4 py-10 text-sm text-zinc-500">No open positions.</div>
      ) : (
        positions.map((position) => {
          const unrealized = Number(position.unrealized_pl || 0);
          const positive = unrealized >= 0;

          return (
            <div
              key={`${position.symbol}-${position.side}`}
              className="grid grid-cols-[1.1fr_0.75fr_0.9fr_0.95fr_0.95fr_1fr_0.85fr] gap-4 border-b border-white/[0.06] px-4 py-3 text-[13px] last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-100">
                  {position.symbol}
                </p>
                <p className="truncate text-[12px] uppercase tracking-[0.12em] text-zinc-500">
                  {position.side}
                </p>
              </div>
              <span className="text-right tabular-nums text-zinc-300">
                {position.qty}
              </span>
              <span className="text-right tabular-nums text-zinc-300">
                {fmt(Number(position.avg_entry_price || 0))}
              </span>
              <span className="text-right tabular-nums text-zinc-300">
                {fmtBig(Number(position.market_value || 0))}
              </span>
              <span className="text-right tabular-nums text-zinc-300">
                {fmtBig(Number(position.cost_basis || 0))}
              </span>
              <div className="text-right">
                <p
                  className={`font-medium tabular-nums ${
                    positive ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {positive ? "+" : ""}
                  {fmtBig(unrealized)}
                </p>
                <p
                  className={`text-[12px] tabular-nums ${
                    positive ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {position.unrealized_plpc >= 0 ? "+" : ""}
                  {position.unrealized_plpc.toFixed(2)}%
                </p>
              </div>
              <span className="text-right tabular-nums text-zinc-400">
                {position.allocation_pct.toFixed(1)}%
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

function PortfolioOrdersTable({
  title,
  orders,
  emptyLabel,
}: {
  title: string;
  orders: PortfolioOrder[];
  emptyLabel: string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
        <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">
          {orders.length} total
        </span>
      </div>
      <div className="overflow-hidden border-y border-white/[0.07] bg-[#0a0a0a]">
        <div className="grid grid-cols-[0.9fr_0.75fr_0.75fr_0.9fr_0.75fr_0.8fr_1fr] gap-4 border-b border-white/[0.06] px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
          <span>Symbol</span>
          <span>Side</span>
          <span>Type</span>
          <span>Status</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Filled</span>
          <span className="text-right">Submitted</span>
        </div>

        {orders.length === 0 ? (
          <div className="px-4 py-8 text-sm text-zinc-500">{emptyLabel}</div>
        ) : (
          orders.map((order) => (
            <div
              key={order.id}
              className="grid grid-cols-[0.9fr_0.75fr_0.75fr_0.9fr_0.75fr_0.8fr_1fr] gap-4 border-b border-white/[0.06] px-4 py-3 text-[13px] last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-100">
                  {order.symbol}
                </p>
                <p className="truncate text-[12px] uppercase tracking-[0.12em] text-zinc-500">
                  {order.time_in_force}
                </p>
              </div>
              <span
                className={`uppercase ${
                  order.side === "buy" ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {order.side}
              </span>
              <span className="uppercase text-zinc-300">{order.type}</span>
              <span className="uppercase text-zinc-400">{order.status}</span>
              <span className="text-right tabular-nums text-zinc-300">
                {order.qty}
              </span>
              <span className="text-right tabular-nums text-zinc-300">
                {order.filled_qty}
              </span>
              <span className="text-right text-zinc-500">
                {order.submitted_at
                  ? new Date(order.submitted_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "--"}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// ─── Donut for dominance ──────────────────────────────────────────────────────

function DominanceDonut({ btc, eth }: { btc: number; eth: number }) {
  const other = Math.max(0, 100 - btc - eth);
  const options = {
    chart: {
      type: "donut" as const,
      background: "transparent",
      animations: { enabled: false },
    },
    colors: ["#f97316", "#818cf8", "#52525b"],
    labels: ["BTC", "ETH", "Others"],
    legend: { show: false },
    dataLabels: { enabled: false },
    plotOptions: {
      pie: {
        donut: {
          size: "68%",
          labels: {
            show: true,
            total: {
              show: true,
              label: "BTC",
              color: "#f97316",
              fontSize: "11px",
              formatter: () => `${btc.toFixed(1)}%`,
            },
          },
        },
      },
    },
    tooltip: { enabled: false },
    stroke: { width: 0 },
  };

  return (
    <ReactApexChart
      type="donut"
      series={[btc, eth, other]}
      options={options}
      width={100}
      height={100}
    />
  );
}

// ─── Volume Bar chart ─────────────────────────────────────────────────────────

function VolumeBar({ coins }: { coins: CoinData[] }) {
  const top5 = coins.slice(0, 5);
  const options = {
    chart: {
      type: "bar" as const,
      background: "transparent",
      toolbar: { show: false },
      animations: { enabled: false },
      sparkline: { enabled: true },
    },
    colors: ["#3b82f6"],
    plotOptions: {
      bar: { borderRadius: 3, columnWidth: "55%" },
    },
    dataLabels: { enabled: false },
    tooltip: { enabled: false },
    xaxis: {
      categories: top5.map((c) => c.symbol.toUpperCase()),
      labels: { show: false },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { show: false },
    grid: { show: false },
  };

  return (
    <ReactApexChart
      type="bar"
      series={[{ data: top5.map((c) => c.total_volume) }]}
      options={options}
      width={120}
      height={50}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CryptoDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const [coins, setCoins] = useState<CoinData[]>([]);
  const [globalData, setGlobalData] = useState<GlobalData | null>(null);
  const [predictions, setPredictions] = useState<PredictionMarket[]>([]);
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [dashboardUpdatedAt, setDashboardUpdatedAt] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [predictionSearch, setPredictionSearch] = useState("");
  const [watchlistNews, setWatchlistNews] = useState<NewsItem[]>([]);
  const [watchlistNewsLoading, setWatchlistNewsLoading] = useState(false);
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [portfolioRouteLoading, setPortfolioRouteLoading] = useState(false);
  const [portfolioRouteError, setPortfolioRouteError] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<"gainers" | "losers">("gainers");
  const [marketLeadersTab, setMarketLeadersTab] = useState<"up" | "down">("up");
  const [marketLeadersPage, setMarketLeadersPage] = useState(0);
  const [highVolumePage, setHighVolumePage] = useState(0);
  const [showTradingModal, setShowTradingModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const homeSectionRef = useRef<HTMLDivElement>(null);
  const predictionsSectionRef = useRef<HTMLElement>(null);
  const deferredPredictionSearch = useDeferredValue(predictionSearch);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      if (pathname === "/predictions") {
        const predRes = await fetch("/api/prediction?mode=grid&limit=90");
        const pred = await predRes.json();

        if (Array.isArray(pred)) setPredictions(pred);
      } else if (pathname === "/portfolio") {
        setDashboardUpdatedAt(Date.now());
      } else {
        const [marketsRes, globalRes, predRes, sentRes] = await Promise.all([
          fetch(
            "/api/crypto?endpoint=coins/markets&vs_currency=usd&order=market_cap_desc&per_page=30&page=1&sparkline=true&price_change_percentage=1h,24h,7d",
          ),
          fetch("/api/crypto?endpoint=global"),
          fetch("/api/prediction"),
          fetch("/api/sentiment"),
        ]);

        const [markets, global, pred, sent] = await Promise.all([
          marketsRes.json(),
          globalRes.json(),
          predRes.json(),
          sentRes.json(),
        ]);

        if (Array.isArray(markets)) setCoins(markets);
        if (global?.data) setGlobalData(global.data);
        if (Array.isArray(pred)) setPredictions(pred);
        if (sent?.tone) setSentiment(sent);
      }

      if (pathname !== "/portfolio") {
        setDashboardUpdatedAt(Date.now());
      }
    } catch (e) {
      console.error("Data fetch error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [pathname]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => fetchData(true), 60_000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const fetchPortfolioRouteData = useCallback(async (silent = false) => {
    if (pathname !== "/portfolio") return;

    if (!silent) setPortfolioRouteLoading(true);
    setPortfolioRouteError(null);

    try {
      const response = await fetch("/api/alpaca/portfolio");
      const payload = (await response.json()) as PortfolioData & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load portfolio.");
      }

      setPortfolioData(payload);
    } catch (err) {
      setPortfolioData(null);
      setPortfolioRouteError(
        err instanceof Error ? err.message : "Failed to load portfolio.",
      );
    } finally {
      setPortfolioRouteLoading(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/portfolio") return;

    void fetchPortfolioRouteData();
    const timer = setInterval(() => {
      void fetchPortfolioRouteData(true);
    }, 60_000);

    return () => clearInterval(timer);
  }, [fetchPortfolioRouteData, pathname]);

  useEffect(() => {
    if (showChat) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showChat]);

  const updateMessage = useCallback(
    (messageId: string, updater: (prev: ChatMessage) => ChatMessage) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? updater(msg) : msg)),
      );
    },
    [],
  );

  const enrichAssistantMessage = useCallback(
    async ({
      messageId,
      userText,
      coinName,
      coinSymbol,
    }: {
      messageId: string;
      userText: string;
      coinName?: string;
      coinSymbol?: string;
    }) => {
      const newsQuery = coinName || coinSymbol || userText;

      updateMessage(messageId, (prev) => ({ ...prev, newsLoading: true }));

      try {
        const res = await fetch(`/api/news?q=${encodeURIComponent(newsQuery)}`);
        const payload = (await res.json()) as {
          items?: NewsItem[];
          followUps?: string[];
        };

        updateMessage(messageId, (prev) => ({
          ...prev,
          newsLoading: false,
          news: payload.items ?? [],
          followUps: payload.followUps ?? [],
        }));
      } catch {
        updateMessage(messageId, (prev) => ({ ...prev, newsLoading: false }));
      }
    },
    [updateMessage],
  );

  const sendPrompt = useCallback(
    async (rawPrompt: string) => {
      const text = rawPrompt.trim();
      if (!text || streaming) return;
      const latestPortfolio = [...messages]
        .reverse()
        .find((m) => m.portfolio)?.portfolio;
      const portfolioContext = buildPortfolioContext(latestPortfolio);
      const newsContext = buildNewsContext(messages);

      setQuery("");
      setShowChat(true);
      setStreaming(true);

      const userId = makeMessageId();
      const assistantId = makeMessageId();

      setMessages((prev) => [
        ...prev,
        { id: userId, role: "user", content: text },
        { id: assistantId, role: "assistant", content: "" },
      ]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            portfolioContext,
            newsContext,
          }),
        });
        if (!res.body) throw new Error("No body");

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let accumulated = "";
        let cardMode: "asset" | "portfolio" | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value);
          accumulated += chunk;

          if (
            accumulated.startsWith("__ASSET_CARD__") ||
            accumulated.startsWith("__COIN_CARD__")
          ) {
            if (!cardMode) {
              cardMode = "asset";
              updateMessage(assistantId, (prev) => ({
                ...prev,
                role: "assistant",
                content: "__ASSET_CARD__",
                coinCard: {
                  assetType: "crypto",
                  coinId: undefined,
                  symbol: "",
                  name: "",
                  range: "1D",
                  loading: true,
                },
              }));
            }
          } else if (accumulated.startsWith("__PORTFOLIO_CARD__")) {
            if (!cardMode) {
              cardMode = "portfolio";
              updateMessage(assistantId, (prev) => ({
                ...prev,
                role: "assistant",
                content: "__PORTFOLIO_CARD__",
                portfolio: undefined,
                portfolioLoading: true,
              }));
            }
          } else if (!accumulated.startsWith("_")) {
            updateMessage(assistantId, (prev) => ({
              ...prev,
              role: "assistant",
              content: accumulated,
            }));
          }
        }

        if (cardMode === "asset") {
          try {
            const match = accumulated.match(
              /__(?:ASSET|COIN)_CARD__\s*(\{[^}]+\})\s*([\s\S]*)/,
            );
            if (!match) throw new Error("No JSON found in asset card response");

            const parsed = JSON.parse(match[1]) as {
              assetType?: "crypto" | "equity";
              coinId?: string;
              symbol: string;
              name: string;
              buyIntent?: boolean;
            };
            const assetType =
              parsed.assetType === "equity" ? "equity" : "crypto";
            const commentary = match[2].trim();
            const symbol = (parsed.symbol || "").trim().toUpperCase();
            const name = (parsed.name || "").trim() || symbol;
            const buyIntent = parsed.buyIntent;

            let detail: CoinDetail;
            let coinId = parsed.coinId;

            if (assetType === "crypto") {
              const cached = coins.find(
                (c) =>
                  c.id === coinId ||
                  c.symbol.toUpperCase() === symbol ||
                  c.name.toLowerCase() === name.toLowerCase(),
              );

              if (cached) {
                const sparkline = cached.sparkline_in_7d?.price ?? [];
                const now = Date.now();
                const step =
                  sparkline.length > 1
                    ? (7 * 24 * 3600 * 1000) / (sparkline.length - 1)
                    : 3600 * 1000;
                detail = {
                  id: cached.id,
                  name: cached.name,
                  symbol: cached.symbol.toUpperCase(),
                  image: cached.image,
                  current_price: cached.current_price,
                  price_change_24h: cached.price_change_24h,
                  price_change_percentage_24h:
                    cached.price_change_percentage_24h,
                  market_cap: cached.market_cap,
                  total_volume: cached.total_volume,
                  high_24h: cached.high_24h,
                  low_24h: cached.low_24h,
                  ath: 0,
                  atl: 0,
                  last_updated: new Date().toISOString(),
                  prices: sparkline.map(
                    (p, i) =>
                      [now - (sparkline.length - 1 - i) * step, p] as [
                        number,
                        number,
                      ],
                  ),
                  asset_type: "crypto",
                };
                coinId = cached.id;
              } else {
                const resolvedCoinId = coinId || symbol.toLowerCase();
                const detailRes = await fetch(
                  `/api/coin-detail?coinId=${encodeURIComponent(resolvedCoinId)}`,
                );
                if (!detailRes.ok)
                  throw new Error("Failed to load crypto detail");
                detail = (await detailRes.json()) as CoinDetail;
                coinId = detail.id || resolvedCoinId;
              }
            } else {
              const detailRes = await fetch(
                `/api/equity-detail?symbol=${encodeURIComponent(symbol)}`,
              );
              detail = (await detailRes.json()) as CoinDetail;
              if (!detailRes.ok)
                throw new Error("Failed to load equity detail");
            }

            updateMessage(assistantId, (prev) => ({
              ...prev,
              role: "assistant",
              content: commentary || "__ASSET_CARD__",
              coinCard: {
                assetType,
                coinId,
                symbol,
                name,
                range: "1W",
                loading: false,
                data: detail,
                buyIntent,
              },
            }));

            void enrichAssistantMessage({
              messageId: assistantId,
              userText: text,
              coinName: name,
              coinSymbol: symbol,
            });
          } catch {
            updateMessage(assistantId, (prev) => ({
              ...prev,
              role: "assistant",
              content: "Could not load coin data. Please try again.",
            }));
          }
        } else if (cardMode === "portfolio") {
          try {
            const match = accumulated.match(
              /__PORTFOLIO_CARD__\s*(\{[^}]*\})?\s*([\s\S]*)/,
            );
            const commentary = match?.[2]?.trim() || "";

            const portfolioRes = await fetch("/api/alpaca/portfolio");
            if (!portfolioRes.ok) {
              throw new Error("Failed to load portfolio.");
            }
            const portfolioData = (await portfolioRes.json()) as PortfolioData;

            updateMessage(assistantId, (prev) => ({
              ...prev,
              role: "assistant",
              content: commentary || "__PORTFOLIO_CARD__",
              portfolio: portfolioData,
              portfolioLoading: false,
            }));

            const firstSymbol = portfolioData.positions?.[0]?.symbol;
            void enrichAssistantMessage({
              messageId: assistantId,
              userText: text,
              coinSymbol: firstSymbol,
            });
          } catch {
            updateMessage(assistantId, (prev) => ({
              ...prev,
              role: "assistant",
              content:
                "I couldn't load your portfolio right now. Please try again.",
              portfolioLoading: false,
            }));
          }
        } else {
          void enrichAssistantMessage({
            messageId: assistantId,
            userText: text,
          });
        }
      } catch {
        updateMessage(assistantId, (prev) => ({
          ...prev,
          role: "assistant",
          content: "Sorry, I couldn't process your request. Please try again.",
        }));
      } finally {
        setStreaming(false);
      }
    },
    [coins, enrichAssistantMessage, messages, streaming, updateMessage],
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/chat?q=${encodeURIComponent(query.trim())}`);
    }
  };

  useEffect(() => {
    if (loading) return;

    if (pathname === "/predictions") {
      predictionsSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }

    if (pathname === "/" || pathname === "/watchlist" || pathname === "/portfolio") {
      homeSectionRef.current?.scrollIntoView({ block: "start" });
    }
  }, [loading, pathname]);

  useEffect(() => {
    setMarketLeadersPage(0);
  }, [marketLeadersTab]);

  useEffect(() => {
    setHighVolumePage(0);
  }, [coins]);

  const gainers = coins
    .sort(
      (a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h,
    )
    .slice(0, 5);

  const losers = coins
    .sort(
      (a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h,
    )
    .slice(0, 5);

  const marketOverviewCoins = [
    ...["bitcoin", "solana"]
      .map((priorityId) => coins.find((coin) => coin.id === priorityId))
      .filter((coin): coin is CoinData => Boolean(coin)),
    ...coins.filter((coin) => coin.id !== "bitcoin" && coin.id !== "solana"),
  ].slice(0, 10);
  const prioritizedDiscussionMarkets = [...predictions].sort((a, b) => {
    const score = (question?: string) => {
      const normalized = normalizeDiscussionQuestion(question);
      if (normalized === "What price will Bitcoin hit in 2026?") return 0;
      if (normalized === "MicroStrategy sells any Bitcoin by ___ ?") return 1;
      return 2;
    };

    return score(a.question) - score(b.question);
  });
  const filteredPredictionMarkets = prioritizedDiscussionMarkets.filter((market) => {
    const needle = deferredPredictionSearch.trim().toLowerCase();
    if (!needle) return true;

    const haystacks = [
      market.question ?? "",
      ...(market.discussionOptions?.map((option) => option.label) ?? []),
    ].join(" ").toLowerCase();

    return haystacks.includes(needle);
  });
  const topDiscussionMarkets = prioritizedDiscussionMarkets.slice(0, 2);
  const bitcoin = coins.find((coin) => coin.id === "bitcoin");
  const ethereum = coins.find((coin) => coin.id === "ethereum");
  const solana = coins.find((coin) => coin.id === "solana");
  const watchlistAssetIds = [
    "bitcoin",
    "ethereum",
    "solana",
    "ripple",
    "dogecoin",
    "chainlink",
  ];
  const watchlistCoins = watchlistAssetIds
    .map((assetId) => coins.find((coin) => coin.id === assetId))
    .filter((coin): coin is CoinData => Boolean(coin));
  const get1hChange = (coin: CoinData) =>
    coin.price_change_percentage_1h_in_currency ?? 0;
  const get7dChange = (coin: CoinData) => {
    if (Number.isFinite(coin.price_change_percentage_7d_in_currency)) {
      return coin.price_change_percentage_7d_in_currency ?? 0;
    }

    const sparkline = coin.sparkline_in_7d?.price;
    if (!sparkline || sparkline.length < 2) return 0;

    const first = sparkline[0];
    const last = sparkline[sparkline.length - 1];
    if (!first) return 0;

    return ((last - first) / first) * 100;
  };
  const getVolumeAdvMultiple = (coin: CoinData) =>
    coin.market_cap > 0 ? coin.total_volume / coin.market_cap : 0;
  const getMomentumScore = (coin: CoinData) => {
    const oneHour = get1hChange(coin);
    const oneDay = coin.price_change_percentage_24h ?? 0;
    const sevenDay = get7dChange(coin);
    const normalized = oneHour * 0.5 + oneDay * 0.3 + sevenDay * 0.2;
    return Math.max(0.1, Math.min(1, (normalized + 20) / 40));
  };
  const surgingUpCoins = [...coins]
    .sort((a, b) => get1hChange(b) - get1hChange(a))
    .slice(0, 27);
  const surgingDownCoins = [...coins]
    .sort((a, b) => get1hChange(a) - get1hChange(b))
    .slice(0, 27);
  const highVolumeCoins = [...coins]
    .sort((a, b) => b.total_volume - a.total_volume)
    .slice(0, 27);
  const marketLeaders = marketLeadersTab === "up" ? surgingUpCoins : surgingDownCoins;
  const marketLeadersPageSize = 10;
  const marketLeadersPageCount = Math.max(
    1,
    Math.ceil(marketLeaders.length / marketLeadersPageSize),
  );
  const clampedMarketLeadersPage = Math.min(
    marketLeadersPage,
    marketLeadersPageCount - 1,
  );
  const marketLeaderRows = marketLeaders.slice(
    clampedMarketLeadersPage * marketLeadersPageSize,
    (clampedMarketLeadersPage + 1) * marketLeadersPageSize,
  );
  const highVolumePageCount = Math.max(
    1,
    Math.ceil(highVolumeCoins.length / marketLeadersPageSize),
  );
  const clampedHighVolumePage = Math.min(
    highVolumePage,
    highVolumePageCount - 1,
  );
  const highVolumeRows = highVolumeCoins.slice(
    clampedHighVolumePage * marketLeadersPageSize,
    (clampedHighVolumePage + 1) * marketLeadersPageSize,
  );
  const watchlistMovers = [...watchlistCoins].sort(
    (a, b) =>
      Math.abs(b.price_change_percentage_24h) -
      Math.abs(a.price_change_percentage_24h),
  );
  const notablePriceMovers = watchlistMovers.slice(0, 3);
  const watchlistNewsQuery = watchlistCoins
    .map((coin) => coin.name)
    .slice(0, 5)
    .join(" OR ");

  useEffect(() => {
    if (pathname !== "/watchlist" || !watchlistNewsQuery) {
      setWatchlistNews([]);
      setWatchlistNewsLoading(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setWatchlistNewsLoading(true);

      try {
        const response = await fetch(
          `/api/news?q=${encodeURIComponent(watchlistNewsQuery)}`,
        );
        const payload = (await response.json()) as { items?: NewsItem[] };

        if (!cancelled) {
          setWatchlistNews(payload.items ?? []);
        }
      } catch {
        if (!cancelled) {
          setWatchlistNews([]);
        }
      } finally {
        if (!cancelled) {
          setWatchlistNewsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [pathname, watchlistNewsQuery]);

  const movers = activeTab === "gainers" ? gainers : losers;
  const moverRows = movers;
  const sentimentDisplayLabel = sentiment?.label.replace(/\s+Sentiment$/i, "") ?? "";
  const sentimentColor =
    sentiment?.tone === "bullish"
      ? "text-emerald-400"
      : sentiment?.tone === "bearish"
        ? "text-red-400"
        : "text-amber-300";
  const sentimentBarColor =
    sentiment?.tone === "bullish"
      ? "bg-emerald-400"
      : sentiment?.tone === "bearish"
        ? "bg-red-500"
        : "bg-amber-300";
  const sentimentBars = Array.from({ length: 8 }, (_, index) => {
    const activeBars = sentiment
      ? Math.max(1, Math.min(8, Math.round(sentiment.value / 12.5)))
      : 0;

    return index < activeBars;
  });
  const marketSummarySources = [
    {
      label: "CoinGecko",
      icon: "https://www.google.com/s2/favicons?domain=coingecko.com&sz=32",
    },
    {
      label: "Polymarket",
      icon: "https://www.google.com/s2/favicons?domain=polymarket.com&sz=32",
    },
    {
      label: "Alternative.me",
      icon: "https://www.google.com/s2/favicons?domain=alternative.me&sz=32",
    },
  ] as const;
  const marketSummaryItems: MarketSummaryItem[] = [
    bitcoin && {
      id: "bitcoin",
      title: `Bitcoin ${
        bitcoin.price_change_percentage_24h >= 0 ? "pushes higher" : "pulls back"
      } ${Math.abs(bitcoin.price_change_percentage_24h).toFixed(2)}% in 24 hours`,
      body: `Bitcoin is trading around ${fmt(bitcoin.current_price)} after moving between ${fmt(
        bitcoin.low_24h,
      )} and ${fmt(bitcoin.high_24h)} over the last 24 hours. Spot turnover remains active at ${fmtBig(
        bitcoin.total_volume,
      )}, while its market cap stands near ${fmtBig(bitcoin.market_cap)}.`,
    },
    ethereum && {
      id: "ethereum",
      title: `Ethereum ${
        ethereum.price_change_percentage_24h >= 0 ? "outperforms" : "lags"
      } with a ${Math.abs(ethereum.price_change_percentage_24h).toFixed(2)}% move`,
      body: `Ethereum is changing hands near ${fmt(
        ethereum.current_price,
      )}, with daily volume around ${fmtBig(ethereum.total_volume)}. Traders are watching whether ETH can hold above ${fmt(
        ethereum.low_24h,
      )} after topping out near ${fmt(ethereum.high_24h)} intraday.`,
    },
    globalData && {
      id: "global",
      title: `Crypto market cap sits near ${fmtBig(
        globalData.total_market_cap.usd,
      )} with ${pct(globalData.market_cap_change_percentage_24h_usd)} daily change`,
      body: `Total crypto volume is running near ${fmtBig(
        globalData.total_volume.usd,
      )} across the market. Bitcoin dominance is ${globalData.market_cap_percentage.btc.toFixed(
        1,
      )}% and Ethereum dominance is ${globalData.market_cap_percentage.eth.toFixed(
        1,
      )}%, showing where broad market conviction is concentrating.`,
    },
    gainers[0] && {
      id: "gainer",
      title: `${gainers[0].name} leads the tape with a ${Math.abs(
        gainers[0].price_change_percentage_24h,
      ).toFixed(2)}% gain`,
      body: `${gainers[0].name} (${gainers[0].symbol.toUpperCase()}) is trading near ${fmt(
        gainers[0].current_price,
      )} after adding ${fmt(
        Math.abs(gainers[0].price_change_24h),
      )} over the session. Daily volume is ${fmtBig(
        gainers[0].total_volume,
      )}, making it the strongest momentum name on the dashboard right now.`,
    },
    losers[0] && {
      id: "loser",
      title: `${losers[0].name} is the weakest mover, down ${Math.abs(
        losers[0].price_change_percentage_24h,
      ).toFixed(2)}%`,
      body: `${losers[0].name} (${losers[0].symbol.toUpperCase()}) has slipped to ${fmt(
        losers[0].current_price,
      )} after trading as high as ${fmt(losers[0].high_24h)}. Even with pressure building, turnover remains elevated near ${fmtBig(
        losers[0].total_volume,
      )}.`,
    },
    (sentiment || solana) && {
      id: "sentiment",
      title: sentiment
        ? `${sentimentDisplayLabel} sentiment is shaping short-term crypto risk appetite`
        : `Solana remains one of the market's highest-beta large-cap trades`,
      body: sentiment
        ? `The current sentiment gauge reads ${sentiment.value}/100 and is classified as ${sentiment.classification.toLowerCase()}. ${
            solana
              ? `Solana is trading near ${fmt(solana.current_price)} with a 24-hour move of ${pct(
                  solana.price_change_percentage_24h,
                )}, making it a useful read-through for risk-on positioning.`
              : "Traders are still favoring headlines and macro catalysts over quiet consolidation."
          }`
        : solana
          ? `Solana is trading near ${fmt(
              solana.current_price,
            )} after moving ${pct(
              solana.price_change_percentage_24h,
            )} on the day. With ${fmtBig(
              solana.total_volume,
            )} in 24-hour volume, it remains one of the most watched momentum assets on the board.`
          : "",
    },
  ].filter((item): item is MarketSummaryItem => Boolean(item));

  // ── Skeleton ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-500">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading market data…</span>
        </div>
      </div>
    );
  }

  const navTabs = [
    { label: "Home", href: "/" },
    { label: "Predictions", href: "/predictions" },
    { label: "Watchlist", href: "/watchlist" },
    { label: "Portfolio", href: "/portfolio" },
  ] as const;

  return (
    <div className="min-h-screen bg-[#000000] text-white">
      <style>{`
        @keyframes eqBar {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1); }
        }
      `}</style>

      <div className="flex min-h-screen">
        <aside className="sticky top-0 relative flex h-screen w-[62px] shrink-0 flex-col items-center justify-between overflow-hidden bg-[#050505] px-2 py-5 md:w-[72px] md:px-3">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/[0.08]" />
          <div className="pointer-events-none absolute inset-y-8 right-0 w-6 bg-gradient-to-l from-white/[0.06] via-white/[0.02] to-transparent blur-md" />
          <div className="pointer-events-none absolute inset-y-0 right-[10px] w-px bg-white/[0.04] md:right-[12px]" />

          <Link
            href="/"
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.02] transition-colors hover:border-white/[0.16] hover:bg-white/[0.04]"
            aria-label="Go to home"
          >
            <Image
              src="/logo.svg"
              alt="TrueMarkets"
              width={18}
              height={20}
              priority
              className="h-5 w-auto"
            />
          </Link>

          <button
            type="button"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.12] text-zinc-400 transition-colors hover:border-white/[0.2] hover:text-white"
            aria-label="Profile"
          >
            <CircleUserRound className="h-6 w-6" />
          </button>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-50 relative overflow-hidden bg-[#000000]/95 shadow-[0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-sm">
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/[0.08]" />
            <div className="pointer-events-none absolute inset-x-0 bottom-[1px] h-px bg-white/[0.03]" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),rgba(255,255,255,0.035)_24%,transparent_70%)] opacity-70 blur-md" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-white/[0.045] via-white/[0.012] to-transparent" />
            <div className="pointer-events-none absolute bottom-0 left-1/2 h-px w-[38%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/[0.3] to-transparent opacity-80" />
            <div className="mx-auto flex max-w-[1480px] flex-col gap-3 px-4 py-3 md:px-6 xl:px-8 2xl:px-10 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-5 md:gap-7">
                {navTabs.map((tab) => {
                  const isActive = pathname === tab.href;

                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      className={`border-b-2 pb-1 text-[15px] font-semibold transition-colors ${
                        isActive
                          ? "border-white text-white"
                          : "border-transparent text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {tab.label}
                    </Link>
                  );
                })}
              </div>

              <form onSubmit={handleSearch} className="w-full lg:max-w-[560px]">
                <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#0d0d10] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-colors hover:border-white/[0.12] focus-within:border-white/[0.18]">
                  <Search className="h-4 w-4 shrink-0 text-zinc-500" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search crypto..."
                    className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
                    disabled={streaming}
                  />
                  {query && !streaming && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="text-zinc-600 transition-colors hover:text-zinc-300"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </form>
            </div>
          </header>

          <main className="mx-auto max-w-[1480px] px-4 py-5 pb-32 md:px-6 xl:px-8 2xl:px-10">
            {pathname === "/predictions" ? (
              <section
                ref={predictionsSectionRef}
                className="scroll-mt-24 space-y-4"
              >
                <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#0d0d10] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-colors hover:border-white/[0.12] focus-within:border-white/[0.18]">
                  <Search className="h-4 w-4 shrink-0 text-zinc-500" />
                  <input
                    type="text"
                    value={predictionSearch}
                    onChange={(e) => setPredictionSearch(e.target.value)}
                    placeholder="Search predictions..."
                    className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
                  />
                  {predictionSearch && (
                    <button
                      type="button"
                      onClick={() => setPredictionSearch("")}
                      className="text-zinc-600 transition-colors hover:text-zinc-300"
                      aria-label="Clear prediction search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {filteredPredictionMarkets.length === 0 ? (
                  <div className="rounded-2xl border border-white/[0.07] bg-[#0a0a0a] px-6 py-10 text-center text-sm text-zinc-500">
                    No prediction markets matched your search.
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    {filteredPredictionMarkets.map((market) => (
                      <PredictionBrowseCard key={market.id} market={market} />
                    ))}
                  </div>
                )}
              </section>
            ) : pathname === "/watchlist" ? (
              <div
                ref={homeSectionRef}
                className="scroll-mt-24 space-y-6"
              >
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-medium text-zinc-200">
                      My Watchlist
                    </h2>
                    <button
                      type="button"
                      className="text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300"
                    >
                      Manage Assets
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {watchlistCoins.map((coin) => {
                      const positive = coin.price_change_percentage_24h >= 0;
                      return (
                        <a
                          key={coin.id}
                          href={`https://www.coingecko.com/en/coins/${coin.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-[20px] border border-white/[0.07] bg-[#0a0a0a] p-4 transition-colors hover:border-white/[0.12] hover:bg-[#0d0d0f]"
                        >
                          <div className="mb-4 flex items-center gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={coin.image}
                              alt={coin.name}
                              className="h-10 w-10 rounded-full bg-black/30 object-cover"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-[15px] font-semibold text-zinc-100">
                                {coin.name}
                              </p>
                              <p className="truncate text-[12px] uppercase tracking-wide text-zinc-500">
                                {coin.symbol}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-end justify-between gap-3">
                            <div>
                              <p className="text-[18px] font-semibold tabular-nums text-zinc-100">
                                {fmt(coin.current_price)}
                              </p>
                              <p className="mt-1 text-[12px] text-zinc-500">
                                Mkt cap {fmtBig(coin.market_cap)}
                              </p>
                            </div>
                            <span
                              className={`inline-flex items-center gap-1 text-[13px] font-medium tabular-nums ${
                                positive ? "text-emerald-400" : "text-red-400"
                              }`}
                            >
                              {positive ? (
                                <ArrowUpRight className="h-3 w-3" />
                              ) : (
                                <ArrowDownRight className="h-3 w-3" />
                              )}
                              {pctCompact(coin.price_change_percentage_24h)}
                            </span>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-2">
                  <h2 className="text-sm font-medium text-zinc-200">
                    Watchlist Movers
                  </h2>
                  <WatchlistMoversChart coins={watchlistMovers} />
                </section>

                <section className="space-y-3">
                  <h2 className="text-sm font-medium text-zinc-200">
                    Notable Price Movement
                  </h2>
                  <div className="grid gap-3 xl:grid-cols-3">
                    {notablePriceMovers.map((coin) => {
                      const positive = coin.price_change_percentage_24h >= 0;
                      return (
                        <div
                          key={coin.id}
                          className="rounded-[20px] border border-white/[0.07] bg-[#0a0a0a] p-4"
                        >
                          <div className="mb-3 flex items-center gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={coin.image}
                              alt={coin.name}
                              className="h-10 w-10 rounded-full bg-black/30 object-cover"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-[15px] font-semibold text-zinc-100">
                                {coin.name}
                              </p>
                              <p className="truncate text-[12px] uppercase tracking-wide text-zinc-500">
                                {coin.symbol}
                              </p>
                            </div>
                          </div>
                          <p className="text-[13px] leading-6 text-zinc-400">
                            {coin.name} is trading at {fmt(coin.current_price)} after moving{" "}
                            <span
                              className={positive ? "text-emerald-400" : "text-red-400"}
                            >
                              {positive ? "+" : "-"}
                              {pctCompact(coin.price_change_percentage_24h)}
                            </span>{" "}
                            over the last day, with volume near {fmtBig(coin.total_volume)} and a
                            7-day move of {pctCompact(get7dChange(coin))}.
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-medium text-zinc-200">
                      Watchlist News
                    </h2>
                    {watchlistNewsLoading && (
                      <span className="text-xs text-zinc-500">Refreshing...</span>
                    )}
                  </div>
                  <div className="overflow-hidden border-y border-white/[0.07] bg-[#0a0a0a]">
                    {watchlistNewsLoading && watchlistNews.length === 0 ? (
                      <div className="px-4 py-8 text-sm text-zinc-500">
                        Loading watchlist headlines...
                      </div>
                    ) : watchlistNews.length === 0 ? (
                      <div className="px-4 py-8 text-sm text-zinc-500">
                        No watchlist headlines available right now.
                      </div>
                    ) : (
                      watchlistNews.map((item, index) => (
                        <a
                          key={`${item.link}-${index}`}
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block border-b border-white/[0.06] px-4 py-4 last:border-b-0 transition-colors hover:bg-white/[0.02]"
                        >
                          <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                            {item.source && <span>{item.source}</span>}
                            {item.publishedAt && <span>{item.publishedAt}</span>}
                          </div>
                          <p className="text-[14px] leading-6 text-zinc-200">
                            {item.title}
                          </p>
                        </a>
                      ))
                    )}
                  </div>
                </section>
              </div>
            ) : pathname === "/portfolio" ? (
              <div ref={homeSectionRef} className="scroll-mt-24 space-y-6">
                <section className="space-y-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h1 className="text-[22px] font-semibold text-zinc-100">
                        Portfolio
                      </h1>
                      <p className="mt-1 text-sm text-zinc-500">
                        Live Alpaca account data from your configured API credentials.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                        {portfolioData
                          ? formatRelativeUpdate(
                              new Date(portfolioData.fetched_at).getTime(),
                            )
                          : "Waiting for account data"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          void fetchPortfolioRouteData();
                        }}
                        disabled={portfolioRouteLoading}
                        className="inline-flex items-center gap-2 border border-white/[0.08] bg-[#0a0a0a] px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${
                            portfolioRouteLoading ? "animate-spin" : ""
                          }`}
                        />
                        Refresh
                      </button>
                    </div>
                  </div>

                  {portfolioRouteError ? (
                    <div className="border border-red-500/20 bg-red-500/5 px-4 py-4 text-sm text-red-300">
                      {portfolioRouteError}
                    </div>
                  ) : portfolioRouteLoading && !portfolioData ? (
                    <div className="flex items-center gap-3 border border-white/[0.07] bg-[#0a0a0a] px-4 py-8 text-sm text-zinc-500">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Loading Alpaca account data…
                    </div>
                  ) : portfolioData ? (
                    <>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <PortfolioStatTile
                          label="Equity"
                          value={fmtBig(portfolioData.summary.equity)}
                          detail={`Prev close ${fmtBig(
                            portfolioData.summary.last_equity,
                          )}`}
                        />
                        <PortfolioStatTile
                          label="Cash"
                          value={fmtBig(portfolioData.summary.cash)}
                          detail={`Buying power ${fmtBig(
                            portfolioData.summary.buying_power,
                          )}`}
                        />
                        <PortfolioStatTile
                          label="Day P/L"
                          value={`${
                            portfolioData.summary.day_pnl >= 0 ? "+" : ""
                          }${fmtBig(portfolioData.summary.day_pnl)}`}
                          tone={
                            portfolioData.summary.day_pnl >= 0
                              ? "positive"
                              : "negative"
                          }
                          detail={`${
                            portfolioData.summary.day_pnl_pct >= 0 ? "+" : ""
                          }${portfolioData.summary.day_pnl_pct.toFixed(2)}%`}
                        />
                        <PortfolioStatTile
                          label="Unrealized P/L"
                          value={`${
                            portfolioData.summary.unrealized_pnl_total >= 0
                              ? "+"
                              : ""
                          }${fmtBig(portfolioData.summary.unrealized_pnl_total)}`}
                          tone={
                            portfolioData.summary.unrealized_pnl_total >= 0
                              ? "positive"
                              : "negative"
                          }
                          detail={`${
                            portfolioData.summary.unrealized_pnl_pct >= 0
                              ? "+"
                              : ""
                          }${portfolioData.summary.unrealized_pnl_pct.toFixed(
                            2,
                          )}%`}
                        />
                        <PortfolioStatTile
                          label="Open Positions"
                          value={String(portfolioData.summary.positions_count)}
                          detail={`Pending orders ${portfolioData.summary.pending_orders_count}`}
                        />
                        <PortfolioStatTile
                          label="Filled Orders"
                          value={String(portfolioData.summary.filled_orders_count)}
                          detail={`Partially filled ${portfolioData.summary.partially_filled_orders_count}`}
                        />
                      </div>

                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
                        <section className="space-y-2">
                          <h2 className="text-sm font-medium text-zinc-200">
                            Open Positions
                          </h2>
                          <PortfolioPositionsTable positions={portfolioData.positions} />
                        </section>

                        <div className="space-y-4">
                          <section className="space-y-2">
                            <h2 className="text-sm font-medium text-zinc-200">
                              Account Details
                            </h2>
                            <div className="border-y border-white/[0.07] bg-[#0a0a0a]">
                              <div className="grid gap-px bg-white/[0.05] md:grid-cols-2">
                                <div className="bg-[#0a0a0a] px-4 py-3">
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                    Account
                                  </p>
                                  <p className="mt-2 text-sm font-medium text-zinc-100">
                                    {portfolioData.account.account_number
                                      ? `••••${String(
                                          portfolioData.account.account_number,
                                        ).slice(-4)}`
                                      : "--"}
                                  </p>
                                </div>
                                <div className="bg-[#0a0a0a] px-4 py-3">
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                    Status
                                  </p>
                                  <p className="mt-2 text-sm font-medium uppercase text-zinc-100">
                                    {portfolioData.account.status || "active"}
                                  </p>
                                </div>
                                <div className="bg-[#0a0a0a] px-4 py-3">
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                    Currency
                                  </p>
                                  <p className="mt-2 text-sm font-medium text-zinc-100">
                                    {portfolioData.account.currency || "USD"}
                                  </p>
                                </div>
                                <div className="bg-[#0a0a0a] px-4 py-3">
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                    Last Sync
                                  </p>
                                  <p className="mt-2 text-sm font-medium text-zinc-100">
                                    {new Date(portfolioData.fetched_at).toLocaleString(
                                      "en-US",
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </section>

                          <PortfolioCard data={portfolioData} />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <PortfolioOrdersTable
                          title="Pending Orders"
                          orders={portfolioData.orders.pending}
                          emptyLabel="No pending orders."
                        />
                        <PortfolioOrdersTable
                          title="Partially Filled Orders"
                          orders={portfolioData.orders.partially_filled}
                          emptyLabel="No partially filled orders."
                        />
                        <PortfolioOrdersTable
                          title="Recent Filled Orders"
                          orders={portfolioData.orders.filled}
                          emptyLabel="No recent filled orders."
                        />
                      </div>
                    </>
                  ) : null}
                </section>
              </div>
            ) : (
            <div
              ref={homeSectionRef}
              className="scroll-mt-24 flex flex-col gap-5 lg:flex-row lg:items-start"
            >
              <div className="min-w-0 flex-1 space-y-5">
            {/* ── Global stats bar ── */}
            {globalData && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-500 border-b border-white/[0.05] pb-4">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3 h-3" />
                  <span>Market Cap</span>
                  <span className="text-zinc-200 font-medium">
                    {fmtBig(globalData.total_market_cap.usd)}
                  </span>
                  <span
                    className={
                      globalData.market_cap_change_percentage_24h_usd >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                    }
                  >
                    {pct(globalData.market_cap_change_percentage_24h_usd)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <BarChart2 className="w-3 h-3" />
                  <span>24h Volume</span>
                  <span className="text-zinc-200 font-medium">
                    {fmtBig(globalData.total_volume.usd)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>BTC Dom.</span>
                  <span className="text-zinc-200 font-medium">
                    {globalData.market_cap_percentage.btc.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>ETH Dom.</span>
                  <span className="text-zinc-200 font-medium">
                    {globalData.market_cap_percentage.eth.toFixed(1)}%
                  </span>
                </div>
              </div>
            )}

            {/* ── Market overview cards ── */}
            <section>
              <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-3">
                Market Overview
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {marketOverviewCoins.map((coin) => {
                  const pos = coin.price_change_percentage_24h >= 0;
                  const changeAbs = Math.abs(coin.price_change_24h ?? 0);
                  return (
                    <div
                      key={coin.id}
                      onClick={() =>
                        window.open(
                          `https://www.coingecko.com/en/coins/${coin.id}`,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                      className="group bg-[#0a0a0a] border border-white/[0.07] rounded-xl hover:border-white/[0.14] hover:bg-[#111] transition-all cursor-pointer overflow-hidden"
                    >
                      <div className="px-3.5 pt-3.5 pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate leading-tight">
                              {coin.name}
                            </p>
                            <p className="text-sm text-zinc-500 mt-1 tabular-nums">
                              {fmt(coin.current_price)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span
                              className={`text-sm font-semibold flex items-center justify-end gap-0.5 ${
                                pos ? "text-emerald-400" : "text-red-400"
                              }`}
                            >
                              {pos ? (
                                <ArrowUpRight className="w-3 h-3" />
                              ) : (
                                <ArrowDownRight className="w-3 h-3" />
                              )}
                              {Math.abs(
                                coin.price_change_percentage_24h,
                              ).toFixed(2)}
                              %
                            </span>
                            <p
                              className={`text-sm font-medium mt-0.5 tabular-nums ${
                                pos ? "text-emerald-600" : "text-red-600"
                              }`}
                            >
                              {pos ? "+" : "-"}
                              {fmt(changeAbs)}
                            </p>
                          </div>
                        </div>
                      </div>
                      {coin.sparkline_in_7d?.price && (
                        <CardSparkline
                          data={coin.sparkline_in_7d.price}
                          positive={pos}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {topDiscussionMarkets.length > 0 && (
              <section>
                <div className="grid gap-3 xl:grid-cols-2">
                  {topDiscussionMarkets.map((market) => (
                    <DiscussionChartCard key={market.id} market={market} />
                  ))}
                </div>
              </section>
            )}

            {marketSummaryItems.length > 0 && (
              <section className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-medium text-zinc-200">
                    Market Summary
                  </h2>
                  <span className="text-xs text-zinc-500">
                    {formatRelativeUpdate(dashboardUpdatedAt)}
                  </span>
                </div>

                <div className="overflow-hidden border-y border-white/[0.07] bg-[#0a0a0a]">
                  <Accordion
                    type="single"
                    collapsible
                    defaultValue={marketSummaryItems[0]?.id}
                    className="border-0"
                  >
                    {marketSummaryItems.map((item) => (
                      <AccordionItem
                        key={item.id}
                        value={item.id}
                        className="border-white/[0.06] last:border-b-0"
                      >
                        <AccordionTrigger className="px-4 text-[14px] leading-6 text-zinc-200 md:text-[15px]">
                          {item.title}
                        </AccordionTrigger>
                        <AccordionContent className="px-4 text-[13px] leading-7 text-zinc-400">
                          {item.body}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>

                  <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-2.5 text-xs text-zinc-500">
                    <div className="flex items-center gap-3">
                      {marketSummarySources.map((source) => (
                        <span
                          key={source.label}
                          className="inline-flex items-center gap-1.5"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={source.icon}
                            alt={source.label}
                            className="h-3.5 w-3.5 rounded-sm opacity-80"
                          />
                          <span>{source.label}</span>
                        </span>
                      ))}
                    </div>
                    <span>{coins.length + predictions.length} live inputs</span>
                  </div>
                </div>
              </section>
            )}

            {marketLeaders.length > 0 && (
              <section className="space-y-1.5">
                <div className="flex items-center gap-6">
                  <button
                    type="button"
                    onClick={() => setMarketLeadersTab("up")}
                    className={`text-[14px] font-semibold transition-colors ${
                      marketLeadersTab === "up"
                        ? "text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    Surging Up
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarketLeadersTab("down")}
                    className={`text-[14px] font-semibold transition-colors ${
                      marketLeadersTab === "down"
                        ? "text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    Surging Down
                  </button>
                </div>

                <div className="overflow-hidden border-y border-white/[0.07] bg-[#0a0a0a]">
                  <div className="overflow-x-auto">
                    <div className="min-w-[1020px]">
                      <div className="grid grid-cols-[2.25fr_0.95fr_0.9fr_0.65fr_0.65fr_0.65fr_0.85fr_0.8fr_0.8fr] gap-3 border-b border-white/[0.06] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        <span>Asset</span>
                        <span className="text-right">Mkt Cap</span>
                        <span className="text-right">Price</span>
                        <span className="text-right">1H</span>
                        <span className="text-right">24H</span>
                        <span className="text-right">7D</span>
                        <span className="text-right">Vol/Adv</span>
                        <span className="text-center">Sentiment</span>
                        <span className="text-right">7D Chart</span>
                      </div>

                      {marketLeaderRows.map((coin) => {
                        const oneHour = get1hChange(coin);
                        const oneDay = coin.price_change_percentage_24h ?? 0;
                        const sevenDay = get7dChange(coin);
                        const volumeAdv = getVolumeAdvMultiple(coin);
                        const sentimentScore = getMomentumScore(coin);
                        const multipleColor =
                          volumeAdv >= 1.5
                            ? "text-amber-400"
                            : volumeAdv >= 1
                              ? "text-zinc-300"
                              : "text-zinc-500";

                        return (
                          <a
                            key={coin.id}
                            href={`https://www.coingecko.com/en/coins/${coin.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="grid grid-cols-[2.25fr_0.95fr_0.9fr_0.65fr_0.65fr_0.65fr_0.85fr_0.8fr_0.8fr] gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={coin.image}
                                alt={coin.name}
                                className="h-10 w-10 rounded-full bg-black/30 object-cover shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-[15px] font-semibold text-zinc-100">
                                  {coin.name}
                                </p>
                                <p className="truncate text-[11px] uppercase tracking-wide text-zinc-500">
                                  {coin.symbol}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-end text-right text-[14px] font-medium tabular-nums text-zinc-300">
                              {fmtBig(coin.market_cap)}
                            </div>

                            <div className="flex items-center justify-end text-right text-[14px] font-medium tabular-nums text-zinc-300">
                              {fmt(coin.current_price)}
                            </div>

                            <div className="flex items-center justify-end">
                              <span
                                className={`inline-flex items-center gap-0.5 text-[13px] font-medium tabular-nums ${
                                  oneHour >= 0 ? "text-emerald-400" : "text-red-400"
                                }`}
                              >
                                {oneHour >= 0 ? (
                                  <ArrowUpRight className="h-3 w-3" />
                                ) : (
                                  <ArrowDownRight className="h-3 w-3" />
                                )}
                                {pctCompact(oneHour)}
                              </span>
                            </div>

                            <div className="flex items-center justify-end">
                              <span
                                className={`inline-flex items-center gap-0.5 text-[13px] font-medium tabular-nums ${
                                  oneDay >= 0 ? "text-emerald-400" : "text-red-400"
                                }`}
                              >
                                {oneDay >= 0 ? (
                                  <ArrowUpRight className="h-3 w-3" />
                                ) : (
                                  <ArrowDownRight className="h-3 w-3" />
                                )}
                                {pctCompact(oneDay)}
                              </span>
                            </div>

                            <div className="flex items-center justify-end">
                              <span
                                className={`inline-flex items-center gap-0.5 text-[13px] font-medium tabular-nums ${
                                  sevenDay >= 0 ? "text-emerald-400" : "text-red-400"
                                }`}
                              >
                                {sevenDay >= 0 ? (
                                  <ArrowUpRight className="h-3 w-3" />
                                ) : (
                                  <ArrowDownRight className="h-3 w-3" />
                                )}
                                {pctCompact(sevenDay)}
                              </span>
                            </div>

                            <div className="flex flex-col items-end justify-center text-right">
                              <span className="text-[13px] font-medium tabular-nums text-zinc-300">
                                {fmtBig(coin.total_volume)}
                              </span>
                              <span className={`text-[12px] font-medium tabular-nums ${multipleColor}`}>
                                {volumeAdv.toFixed(1)}x
                              </span>
                            </div>

                            <div className="flex items-center justify-center">
                              <MarketSentimentMeter score={sentimentScore} />
                            </div>

                            <div className="flex items-center justify-end">
                              <MarketLeaderSparkline
                                data={coin.sparkline_in_7d?.price ?? []}
                              />
                            </div>
                          </a>
                        );
                      })}

                      <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3 text-xs text-zinc-500">
                        <span>
                          {marketLeaders.length === 0
                            ? "0 results"
                            : `${clampedMarketLeadersPage * marketLeadersPageSize + 1}-${Math.min(
                                (clampedMarketLeadersPage + 1) *
                                  marketLeadersPageSize,
                                marketLeaders.length,
                              )} of ${marketLeaders.length}`}
                        </span>
                        <div className="flex items-center gap-4">
                          <button
                            type="button"
                            onClick={() =>
                              setMarketLeadersPage((page) => Math.max(0, page - 1))
                            }
                            disabled={clampedMarketLeadersPage === 0}
                            className="transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:text-zinc-700"
                          >
                            Prev
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setMarketLeadersPage((page) =>
                                Math.min(marketLeadersPageCount - 1, page + 1),
                              )
                            }
                            disabled={
                              clampedMarketLeadersPage >= marketLeadersPageCount - 1
                            }
                            className="transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:text-zinc-700"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {highVolumeCoins.length > 0 && (
              <section className="space-y-1.5">
                <div className="flex items-center gap-6">
                  <h2 className="text-[14px] font-semibold text-zinc-100">
                    High Volume
                  </h2>
                </div>

                <div className="overflow-hidden border-y border-white/[0.07] bg-[#0a0a0a]">
                  <div className="overflow-x-auto">
                    <div className="min-w-[1020px]">
                      <div className="grid grid-cols-[2.25fr_0.95fr_0.9fr_0.65fr_0.65fr_0.65fr_0.85fr_0.8fr_0.8fr] gap-3 border-b border-white/[0.06] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        <span>Asset</span>
                        <span className="text-right">Mkt Cap</span>
                        <span className="text-right">Price</span>
                        <span className="text-right">1H</span>
                        <span className="text-right">24H</span>
                        <span className="text-right">7D</span>
                        <span className="text-right">Vol/Adv</span>
                        <span className="text-center">Sentiment</span>
                        <span className="text-right">7D Chart</span>
                      </div>

                      {highVolumeRows.map((coin) => {
                        const oneHour = get1hChange(coin);
                        const oneDay = coin.price_change_percentage_24h ?? 0;
                        const sevenDay = get7dChange(coin);
                        const volumeAdv = getVolumeAdvMultiple(coin);
                        const sentimentScore = getMomentumScore(coin);
                        const multipleColor =
                          volumeAdv >= 1.5
                            ? "text-amber-400"
                            : volumeAdv >= 1
                              ? "text-zinc-300"
                              : "text-zinc-500";

                        return (
                          <a
                            key={coin.id}
                            href={`https://www.coingecko.com/en/coins/${coin.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="grid grid-cols-[2.25fr_0.95fr_0.9fr_0.65fr_0.65fr_0.65fr_0.85fr_0.8fr_0.8fr] gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={coin.image}
                                alt={coin.name}
                                className="h-10 w-10 rounded-full bg-black/30 object-cover shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-[15px] font-semibold text-zinc-100">
                                  {coin.name}
                                </p>
                                <p className="truncate text-[11px] uppercase tracking-wide text-zinc-500">
                                  {coin.symbol}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-end text-right text-[14px] font-medium tabular-nums text-zinc-300">
                              {fmtBig(coin.market_cap)}
                            </div>

                            <div className="flex items-center justify-end text-right text-[14px] font-medium tabular-nums text-zinc-300">
                              {fmt(coin.current_price)}
                            </div>

                            <div className="flex items-center justify-end">
                              <span
                                className={`inline-flex items-center gap-0.5 text-[13px] font-medium tabular-nums ${
                                  oneHour >= 0 ? "text-emerald-400" : "text-red-400"
                                }`}
                              >
                                {oneHour >= 0 ? (
                                  <ArrowUpRight className="h-3 w-3" />
                                ) : (
                                  <ArrowDownRight className="h-3 w-3" />
                                )}
                                {pctCompact(oneHour)}
                              </span>
                            </div>

                            <div className="flex items-center justify-end">
                              <span
                                className={`inline-flex items-center gap-0.5 text-[13px] font-medium tabular-nums ${
                                  oneDay >= 0 ? "text-emerald-400" : "text-red-400"
                                }`}
                              >
                                {oneDay >= 0 ? (
                                  <ArrowUpRight className="h-3 w-3" />
                                ) : (
                                  <ArrowDownRight className="h-3 w-3" />
                                )}
                                {pctCompact(oneDay)}
                              </span>
                            </div>

                            <div className="flex items-center justify-end">
                              <span
                                className={`inline-flex items-center gap-0.5 text-[13px] font-medium tabular-nums ${
                                  sevenDay >= 0 ? "text-emerald-400" : "text-red-400"
                                }`}
                              >
                                {sevenDay >= 0 ? (
                                  <ArrowUpRight className="h-3 w-3" />
                                ) : (
                                  <ArrowDownRight className="h-3 w-3" />
                                )}
                                {pctCompact(sevenDay)}
                              </span>
                            </div>

                            <div className="flex flex-col items-end justify-center text-right">
                              <span className="text-[13px] font-medium tabular-nums text-zinc-300">
                                {fmtBig(coin.total_volume)}
                              </span>
                              <span className={`text-[12px] font-medium tabular-nums ${multipleColor}`}>
                                {volumeAdv.toFixed(1)}x
                              </span>
                            </div>

                            <div className="flex items-center justify-center">
                              <MarketSentimentMeter score={sentimentScore} />
                            </div>

                            <div className="flex items-center justify-end">
                              <MarketLeaderSparkline
                                data={coin.sparkline_in_7d?.price ?? []}
                              />
                            </div>
                          </a>
                        );
                      })}

                      <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3 text-xs text-zinc-500">
                        <span>
                          {highVolumeCoins.length === 0
                            ? "0 results"
                            : `${clampedHighVolumePage * marketLeadersPageSize + 1}-${Math.min(
                                (clampedHighVolumePage + 1) *
                                  marketLeadersPageSize,
                                highVolumeCoins.length,
                              )} of ${highVolumeCoins.length}`}
                        </span>
                        <div className="flex items-center gap-4">
                          <button
                            type="button"
                            onClick={() =>
                              setHighVolumePage((page) => Math.max(0, page - 1))
                            }
                            disabled={clampedHighVolumePage === 0}
                            className="transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:text-zinc-700"
                          >
                            Prev
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setHighVolumePage((page) =>
                                Math.min(highVolumePageCount - 1, page + 1),
                              )
                            }
                            disabled={clampedHighVolumePage >= highVolumePageCount - 1}
                            className="transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:text-zinc-700"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* ── AI Chat panel ── */}
            {showChat && messages.length > 0 && (
              <section className="bg-[#0a0a0a] border border-white/[0.07] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05]">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-sm font-medium text-zinc-300">
                      AI Analysis
                    </span>
                    <span className="text-sm text-zinc-600">
                      · claude-sonnet-4-6
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setShowChat(false);
                      setMessages([]);
                    }}
                    className="text-zinc-600 hover:text-zinc-300 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="p-4 max-h-80 overflow-y-auto space-y-4">
                  {messages.map((msg, idx) => (
                    <div
                      key={msg.id || idx}
                      className={`flex gap-2.5 ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {msg.role === "assistant" && (
                        <div className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0 mt-0.5">
                          <Zap className="w-2.5 h-2.5 text-blue-400" />
                        </div>
                      )}
                      {msg.role === "assistant" && msg.coinCard ? (
                        <div className="flex-1 min-w-0 space-y-3">
                          <CoinDetailCard meta={msg.coinCard} />
                          {!msg.coinCard.loading &&
                            msg.content &&
                            msg.content !== "__ASSET_CARD__" && (
                              <MarkdownMessage
                                text={msg.content}
                                streaming={false}
                              />
                            )}
                          <MessageContext
                            message={msg}
                            disabled={streaming}
                            onFollowUp={(prompt) => {
                              void sendPrompt(prompt);
                            }}
                          />
                        </div>
                      ) : msg.role === "assistant" &&
                        (msg.portfolio || msg.portfolioLoading) ? (
                        <div className="flex-1 min-w-0 space-y-3">
                          {msg.portfolio ? (
                            <PortfolioCard data={msg.portfolio} />
                          ) : (
                            <div className="bg-[#0a0a0a] border border-white/[0.07] rounded-xl p-6 flex items-center gap-3">
                              <RefreshCw className="w-4 h-4 animate-spin text-zinc-500" />
                              <span className="text-sm text-zinc-500">
                                Loading portfolio data…
                              </span>
                            </div>
                          )}
                          {msg.content &&
                            msg.content !== "__PORTFOLIO_CARD__" && (
                              <MarkdownMessage
                                text={msg.content}
                                streaming={false}
                              />
                            )}
                          <MessageContext
                            message={msg}
                            disabled={streaming}
                            onFollowUp={(prompt) => {
                              void sendPrompt(prompt);
                            }}
                          />
                        </div>
                      ) : msg.role === "assistant" ? (
                        <div className="flex-1 min-w-0 max-w-[88%]">
                          <MarkdownMessage
                            text={msg.content}
                            streaming={streaming && idx === messages.length - 1}
                          />
                          <MessageContext
                            message={msg}
                            disabled={streaming}
                            onFollowUp={(prompt) => {
                              void sendPrompt(prompt);
                            }}
                          />
                        </div>
                      ) : (
                        <div className="text-sm leading-relaxed max-w-[88%] bg-white/8 border border-white/8 rounded-2xl rounded-tr-sm px-3 py-2 text-zinc-200">
                          {msg.content}
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              </section>
            )}
          </div>
          {/* end left column */}

              {/* ── Right sidebar ── */}
              <aside className="w-full lg:w-[300px] lg:shrink-0 lg:sticky lg:top-[88px] lg:self-start">
                <section className="mb-4 overflow-hidden rounded-[22px] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(14,14,18,0.98),rgba(7,7,10,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <div className="border-b border-white/[0.06] px-3.5 pt-3 pb-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        {([
                          ["gainers", "Top Gainers"],
                          ["losers", "Top Losers"],
                        ] as const).map(([tab, label]) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={`whitespace-nowrap text-[11px] font-semibold leading-none transition-colors ${
                              activeTab === tab
                                ? "text-zinc-100"
                                : "text-zinc-500 hover:text-zinc-300"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {sentiment && (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            {sentimentBars.map((isActive, index) => (
                              <span
                                key={index}
                                className={`h-3.5 w-1 rounded-full ${
                                  isActive ? sentimentBarColor : "bg-white/[0.09]"
                                }`}
                              />
                            ))}
                          </div>
                          <span className={`whitespace-nowrap text-[11px] font-semibold ${sentimentColor}`}>
                            {sentimentDisplayLabel}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-[minmax(0,1.25fr)_0.85fr_0.68fr_0.72fr] gap-2 border-b border-white/[0.06] px-3.5 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    <span>Asset</span>
                    <span className="text-right">Price</span>
                    <span className="text-right">24H</span>
                    <span className="text-right">Vol/MCap</span>
                  </div>

                  {moverRows.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-zinc-600">
                      No data
                    </div>
                  ) : (
                    <div className="divide-y divide-white/[0.04]">
                      {moverRows.map((coin) => {
                        const pos = coin.price_change_percentage_24h >= 0;
                        const multiple = fmtVolumeMultiple(
                          coin.total_volume,
                          coin.market_cap,
                        );
                        const multipleValue =
                          Number.parseFloat(multiple.replace("x", "")) || 0;
                        const multipleColor =
                          multipleValue >= 1.5
                            ? "text-amber-400"
                            : multipleValue >= 1
                              ? "text-zinc-300"
                              : "text-zinc-500";

                        return (
                          <a
                            key={coin.id}
                            href={`https://www.coingecko.com/en/coins/${coin.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="grid grid-cols-[minmax(0,1.25fr)_0.85fr_0.68fr_0.72fr] gap-2 px-3.5 py-2.5 transition-colors hover:bg-white/[0.02]"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={coin.image}
                                alt={coin.name}
                                className="h-8 w-8 rounded-full bg-black/30 object-cover shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-[12px] font-semibold leading-tight text-zinc-100">
                                  {coin.name}
                                </p>
                                <p className="truncate text-[10px] uppercase text-zinc-500">
                                  {coin.symbol}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-end text-right">
                              <span className="text-[12px] font-medium tabular-nums text-zinc-300">
                                {fmt(coin.current_price)}
                              </span>
                            </div>

                            <div className="flex items-center justify-end text-right">
                              <span
                                className={`inline-flex items-center gap-0.5 text-[12px] font-medium tabular-nums ${
                                  pos ? "text-emerald-400" : "text-red-400"
                                }`}
                              >
                                {pos ? (
                                  <ArrowUpRight className="h-2.5 w-2.5" />
                                ) : (
                                  <ArrowDownRight className="h-2.5 w-2.5" />
                                )}
                                {Math.abs(coin.price_change_percentage_24h).toFixed(1)}%
                              </span>
                            </div>

                            <div className="flex items-center justify-end text-right">
                              <span className={`text-[12px] font-medium tabular-nums ${multipleColor}`}>
                                {multiple}
                              </span>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section
                  ref={predictionsSectionRef}
                  className="scroll-mt-24"
                >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wider">
                  Top Discussion
                </h2>
                <a
                  href="https://polymarket.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-zinc-600 hover:text-zinc-400 flex items-center gap-1 transition-colors"
                >
                  Polymarket
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>

              {predictions.length === 0 ? (
                <div className="bg-[#0a0a0a] border border-white/[0.07] rounded-xl p-8 text-center">
                  <p className="text-sm text-zinc-600">
                    Prediction markets unavailable
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {predictions.map((market) => {
                    const yesPct = Math.round(
                      parseFloat(market.outcomePrices?.[0] ?? "0.5") * 100,
                    );
                    const isHigh = yesPct >= 50;
                    const vol = parseFloat(market.volume ?? "0");

                    return (
                      <a
                        key={market.id}
                        href={
                          market.slug
                            ? `https://polymarket.com/event/${market.slug}`
                            : "https://polymarket.com"
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block bg-[#0a0a0a] border border-white/[0.14] rounded-xl p-4 hover:border-white/[0.25] hover:bg-[#111] transition-all cursor-pointer"
                      >
                        <p className="text-sm font-medium text-zinc-200 leading-snug mb-3 line-clamp-2">
                          {market.question}
                        </p>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex gap-2">
                              <span
                                className={
                                  isHigh ? "text-emerald-400" : "text-zinc-400"
                                }
                              >
                                Yes{" "}
                                <span className="font-semibold tabular-nums">
                                  {yesPct}%
                                </span>
                              </span>
                              <span
                                className={
                                  !isHigh ? "text-red-400" : "text-zinc-500"
                                }
                              >
                                No{" "}
                                <span className="font-semibold tabular-nums">
                                  {100 - yesPct}%
                                </span>
                              </span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${yesPct}%`,
                                background: isHigh
                                  ? "linear-gradient(90deg,#22c55e,#16a34a)"
                                  : "linear-gradient(90deg,#ef4444,#dc2626)",
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-sm text-zinc-600">
                            <span>Vol {fmtBig(vol)}</span>
                            {market.endDate && (
                              <span>
                                {new Date(market.endDate).toLocaleDateString(
                                  "en-US",
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "2-digit",
                                  },
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
                </section>
              </aside>
            </div>
            )}
          </main>
        </div>
      </div>

      {/* ── Trading Dashboard Modal ── */}
      <TradingDashboardModal
        open={showTradingModal}
        onClose={() => setShowTradingModal(false)}
      />

      <div className="fixed bottom-0 left-[62px] right-0 z-50 bg-linear-to-t from-[#000000] via-[#000000]/95 to-transparent px-4 pb-4 pt-6 md:left-[72px] md:px-6 xl:px-8 2xl:px-10">
        <div className="mx-auto max-w-[1480px]">
          <form onSubmit={handleSearch}>
            <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-[#0a0a0a] px-4 py-3 shadow-[0_0_40px_rgba(0,0,0,0.8)] transition-colors hover:border-white/18 focus-within:border-white/26">
              <Search className="h-4 w-4 shrink-0 text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about crypto, stocks, ETFs, prices, trends..."
                className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
                disabled={streaming}
              />
              {query && !streaming && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-zinc-600 transition-colors hover:text-zinc-300"
                  aria-label="Clear composer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="submit"
                disabled={!query.trim() || streaming}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {streaming ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span>Thinking</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3 w-3" />
                    <span>Ask</span>
                  </>
                )}
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-zinc-700">
              Powered by live market data and AI analysis
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
