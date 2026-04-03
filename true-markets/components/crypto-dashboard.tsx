"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useDeferredValue,
} from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
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
  Eye,
  Heart,
  MessageCircleMore,
  Repeat2,
  Hash,
} from "lucide-react";
import { toast } from "sonner";

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
  publishedAtIso?: string;
}

interface SocialMentionPost {
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  followers: number;
  verified: boolean;
  text: string;
  url: string;
  publishTime: number;
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  tokenName: string;
  tokenLogo: string;
  platform: string;
  mediaUrls?: string[];
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

interface ChatAttachmentPayload {
  name: string;
  mimeType: string;
  kind: "image" | "text" | "binary";
  size: number;
  textContent?: string;
  imageDataUrl?: string;
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

function fmtCount(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return `${Math.round(value)}`;
}

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function formatRelativeAgeFromUnix(timestamp: number): string {
  const diffMs = Date.now() - timestamp * 1000;
  const diffHours = Math.max(1, Math.floor(diffMs / (60 * 60 * 1000)));
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
}

type PredictionBrowseFilter =
  | "all"
  | "bitcoin"
  | "ethereum"
  | "launches"
  | "deadlines"
  | "price-targets";

type AlertsMode = "price" | "percentage" | "periodic" | "volume";

const PREDICTION_BROWSE_FILTERS: Array<{
  key: PredictionBrowseFilter;
  label: string;
}> = [
  { key: "all", label: "All" },
  { key: "bitcoin", label: "Bitcoin" },
  { key: "ethereum", label: "Ethereum" },
  { key: "launches", label: "Launches" },
  { key: "deadlines", label: "Deadlines" },
  { key: "price-targets", label: "Price Targets" },
];

const ALERTS_TABS: Array<{ key: AlertsMode; label: string }> = [
  { key: "price", label: "Price" },
  { key: "percentage", label: "Percentage" },
  { key: "periodic", label: "Periodic" },
  { key: "volume", label: "Volume" },
];

const ALERT_CHANNEL_OPTIONS = ["Email", "SMS"] as const;
const ALERT_ASSET_OPTIONS = ["BTC", "SOL"] as const;
const ALERT_PERCENTAGE_WINDOW_OPTIONS = [
  "5 min",
  "30 min",
  "1 hour",
  "4 hours",
] as const;
const ALERT_PERIODIC_INTERVAL_OPTIONS = [
  "1 hour",
  "2 hours",
  "4 hours",
] as const;
const ALERT_VOLUME_MULTIPLE_OPTIONS = ["2x", "5x", "10x"] as const;
const ALERT_VOLUME_WINDOW_OPTIONS = ["5 min", "30 min", "1 hour"] as const;
const ALERT_EXCHANGE_OPTIONS = [
  "Coinbase",
  "Binance",
  "Bitrue",
  "Kraken",
  "KuCoin",
  "Bybit",
  "OKX",
] as const;

const DEFAULT_WATCHLIST_ASSET_IDS = [
  "bitcoin",
  "ethereum",
  "solana",
  "ripple",
  "dogecoin",
  "chainlink",
] as const;

const PORTFOLIO_CONNECTED_STORAGE_KEY = "truemarkets-portfolio-connected";

function fmtVolumeMultiple(volume: number, marketCap: number): string {
  if (
    !Number.isFinite(volume) ||
    !Number.isFinite(marketCap) ||
    marketCap <= 0
  ) {
    return "--";
  }

  return `${((volume / marketCap) * 10).toFixed(1)}x`;
}

const DEFAULT_POSITION_NOTIONAL = 100;
const MAX_CHAT_ATTACHMENTS = 5;
const MAX_ATTACHMENT_TEXT_CHARS = 12000;
const PENDING_CHAT_REQUEST_STORAGE_KEY = "truemarkets-pending-chat-request";

const TEXT_LIKE_EXTENSIONS = new Set([
  "txt",
  "md",
  "csv",
  "json",
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "html",
  "css",
  "xml",
  "yaml",
  "yml",
]);

function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex < 0) return "";
  return filename.slice(dotIndex + 1).toLowerCase();
}

function isTextLikeFile(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  return TEXT_LIKE_EXTENSIONS.has(getFileExtension(file.name));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

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

  const diffMinutes = Math.max(
    0,
    Math.round((Date.now() - timestamp) / 60_000),
  );
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
      padding +
      (index / Math.max(points.length - 1, 1)) * Math.max(innerWidth, 0);
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
      padding +
      (index / Math.max(points.length - 1, 1)) * Math.max(innerWidth, 0);
    const normalized = (point - min) / range;
    const y = padding + (1 - normalized) * Math.max(innerHeight, 0);

    return `${path}${index === 0 ? "M" : " L"} ${x} ${y}`;
  }, "");
}

function pctCompact(n?: number): string {
  if (!Number.isFinite(n)) return "--";
  return `${Math.abs(n ?? 0).toFixed(1)}%`;
}

interface NotableTimelineEntry {
  label: string;
  summary: string;
  citedCount: number;
  analyzedCount: number;
}

type AllocationSimulatorWeights = Record<string, number>;

interface PortfolioRiskMetrics {
  expectedReturnPct: number;
  volatilityPct: number;
  maxDrawdownPct: number;
  sharpe: number;
}

interface AllocationSimulationResult {
  simulatedPortfolio: {
    expectedReturnPct: number;
    riskLabel: "Low" | "Medium" | "High";
    maxDrawdownPct: number;
    sharpe: number;
  };
  impact: {
    netPnlImpact: number;
    riskReductionPct: number;
    profileShift: "Safer" | "Balanced" | "Aggressive";
  };
  recommendations: string[];
}

interface AllocationProposal {
  symbol: string;
  currentPct: number;
  targetPct: number;
  expectedReturnPct: number;
  volatilityPct: number;
  maxDrawdownPct: number;
}

function normalizePortfolioSymbol(symbol: string): string {
  const cleaned = symbol.toUpperCase().replace(/[^A-Z]/g, "");
  if (cleaned.endsWith("USDT")) return cleaned.slice(0, -4);
  if (cleaned.endsWith("USD")) return cleaned.slice(0, -3);
  return cleaned;
}

function hasSameAllocationWeights(
  current: AllocationSimulatorWeights,
  next: AllocationSimulatorWeights,
): boolean {
  const currentKeys = Object.keys(current).sort();
  const nextKeys = Object.keys(next).sort();

  if (currentKeys.length !== nextKeys.length) return false;

  for (let index = 0; index < currentKeys.length; index += 1) {
    const currentKey = currentKeys[index];
    const nextKey = nextKeys[index];

    if (currentKey !== nextKey) return false;

    const currentValue = current[currentKey] ?? 0;
    const nextValue = next[nextKey] ?? 0;
    if (Math.abs(currentValue - nextValue) > 0.05) return false;
  }

  return true;
}

function normalizeAllocationTargets(
  weights: AllocationSimulatorWeights,
  symbols: string[],
): AllocationSimulatorWeights {
  const rawTotal = symbols.reduce(
    (sum, symbol) => sum + Math.max(0, weights[symbol] ?? 0),
    0,
  );
  const scale = rawTotal > 100 ? 100 / rawTotal : 1;

  return symbols.reduce((acc, symbol) => {
    acc[symbol] = Math.max(0, weights[symbol] ?? 0) * scale;
    return acc;
  }, {} as AllocationSimulatorWeights);
}

function buildLocalSimulationRecommendations(
  proposals: AllocationProposal[],
  riskLabel: "Low" | "Medium" | "High",
): string[] {
  const recommendations: string[] = [];
  const deltas = proposals
    .map((proposal) => ({
      symbol: proposal.symbol,
      delta: proposal.targetPct - proposal.currentPct,
      expectedReturnPct: proposal.expectedReturnPct,
      volatilityPct: proposal.volatilityPct,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const largestReduction = deltas.find((entry) => entry.delta <= -1.5);
  if (largestReduction) {
    const reductionPct = Math.abs(largestReduction.delta);
    const volatilityCutPct = Math.max(4, Math.round(reductionPct * 2.4));
    recommendations.push(
      `Reduce ${largestReduction.symbol} by ${reductionPct.toFixed(1)}% to lower volatility by about ${volatilityCutPct}%`,
    );
  }

  const strongestReturnAsset = [...deltas]
    .filter((entry) => entry.expectedReturnPct > 0)
    .sort((a, b) => b.expectedReturnPct - a.expectedReturnPct)[0];
  if (strongestReturnAsset) {
    recommendations.push(
      `Increase ${strongestReturnAsset.symbol} for better risk-adjusted return potential`,
    );
  }

  if (riskLabel !== "Low") {
    recommendations.push("Add a stablecoin hedge to dampen downside swings");
  } else {
    recommendations.push(
      "Keep a small stablecoin buffer for downside protection",
    );
  }

  return recommendations.slice(0, 3);
}

function computeSeriesVolatilityPct(series: number[]): number {
  const prices = series.filter((value) => Number.isFinite(value) && value > 0);
  if (prices.length < 3) return 0;

  const returns: number[] = [];
  for (let index = 1; index < prices.length; index += 1) {
    const prev = prices[index - 1];
    const current = prices[index];
    if (prev <= 0) continue;
    returns.push((current - prev) / prev);
  }

  if (returns.length < 2) return 0;

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    returns.length;
  const hourlyStdDev = Math.sqrt(variance);
  const annualizedVolatility = hourlyStdDev * Math.sqrt(24 * 365) * 100;

  return Number.isFinite(annualizedVolatility)
    ? Math.max(0, annualizedVolatility)
    : 0;
}

function computeSeriesMaxDrawdownPct(series: number[]): number {
  const prices = series.filter((value) => Number.isFinite(value) && value > 0);
  if (prices.length < 2) return 0;

  let peak = prices[0];
  let maxDrawdown = 0;

  for (const price of prices) {
    peak = Math.max(peak, price);
    const drawdown = ((price - peak) / peak) * 100;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
  }

  return maxDrawdown;
}

function classifyRiskLevel(volatilityPct: number): "Low" | "Medium" | "High" {
  if (volatilityPct >= 55) return "High";
  if (volatilityPct >= 30) return "Medium";
  return "Low";
}

function classifySafetyStance(
  currentVolatilityPct: number,
  simulatedVolatilityPct: number,
): "Safer" | "Balanced" | "Aggressive" {
  if (simulatedVolatilityPct <= currentVolatilityPct - 3) return "Safer";
  if (simulatedVolatilityPct >= currentVolatilityPct + 3) return "Aggressive";
  return "Balanced";
}

function buildWeightedRiskMetrics(
  components: Array<{ weightPct: number; metrics: PortfolioRiskMetrics }>,
): PortfolioRiskMetrics {
  const totalWeight = components.reduce(
    (sum, component) => sum + Math.max(0, component.weightPct),
    0,
  );

  if (totalWeight <= 0) {
    return {
      expectedReturnPct: 0,
      volatilityPct: 0,
      maxDrawdownPct: 0,
      sharpe: 0,
    };
  }

  const weighted = components.reduce(
    (acc, component) => {
      const weight = Math.max(0, component.weightPct) / totalWeight;
      acc.expectedReturnPct += component.metrics.expectedReturnPct * weight;
      acc.volatilityPct += component.metrics.volatilityPct * weight;
      acc.maxDrawdownPct += component.metrics.maxDrawdownPct * weight;
      acc.sharpe += component.metrics.sharpe * weight;
      return acc;
    },
    {
      expectedReturnPct: 0,
      volatilityPct: 0,
      maxDrawdownPct: 0,
      sharpe: 0,
    },
  );

  return weighted;
}

function toHeadlineSentence(rawTitle: string): string {
  const trimmed = rawTitle
    .replace(/\s*[-|•]\s*[^-|•]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function resolveNewsTimestamp(item: NewsItem): number | null {
  if (item.publishedAtIso) {
    const parsed = Date.parse(item.publishedAtIso);
    if (Number.isFinite(parsed)) return parsed;
  }

  if (item.publishedAt) {
    const parsed = Date.parse(
      `${item.publishedAt} ${new Date().getFullYear()}`,
    );
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function formatTimelineLabel(dayStart: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dayStart === today.getTime()) return "Today";
  if (dayStart === yesterday.getTime()) return "Yesterday";

  return new Date(dayStart).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function buildNotablePriceTimeline(items: NewsItem[]): NotableTimelineEntry[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    const ta = resolveNewsTimestamp(a) ?? 0;
    const tb = resolveNewsTimestamp(b) ?? 0;
    return tb - ta;
  });

  const byDay = new Map<number, NewsItem[]>();

  for (const item of sorted) {
    const ts = resolveNewsTimestamp(item) ?? Date.now();
    const dt = new Date(ts);
    dt.setHours(0, 0, 0, 0);
    const dayStart = dt.getTime();

    if (!byDay.has(dayStart)) {
      byDay.set(dayStart, []);
    }
    byDay.get(dayStart)?.push(item);
  }

  return [...byDay.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, 4)
    .map(([dayStart, dayItems]) => {
      const uniqueTitles = Array.from(
        new Set(dayItems.map((item) => toHeadlineSentence(item.title))),
      )
        .filter(Boolean)
        .slice(0, 4);

      return {
        label: formatTimelineLabel(dayStart),
        summary: uniqueTitles.join(" "),
        citedCount: uniqueTitles.length,
        analyzedCount: items.length,
      };
    })
    .filter((entry) => entry.summary.length > 0);
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
      padding +
      (index / Math.max(points.length - 1, 1)) * Math.max(innerWidth, 0);
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

function matchesPredictionBrowseFilter(
  market: PredictionMarket,
  filter: PredictionBrowseFilter,
): boolean {
  if (filter === "all") return true;

  const haystack = [
    normalizeDiscussionQuestion(market.question),
    ...(market.discussionOptions?.map((option) => option.label) ?? []),
  ]
    .join(" ")
    .toLowerCase();
  const hasDateOption =
    market.discussionOptions?.some((option) =>
      /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+\d{4}\b/i.test(
        option.label,
      ),
    ) ?? false;

  switch (filter) {
    case "bitcoin":
      return (
        /\bbitcoin\b|\bbtc\b/.test(haystack) ||
        haystack.includes("microstrategy")
      );
    case "ethereum":
      return (
        /\bethereum\b|\beth\b/.test(haystack) || haystack.includes("megaeth")
      );
    case "launches":
      return (
        haystack.includes("launch") ||
        haystack.includes("fdv") ||
        haystack.includes("token by")
      );
    case "deadlines":
      return (
        /\bwhen will\b/.test(haystack) ||
        /\bby\b/.test(haystack) ||
        hasDateOption
      );
    case "price-targets":
      return (
        haystack.includes("what price") ||
        haystack.includes("hit $") ||
        haystack.includes("all time high") ||
        /\$\d[\d,]*(?:\.\d+)?/.test(haystack)
      );
    default:
      return true;
  }
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
    {
      label: "Yes",
      price: 0.62,
      history: [] as Array<{ t: number; p: number }>,
    },
    {
      label: "No",
      price: 0.38,
      history: [] as Array<{ t: number; p: number }>,
    },
  ];
  const topOutcomes =
    rankedOutcomes.length >= 2 ? rankedOutcomes : fallbackOutcomes;
  const primarySeries =
    topOutcomes[0].history?.map((point) => point.p).filter(Number.isFinite) ??
    [];
  const secondarySeries =
    topOutcomes[1].history?.map((point) => point.p).filter(Number.isFinite) ??
    [];
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

const CARD_SHELL_CLASS =
  "rounded-[18px] border border-white/[0.07] bg-[#0a0a0a] transition-colors hover:border-white/[0.12] hover:bg-[#0d0d0f]";

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
      className={`block p-4 ${CARD_SHELL_CLASS}`}
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
          );
        })}
        {remainingCount > 0 && (
          <p className="pt-0.5 text-[14px] text-zinc-600">
            +{remainingCount} more
          </p>
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
      [
        now - (sparkline.length - 1 - index) * step,
        price,
      ] as WatchlistHistoryPoint,
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
    case "6M":
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
  const palette = [
    "#39c7d9",
    "#f08c67",
    "#e6cf57",
    "#c38ae6",
    "#ff5a66",
    "#5fd1a5",
  ];
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

    const missingCoins = coins.filter((coin) => !cachedSeries[coin.id]?.length);

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
      ? Math.round(
          hoverRatio * Math.max(hoverAnchorSeries.prices.length - 1, 0),
        )
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
    hoverIndex !== null
      ? (hoverAnchorSeries?.prices[hoverIndex]?.[0] ?? null)
      : null;
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
                          series.pctPoint >= 0
                            ? "text-emerald-400"
                            : "text-red-400"
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
              <div
                className={`text-right text-[14px] font-medium tabular-nums ${positive ? "text-emerald-400" : "text-red-400"}`}
              >
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

  const chip = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
  const positionChartCards = data.positions.slice(0, 6).map((position) => {
    const qty = Number(position.qty || 0);
    const avgEntry = Number(position.avg_entry_price || 0);
    const marketValue = Number(position.market_value || 0);
    const currentPrice = qty > 0 ? marketValue / qty : avgEntry;
    const deltaPct = Number(position.unrealized_plpc || 0);
    const positive = deltaPct >= 0;

    const start = avgEntry > 0 ? avgEntry : currentPrice;
    const end =
      Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : start;

    const sparkline =
      Number.isFinite(start) && Number.isFinite(end) && start > 0 && end > 0
        ? Array.from({ length: 24 }, (_, index) => {
            const t = index / 23;
            const base = start + (end - start) * t;
            const wave = Math.sin(t * Math.PI * 4) * start * 0.01;
            return Math.max(0.000001, base + wave * (positive ? 1 : -1));
          })
        : [];

    return {
      id: `${position.symbol}-${position.side}`,
      label: position.symbol,
      currentPrice,
      deltaPct,
      positive,
      sparkline,
    };
  });

  return (
    <div className={`w-full overflow-hidden ${CARD_SHELL_CLASS}`}>
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

      {positionChartCards.length > 0 && (
        <div className="px-3 py-3 border-t border-white/5">
          <p className="text-sm text-zinc-600 mb-2">Position Charts</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {positionChartCards.map((asset) => (
              <div
                key={asset.id}
                className="group bg-[#0a0a0a] border border-white/[0.07] rounded-xl hover:border-white/[0.14] hover:bg-[#111] transition-all overflow-hidden"
              >
                <div className="px-3.5 pt-3.5 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate leading-tight">
                        {asset.label}
                      </p>
                      <p className="text-sm text-zinc-500 mt-1 tabular-nums">
                        {fmt(asset.currentPrice)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`text-sm font-semibold flex items-center justify-end gap-0.5 ${
                          asset.positive ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {asset.positive ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {Math.abs(asset.deltaPct).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
                {asset.sparkline.length > 1 && (
                  <CardSparkline
                    data={asset.sparkline}
                    positive={asset.positive}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
    <div className={`px-4 py-3 ${CARD_SHELL_CLASS}`}>
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

function PortfolioPositionsTable({
  positions,
}: {
  positions: PortfolioPosition[];
}) {
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
        <div className="px-4 py-10 text-sm text-zinc-500">
          No open positions.
        </div>
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

interface PortfolioAllocationSlice {
  label: string;
  value: number;
  pct: number;
  color: string;
}

const PORTFOLIO_ALLOCATION_COLORS = [
  "#6475f3",
  "#5ad0c8",
  "#8b5cf6",
  "#facc15",
  "#f97316",
  "#94a3b8",
];

function buildPortfolioAllocationSlices(
  portfolioData: PortfolioData,
): PortfolioAllocationSlice[] {
  const sortedPositions = portfolioData.positions
    .map((position) => ({
      label: position.symbol.toUpperCase(),
      value: Math.abs(Number(position.market_value || 0)),
    }))
    .filter((entry) => Number.isFinite(entry.value) && entry.value > 0)
    .sort((a, b) => b.value - a.value);

  const baseSlices = sortedPositions.slice(0, 3);
  const otherPositionsValue = sortedPositions
    .slice(3)
    .reduce((sum, entry) => sum + entry.value, 0);

  if (otherPositionsValue > 0) {
    baseSlices.push({ label: "Other", value: otherPositionsValue });
  }

  if (portfolioData.summary.cash > 0) {
    baseSlices.push({ label: "Cash", value: portfolioData.summary.cash });
  }

  if (baseSlices.length === 0) {
    const fallbackValue = Math.max(portfolioData.summary.equity, 0);
    if (fallbackValue <= 0) return [];

    baseSlices.push({ label: "Portfolio", value: fallbackValue });
  }

  const total = baseSlices.reduce((sum, slice) => sum + slice.value, 0);

  return baseSlices.map((slice, index) => ({
    ...slice,
    pct: total > 0 ? (slice.value / total) * 100 : 0,
    color:
      PORTFOLIO_ALLOCATION_COLORS[index % PORTFOLIO_ALLOCATION_COLORS.length],
  }));
}

function PortfolioAllocationDonut({
  slices,
  total,
}: {
  slices: PortfolioAllocationSlice[];
  total: number;
}) {
  if (slices.length === 0) {
    return (
      <div className="flex h-[140px] w-[140px] items-center justify-center rounded-full border border-white/[0.08] text-[11px] text-zinc-500">
        No allocation data
      </div>
    );
  }

  const options = {
    chart: {
      type: "donut" as const,
      background: "transparent",
      animations: { enabled: false },
    },
    colors: slices.map((slice) => slice.color),
    labels: slices.map((slice) => slice.label),
    legend: { show: false },
    dataLabels: { enabled: false },
    stroke: { width: 0 },
    tooltip: { enabled: false },
    plotOptions: {
      pie: {
        donut: {
          size: "68%",
          labels: {
            show: true,
            name: { show: false },
            value: { show: false },
            total: {
              show: true,
              showAlways: true,
              label: "Total",
              color: "#a1a1aa",
              fontSize: "11px",
              formatter: () => fmtBig(total),
            },
          },
        },
      },
    },
  };

  return (
    <ReactApexChart
      type="donut"
      series={slices.map((slice) => Number(slice.value.toFixed(2)))}
      options={options}
      width={140}
      height={140}
    />
  );
}

const TOP_SOCIAL_MENTION_POSTS: SocialMentionPost[] = [
  {
    authorName: "Anichess",
    authorHandle: "@AnichessGame",
    authorAvatar:
      "https://pbs.twimg.com/profile_images/2008582267493310464/OhIRrwTO_normal.jpg",
    followers: 218129,
    verified: true,
    text: "CHECK Tuesday  Chess\n\nEthernal holders, Season 6 players, Kaito creators & Checkmate Reign participants, you can now claim your $CHECK rewards.\n\nOfficial link: https://anichess.com/checkmate-claim/\nClaim is live for 7 days.\n\nGo on, brag in comments.",
    url: "https://x.com/AnichessGame/status/2033858560245879107",
    publishTime: 1773744642,
    views: 10171,
    likes: 85,
    replies: 53,
    reposts: 16,
    tokenName: "Checkmate",
    tokenLogo: "https://s2.coinmarketcap.com/static/img/coins/64x64/38926.png",
    platform: "base",
    mediaUrls: [],
  },
  {
    authorName: "Anichess",
    authorHandle: "@AnichessGame",
    authorAvatar:
      "https://pbs.twimg.com/profile_images/2008582267493310464/OhIRrwTO_normal.jpg",
    followers: 218129,
    verified: true,
    text: "960 Void Vanguards drop tomorrow\n\nEach one carries $CHECK unlocking January 23, 2027. Some carry 500,000 but the math is your business.\n\nAirdropped to everyone who sent their Ethernal to the Void, with the rest available on OpenSea.",
    url: "https://x.com/AnichessGame/status/2037152129924665638",
    publishTime: 1774529890,
    views: 6866,
    likes: 198,
    replies: 139,
    reposts: 48,
    tokenName: "Checkmate",
    tokenLogo: "https://s2.coinmarketcap.com/static/img/coins/64x64/38926.png",
    platform: "base",
    mediaUrls: [],
  },
  {
    authorName: "Ignas | DeFi",
    authorHandle: "@DefiIgnas",
    authorAvatar:
      "https://pbs.twimg.com/profile_images/1572199012790603778/GF4NXSKr_normal.jpg",
    followers: 159354,
    verified: true,
    text: "$STABLE is a scam that only works because it rides the corpo slop/stablecoin payment narrative.\n\nAnd they pretend to be Tempo or Plasma so some degen traders might get confused on which token to buy.\n\nYou can put lipstick on a pig, but it's still a pig.\n\nIt raised $28M seed in July 2025 and trades at $2.65B FDV on a $562M MC and only goes up to trap and rekt shorters.",
    url: "https://x.com/DefiIgnas/status/2037563489938485478",
    publishTime: 1774627966,
    views: 34820,
    likes: 260,
    replies: 56,
    reposts: 13,
    tokenName: "STABLE",
    tokenLogo: "https://s2.coinmarketcap.com/static/img/coins/64x64/38892.png",
    platform: "bsc",
    mediaUrls: [
      "https://pbs.twimg.com/media/HEbgBALWQAAujWw.jpg",
      "https://pbs.twimg.com/media/HEbgjlda4AEDVjG.jpg",
    ],
  },
  {
    authorName: "SolanaSniperX",
    authorHandle: "@drdeepSOL",
    authorAvatar:
      "https://pbs.twimg.com/profile_images/2016431318402228224/ASHT21J-_normal.jpg",
    followers: 11478,
    verified: true,
    text: "Claimed $CHECK from the Checkmate Reign drop.\n\nAs a Kaito creator, I appreciate when ecosystem participation translates into distribution.",
    url: "https://x.com/drdeepSOL/status/2034237902025039939",
    publishTime: 1773835084,
    views: 817,
    likes: 79,
    replies: 22,
    reposts: 21,
    tokenName: "Checkmate",
    tokenLogo: "https://s2.coinmarketcap.com/static/img/coins/64x64/38926.png",
    platform: "base",
    mediaUrls: ["https://pbs.twimg.com/media/HDsJAyJXIAAb9DV.png"],
  },
  {
    authorName: "1Minute KR",
    authorHandle: "@ONEMINNFT",
    authorAvatar:
      "https://pbs.twimg.com/profile_images/2019910500331749376/nQr6ehVP_normal.jpg",
    followers: 108527,
    verified: false,
    text: "Stable is building the payment rail for the Agentic Era and honestly, this feels inevitable\n\nCitrini's Agentic Utilities report basically spells it out: agents break on payment complexity.\n\n$STABLE removes that entirely, USDT for gas + settlement, one token, no swaps, no volatility.",
    url: "https://x.com/ONEMINNFT/status/2037571315822215287",
    publishTime: 1774629832,
    views: 12598,
    likes: 53,
    replies: 24,
    reposts: 8,
    tokenName: "STABLE",
    tokenLogo: "https://s2.coinmarketcap.com/static/img/coins/64x64/38892.png",
    platform: "bsc",
    mediaUrls: [],
  },
  {
    authorName: "Polkaguy.eth",
    authorHandle: "@polkaguy",
    authorAvatar:
      "https://pbs.twimg.com/profile_images/2038838260517212160/oSX0bveb_normal.jpg",
    followers: 32376,
    verified: true,
    text: "Big move from Bitpanda. They're building Vision Chain with Optimism, and $VSN powers the whole network.",
    url: "https://x.com/polkaguy/status/2036759220729581964",
    publishTime: 1774436214,
    views: 4682,
    likes: 119,
    replies: 51,
    reposts: 4,
    tokenName: "Vision",
    tokenLogo: "https://s2.coinmarketcap.com/static/img/coins/64x64/37322.png",
    platform: "arbitrum",
    mediaUrls: [],
  },
  {
    authorName: "Kevin Lee",
    authorHandle: "@0xKevinRich",
    authorAvatar:
      "https://pbs.twimg.com/profile_images/2017263252258910208/X_z3uk8Y_normal.jpg",
    followers: 208609,
    verified: true,
    text: "$JUP eligibility is in the works right now\n\nEvery Perps trade. Every Lend interaction. Every swap.\n\nJupiter saw it all. Snapshot's complete.\n\nFinal Jupuary = last chance. 200M JUP for active users. 200M for stakers.",
    url: "https://x.com/0xKevinRich/status/2030647144009338981",
    publishTime: 1772978981,
    views: 0,
    likes: 0,
    replies: 0,
    reposts: 0,
    tokenName: "STABLE",
    tokenLogo: "https://s2.coinmarketcap.com/static/img/coins/64x64/38892.png",
    platform: "bsc",
    mediaUrls: ["https://pbs.twimg.com/media/HC5OzhTawAAx_nz.jpg"],
  },
  {
    authorName: "Anichess",
    authorHandle: "@AnichessGame",
    authorAvatar:
      "https://pbs.twimg.com/profile_images/2008582267493310464/OhIRrwTO_normal.jpg",
    followers: 218129,
    verified: true,
    text: "Introducing http://alibae.build, a new layer to the Anichess ecosystem.\n\nIt is a build-and-earn platform where creators use AI tools to produce contents, then earn $CHECK based on how that work performs.\n\nA second entry point into the Checkmate ecosystem.\n\nLearn more below.",
    url: "https://x.com/AnichessGame/status/2038819875578405352",
    publishTime: 1774927512,
    views: 7437,
    likes: 57,
    replies: 16,
    reposts: 24,
    tokenName: "Checkmate",
    tokenLogo: "https://s2.coinmarketcap.com/static/img/coins/64x64/38926.png",
    platform: "base",
    mediaUrls: ["https://pbs.twimg.com/media/HEtXaWIbgAAsJ-a.jpg"],
  },
  {
    authorName: "Portal",
    authorHandle: "@Portalcoin",
    authorAvatar:
      "https://pbs.twimg.com/profile_images/1907726062672343040/WNgZ0jOT_normal.jpg",
    followers: 289432,
    verified: true,
    text: "The $PORTAL - $CHECK pool on AerodromeFi is live.\n\nPortal and Anichess are aligned on the future of gaming and committed to building for the long game.",
    url: "https://x.com/Portalcoin/status/2035002644700205472",
    publishTime: 1774017413,
    views: 7458,
    likes: 126,
    replies: 11,
    reposts: 18,
    tokenName: "Checkmate",
    tokenLogo: "https://s2.coinmarketcap.com/static/img/coins/64x64/38926.png",
    platform: "base",
    mediaUrls: ["https://pbs.twimg.com/media/HD3HDS1WgAA959I.jpg"],
  },
  {
    authorName: "Anichess",
    authorHandle: "@AnichessGame",
    authorAvatar:
      "https://pbs.twimg.com/profile_images/2008582267493310464/OhIRrwTO_normal.jpg",
    followers: 218129,
    verified: true,
    text: "CHECK your wallets, W1 of Anichess Season 7 rewards are here.\n\n339K $CHECK and 1.19M M8 were distributed to leaderboard players, random arena players, mission completions, rebates, and referrals.\n\nThe leaderboard is reset. Don't fade Checkmate.",
    url: "https://x.com/AnichessGame/status/2036039619326718088",
    publishTime: 1774264647,
    views: 3777,
    likes: 53,
    replies: 14,
    reposts: 15,
    tokenName: "Checkmate",
    tokenLogo: "https://s2.coinmarketcap.com/static/img/coins/64x64/38926.png",
    platform: "base",
    mediaUrls: [],
  },
];

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
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [deepResearchMode, setDeepResearchMode] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<
    ChatAttachmentPayload[]
  >([]);
  const [showChat, setShowChat] = useState(false);
  const [predictionSearch, setPredictionSearch] = useState("");
  const [predictionFilter, setPredictionFilter] =
    useState<PredictionBrowseFilter>("all");
  const [alertsMode, setAlertsMode] = useState<AlertsMode>("price");
  const [alertChannel, setAlertChannel] = useState<string>("Email");
  const [alertAssetSearch, setAlertAssetSearch] = useState<string>("BTC");
  const [alertDirection, setAlertDirection] = useState<"above" | "below">(
    "above",
  );
  const [alertTargetPrice, setAlertTargetPrice] = useState<string>("");
  const [alertExchange, setAlertExchange] = useState<string>("Coinbase");
  const [alertPercentageDirection, setAlertPercentageDirection] = useState<
    "up" | "down"
  >("up");
  const [alertPercentageChange, setAlertPercentageChange] =
    useState<string>("");
  const [alertPercentageWindow, setAlertPercentageWindow] =
    useState<string>("5 min");
  const [alertPeriodicInterval, setAlertPeriodicInterval] =
    useState<string>("1 hour");
  const [alertVolumeMultiple, setAlertVolumeMultiple] = useState<string>("5x");
  const [alertVolumeWindow, setAlertVolumeWindow] = useState<string>("5 min");
  const [watchlistAssetIds, setWatchlistAssetIds] = useState<string[]>([
    ...DEFAULT_WATCHLIST_ASSET_IDS,
  ]);
  const [watchlistModalOpen, setWatchlistModalOpen] = useState(false);
  const [watchlistDraftIds, setWatchlistDraftIds] = useState<string[]>([
    ...DEFAULT_WATCHLIST_ASSET_IDS,
  ]);
  const [watchlistRevision, setWatchlistRevision] = useState(0);
  const [watchlistAssetSearch, setWatchlistAssetSearch] = useState("");
  const [watchlistNews, setWatchlistNews] = useState<NewsItem[]>([]);
  const [watchlistNewsLoading, setWatchlistNewsLoading] = useState(false);
  const [trendingNews, setTrendingNews] = useState<NewsItem[]>([]);
  const [trendingNewsLoading, setTrendingNewsLoading] = useState(false);
  const [riskAnalysisNewsBySymbol, setRiskAnalysisNewsBySymbol] = useState<
    Record<string, NewsItem[]>
  >({});
  const [riskAnalysisNewsLoading, setRiskAnalysisNewsLoading] = useState(false);
  const [allocationSimulatorTargets, setAllocationSimulatorTargets] =
    useState<AllocationSimulatorWeights>({});
  const [
    allocationSimulatorAppliedTargets,
    setAllocationSimulatorAppliedTargets,
  ] = useState<AllocationSimulatorWeights>({});
  const [allocationSimulatorTouched, setAllocationSimulatorTouched] =
    useState(false);
  const [allocationSimulationLoading, setAllocationSimulationLoading] =
    useState(false);
  const [allocationSimulationResult, setAllocationSimulationResult] =
    useState<AllocationSimulationResult | null>(null);
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(
    null,
  );
  const [portfolioGateReady, setPortfolioGateReady] = useState(false);
  const [portfolioConnected, setPortfolioConnected] = useState(false);
  const [portfolioRouteLoading, setPortfolioRouteLoading] = useState(false);
  const [portfolioRouteError, setPortfolioRouteError] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<"gainers" | "losers">("gainers");
  const [marketLeadersTab, setMarketLeadersTab] = useState<"up" | "down">("up");
  const [marketLeadersPage, setMarketLeadersPage] = useState(0);
  const [highVolumePage, setHighVolumePage] = useState(0);
  const [showTradingModal, setShowTradingModal] = useState(false);
  const hasUserMessages = messages.some((message) => message.role === "user");
  const composerPlaceholder = hasUserMessages
    ? "ask follow up question"
    : "Ask about crypto, stocks, prices, trends ...";
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerMenuRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const homeSectionRef = useRef<HTMLDivElement>(null);
  const predictionsSectionRef = useRef<HTMLElement>(null);
  const watchlistDraftIdsRef = useRef<string[]>(watchlistDraftIds);
  const allocationAutoAnalyzeTriggeredRef = useRef(false);
  const deferredPredictionSearch = useDeferredValue(predictionSearch);

  const fetchData = useCallback(
    async (silent = false) => {
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
    },
    [pathname],
  );

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => fetchData(true), 60_000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const fetchPortfolioRouteData = useCallback(
    async (silent = false) => {
      if (
        (pathname !== "/portfolio" && pathname !== "/risk-analysis") ||
        !portfolioConnected
      )
        return;

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
    },
    [pathname, portfolioConnected],
  );

  useEffect(() => {
    if (
      (pathname !== "/portfolio" && pathname !== "/risk-analysis") ||
      !portfolioGateReady ||
      !portfolioConnected
    ) {
      return;
    }

    void fetchPortfolioRouteData();
    const timer = setInterval(() => {
      void fetchPortfolioRouteData(true);
    }, 60_000);

    return () => clearInterval(timer);
  }, [
    fetchPortfolioRouteData,
    pathname,
    portfolioConnected,
    portfolioGateReady,
  ]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(
        PORTFOLIO_CONNECTED_STORAGE_KEY,
      );
      setPortfolioConnected(stored === "1");
    } catch {
      setPortfolioConnected(false);
    } finally {
      setPortfolioGateReady(true);
    }
  }, []);

  useEffect(() => {
    if (showChat) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showChat]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!composerMenuRef.current) return;
      if (
        event.target instanceof Node &&
        !composerMenuRef.current.contains(event.target)
      ) {
        setComposerMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  useEffect(() => {
    try {
      const storedWatchlist = window.localStorage.getItem(
        "truemarkets-watchlist-assets",
      );
      if (!storedWatchlist) return;

      const parsed = JSON.parse(storedWatchlist) as string[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;

      setWatchlistAssetIds(parsed);
      setWatchlistDraftIds(parsed);
    } catch {
      // Ignore invalid local watchlist state and fall back to defaults.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "truemarkets-watchlist-assets",
      JSON.stringify(watchlistAssetIds),
    );
  }, [watchlistAssetIds]);

  useEffect(() => {
    watchlistDraftIdsRef.current = watchlistDraftIds;
  }, [watchlistDraftIds]);

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
      if (streaming) return;

      const attachmentsForRequest = pendingAttachments;
      const deepResearchForRequest = deepResearchMode;
      const hasAttachments = attachmentsForRequest.length > 0;
      if (!text && !hasAttachments) return;

      const effectiveText =
        text || "Please analyze the uploaded files and summarize key insights.";

      const latestPortfolio = [...messages]
        .reverse()
        .find((m) => m.portfolio)?.portfolio;
      const portfolioContext = buildPortfolioContext(latestPortfolio);
      const newsContext = buildNewsContext(messages);

      setQuery("");
      setPendingAttachments([]);
      setComposerMenuOpen(false);
      setShowChat(true);
      setStreaming(true);

      const userId = makeMessageId();
      const assistantId = makeMessageId();

      setMessages((prev) => [
        ...prev,
        {
          id: userId,
          role: "user",
          content:
            effectiveText +
            (deepResearchForRequest ? "\n\n[Deep Research enabled]" : "") +
            (hasAttachments
              ? `\n\n[Attached: ${attachmentsForRequest
                  .map((attachment) => attachment.name)
                  .join(", ")}]`
              : ""),
        },
        { id: assistantId, role: "assistant", content: "" },
      ]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: effectiveText,
            portfolioContext,
            newsContext,
            deepResearch: deepResearchForRequest,
            attachments: attachmentsForRequest,
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
              userText: effectiveText,
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
              userText: effectiveText,
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
            userText: effectiveText,
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
    [
      coins,
      deepResearchMode,
      enrichAssistantMessage,
      messages,
      pendingAttachments,
      streaming,
      updateMessage,
    ],
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/chat?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const removePendingAttachment = useCallback((name: string) => {
    setPendingAttachments((prev) =>
      prev.filter((attachment) => attachment.name !== name),
    );
  }, []);

  const handleFilesSelected = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const selected = Array.from(files).slice(0, MAX_CHAT_ATTACHMENTS);
    const parsedAttachments = await Promise.all(
      selected.map(async (file): Promise<ChatAttachmentPayload> => {
        if (file.type.startsWith("image/")) {
          const imageDataUrl = await readFileAsDataUrl(file);
          return {
            name: file.name,
            mimeType: file.type || "image/*",
            kind: "image",
            size: file.size,
            imageDataUrl,
          };
        }

        if (isTextLikeFile(file)) {
          const textContent = (await file.text()).slice(
            0,
            MAX_ATTACHMENT_TEXT_CHARS,
          );
          return {
            name: file.name,
            mimeType: file.type || "text/plain",
            kind: "text",
            size: file.size,
            textContent,
          };
        }

        return {
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          kind: "binary",
          size: file.size,
        };
      }),
    );

    setPendingAttachments((prev) => {
      const existingNames = new Set(prev.map((item) => item.name));
      const deduped = parsedAttachments.filter(
        (item) => !existingNames.has(item.name),
      );
      return [...prev, ...deduped].slice(0, MAX_CHAT_ATTACHMENTS);
    });
  }, []);

  const openUploadPicker = useCallback(() => {
    setComposerMenuOpen(false);
    fileInputRef.current?.click();
  }, []);

  const enableDeepResearch = useCallback(() => {
    setDeepResearchMode(true);
    setComposerMenuOpen(false);
  }, []);

  const handleComposerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() && pendingAttachments.length === 0) return;

    const pendingRequest = {
      query,
      deepResearch: deepResearchMode,
      attachments: pendingAttachments,
    };

    try {
      window.sessionStorage.setItem(
        PENDING_CHAT_REQUEST_STORAGE_KEY,
        JSON.stringify(pendingRequest),
      );
    } catch {
      toast("Could not cache attachments. Opening chat with your text only.");
      if (query.trim()) {
        router.push(`/chat?q=${encodeURIComponent(query.trim())}`);
        return;
      }
    }

    setComposerMenuOpen(false);
    router.push("/chat");
  };

  const addWatchlistAsset = useCallback((assetId: string) => {
    setWatchlistDraftIds((prev) =>
      prev.includes(assetId) ? prev : [...prev, assetId],
    );
  }, []);

  const removeWatchlistAsset = useCallback((assetId: string) => {
    setWatchlistDraftIds((prev) => prev.filter((id) => id !== assetId));
  }, []);

  const openWatchlistModal = useCallback(() => {
    setWatchlistDraftIds(watchlistAssetIds);
    setWatchlistAssetSearch("");
    setWatchlistModalOpen(true);
  }, [watchlistAssetIds]);

  const handleConnectPortfolio = useCallback(() => {
    try {
      window.localStorage.setItem(PORTFOLIO_CONNECTED_STORAGE_KEY, "1");
    } catch {
      // Ignore localStorage failures and still continue in-memory for this session.
    }

    setPortfolioConnected(true);
  }, []);

  const handleSetAlert = useCallback(() => {
    toast("Coming Soon");
  }, []);

  const saveWatchlistAssets = useCallback(() => {
    const nextWatchlist = Array.from(new Set(watchlistDraftIdsRef.current));
    if (nextWatchlist.length === 0) return;

    setWatchlistAssetIds(nextWatchlist);
    setWatchlistDraftIds(nextWatchlist);
    setWatchlistRevision((prev) => prev + 1);
    setWatchlistModalOpen(false);
  }, []);

  useEffect(() => {
    if (loading) return;

    if (pathname === "/predictions") {
      predictionsSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }

    if (
      pathname === "/" ||
      pathname === "/watchlist" ||
      pathname === "/alerts" ||
      pathname === "/portfolio" ||
      pathname === "/trending"
    ) {
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
  const filteredPredictionMarkets = prioritizedDiscussionMarkets.filter(
    (market) => {
      const needle = deferredPredictionSearch.trim().toLowerCase();
      if (!matchesPredictionBrowseFilter(market, predictionFilter))
        return false;
      if (!needle) return true;

      const haystacks = [
        market.question ?? "",
        ...(market.discussionOptions?.map((option) => option.label) ?? []),
      ]
        .join(" ")
        .toLowerCase();

      return haystacks.includes(needle);
    },
  );
  const visiblePredictionFilters = PREDICTION_BROWSE_FILTERS.filter(
    (filter) =>
      filter.key === "all" ||
      prioritizedDiscussionMarkets.some((market) =>
        matchesPredictionBrowseFilter(market, filter.key),
      ),
  );
  const topDiscussionMarkets = prioritizedDiscussionMarkets.slice(0, 2);
  const bitcoin = coins.find((coin) => coin.id === "bitcoin");
  const ethereum = coins.find((coin) => coin.id === "ethereum");
  const solana = coins.find((coin) => coin.id === "solana");
  const alertSelectableCoins = [...coins].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const normalizedAlertAssetNeedle = alertAssetSearch.trim().toLowerCase();
  const alertsAsset =
    alertSelectableCoins.find(
      (coin) =>
        coin.symbol.toLowerCase() === normalizedAlertAssetNeedle ||
        coin.id.toLowerCase() === normalizedAlertAssetNeedle ||
        coin.name.toLowerCase() === normalizedAlertAssetNeedle,
    ) ??
    coins.find((coin) => coin.id === "bitcoin") ??
    coins[0];
  const alertsAssetSymbol =
    alertsAsset?.symbol?.toUpperCase() ||
    alertAssetSearch.trim().toUpperCase() ||
    "BTC";
  const solDominancePct =
    globalData && solana && globalData.total_market_cap.usd > 0
      ? (solana.market_cap / globalData.total_market_cap.usd) * 100
      : null;
  const watchlistCoins = watchlistAssetIds
    .map((assetId) => coins.find((coin) => coin.id === assetId))
    .filter((coin): coin is CoinData => Boolean(coin));
  const watchlistSelectableCoins = alertSelectableCoins;
  const watchlistSearchNeedle = watchlistAssetSearch.trim().toLowerCase();
  const watchlistFilteredChoices = watchlistSelectableCoins.filter((coin) => {
    if (!watchlistSearchNeedle) return !watchlistDraftIds.includes(coin.id);

    const haystack = `${coin.name} ${coin.symbol}`.toLowerCase();
    return (
      haystack.includes(watchlistSearchNeedle) &&
      !watchlistDraftIds.includes(coin.id)
    );
  });
  const watchlistDraftCoins = watchlistDraftIds
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
  const marketLeaders =
    marketLeadersTab === "up" ? surgingUpCoins : surgingDownCoins;
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
      Math.abs(b.price_change_percentage_24h ?? 0) -
      Math.abs(a.price_change_percentage_24h ?? 0),
  );
  const watchlistMoversKey = `${watchlistRevision}:${watchlistMovers
    .map((coin) => coin.id)
    .join("|")}`;
  const notablePriceMovers = watchlistMovers.slice(0, 3);
  const trendingCoins = [...coins]
    .sort((a, b) => {
      const scoreA =
        Math.abs(get1hChange(a)) * 0.45 +
        Math.abs(a.price_change_percentage_24h) * 0.35 +
        Math.abs(get7dChange(a)) * 0.1 +
        Math.min(10, getVolumeAdvMultiple(a) * 8) * 0.1;
      const scoreB =
        Math.abs(get1hChange(b)) * 0.45 +
        Math.abs(b.price_change_percentage_24h) * 0.35 +
        Math.abs(get7dChange(b)) * 0.1 +
        Math.min(10, getVolumeAdvMultiple(b) * 8) * 0.1;
      return scoreB - scoreA;
    })
    .slice(0, 12);
  const watchlistNewsQuery = watchlistCoins
    .map((coin) => coin.name)
    .slice(0, 5)
    .join(" OR ");
  const trendingNewsQuery = trendingCoins
    .slice(0, 5)
    .map((coin) => coin.name)
    .join(" OR ");
  const riskAnalysisNewsSymbols = Array.from(
    new Set(
      (portfolioData?.positions ?? [])
        .map((position) => position.symbol?.trim().toUpperCase())
        .filter((symbol): symbol is string => Boolean(symbol)),
    ),
  );
  const riskAnalysisNewsSymbolsKey = riskAnalysisNewsSymbols.join("|");

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

  useEffect(() => {
    if (pathname !== "/trending" || !trendingNewsQuery) {
      setTrendingNews([]);
      setTrendingNewsLoading(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setTrendingNewsLoading(true);

      try {
        const response = await fetch(
          `/api/news?q=${encodeURIComponent(trendingNewsQuery)}`,
        );
        const payload = (await response.json()) as { items?: NewsItem[] };

        if (!cancelled) {
          setTrendingNews(payload.items ?? []);
        }
      } catch {
        if (!cancelled) {
          setTrendingNews([]);
        }
      } finally {
        if (!cancelled) {
          setTrendingNewsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [pathname, trendingNewsQuery]);

  useEffect(() => {
    if (
      pathname !== "/risk-analysis" ||
      !portfolioGateReady ||
      !portfolioConnected ||
      riskAnalysisNewsSymbols.length === 0
    ) {
      setRiskAnalysisNewsBySymbol({});
      setRiskAnalysisNewsLoading(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setRiskAnalysisNewsLoading(true);

      try {
        const entries = await Promise.all(
          riskAnalysisNewsSymbols.map(async (symbol) => {
            try {
              const response = await fetch(
                `/api/news?q=${encodeURIComponent(symbol)}&limit=30`,
              );
              const payload = (await response.json()) as { items?: NewsItem[] };
              return [symbol, payload.items ?? []] as const;
            } catch {
              return [symbol, []] as const;
            }
          }),
        );

        if (!cancelled) {
          setRiskAnalysisNewsBySymbol(Object.fromEntries(entries));
        }
      } finally {
        if (!cancelled) {
          setRiskAnalysisNewsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    pathname,
    portfolioGateReady,
    portfolioConnected,
    riskAnalysisNewsSymbolsKey,
    riskAnalysisNewsSymbols.length,
  ]);

  const topSocialMentionPosts = TOP_SOCIAL_MENTION_POSTS;

  const movers = activeTab === "gainers" ? gainers : losers;
  const moverRows = movers;
  const sentimentDisplayLabel =
    sentiment?.label.replace(/\s+Sentiment$/i, "") ?? "";
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
        bitcoin.price_change_percentage_24h >= 0
          ? "pushes higher"
          : "pulls back"
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

  const portfolioAllocationSlices = portfolioData
    ? buildPortfolioAllocationSlices(portfolioData)
    : [];
  const portfolioNetWorthChange = portfolioData?.summary.day_pnl ?? 0;
  const portfolioNetWorthChangePct = portfolioData?.summary.day_pnl_pct ?? 0;
  const portfolioLiabilities = portfolioData
    ? Math.max(
        0,
        portfolioData.summary.buying_power - portfolioData.summary.equity,
      )
    : 0;
  const riskAnalysisAssetCards = (portfolioData?.positions ?? []).map(
    (position) => {
      const qty = Number(position.qty || 0);
      const avgEntry = Number(position.avg_entry_price || 0);
      const marketValue = Number(position.market_value || 0);
      const currentPrice = qty > 0 ? marketValue / qty : avgEntry;
      const deltaPct = Number(position.unrealized_plpc || 0);
      const intradayMovePct = Number(position.unrealized_intraday_plpc);
      const notableMovePct = Number.isFinite(intradayMovePct)
        ? intradayMovePct
        : deltaPct;
      const positive = notableMovePct >= 0;

      const start = avgEntry > 0 ? avgEntry : currentPrice;
      const end =
        Number.isFinite(currentPrice) && currentPrice > 0
          ? currentPrice
          : start;

      const sparkline =
        Number.isFinite(start) && Number.isFinite(end) && start > 0 && end > 0
          ? Array.from({ length: 24 }, (_, index) => {
              const t = index / 23;
              const base = start + (end - start) * t;
              const wave = Math.sin(t * Math.PI * 4) * start * 0.01;
              return Math.max(0.000001, base + wave * (positive ? 1 : -1));
            })
          : [];

      return {
        id: `${position.symbol}-${position.side}`,
        symbol: position.symbol,
        qty,
        marketValue,
        currentPrice,
        notableMovePct,
        positive,
        sparkline,
      };
    },
  );

  const portfolioSimulatorSymbols = (() => {
    const rows = (portfolioData?.positions ?? [])
      .map((position) => ({
        symbol: normalizePortfolioSymbol(position.symbol),
        allocationPct: Math.max(0, Number(position.allocation_pct || 0)),
      }))
      .filter((row) => row.symbol.length > 0);

    const allocationBySymbol = new Map<string, number>();
    for (const row of rows) {
      allocationBySymbol.set(
        row.symbol,
        (allocationBySymbol.get(row.symbol) ?? 0) + row.allocationPct,
      );
    }

    return [...allocationBySymbol.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([symbol]) => symbol);
  })();

  const simulatorCurrentAllocations = Object.fromEntries(
    portfolioSimulatorSymbols.map((symbol) => {
      const allocationPct = (portfolioData?.positions ?? []).reduce(
        (sum, position) => {
          if (normalizePortfolioSymbol(position.symbol) !== symbol) return sum;
          return sum + Math.max(0, Number(position.allocation_pct || 0));
        },
        0,
      );

      return [symbol, Number(allocationPct.toFixed(1))] as const;
    }),
  ) as AllocationSimulatorWeights;

  const coinBySymbol = new Map(
    coins.map((coin) => [coin.symbol.toUpperCase(), coin] as const),
  );
  const assetCardByBaseSymbol = new Map(
    riskAnalysisAssetCards.map((asset) => [
      normalizePortfolioSymbol(asset.symbol),
      asset,
    ]),
  );

  const positionRiskRows = (portfolioData?.positions ?? []).map((position) => {
    const expectedReturnPct = Number(position.unrealized_plpc || 0);
    const intradayMovePct = Number(position.unrealized_intraday_plpc || 0);

    return {
      baseSymbol: normalizePortfolioSymbol(position.symbol),
      allocationPct: Math.max(0, Number(position.allocation_pct || 0)),
      expectedReturnPct: Number.isFinite(expectedReturnPct)
        ? expectedReturnPct
        : 0,
      fallbackVolatilityPct: Math.max(10, Math.abs(intradayMovePct) * 4.5),
      fallbackMaxDrawdownPct: -Math.max(8, Math.abs(intradayMovePct) * 6),
    };
  });

  const trackedAssetMetrics = portfolioSimulatorSymbols.map((symbol) => {
    const matchingRows = positionRiskRows.filter(
      (row) => row.baseSymbol === symbol,
    );
    const totalMatchingAllocation = matchingRows.reduce(
      (sum, row) => sum + row.allocationPct,
      0,
    );

    const rowExpectedReturn =
      totalMatchingAllocation > 0
        ? matchingRows.reduce(
            (sum, row) => sum + row.expectedReturnPct * row.allocationPct,
            0,
          ) / totalMatchingAllocation
        : null;
    const rowVolatility =
      totalMatchingAllocation > 0
        ? matchingRows.reduce(
            (sum, row) => sum + row.fallbackVolatilityPct * row.allocationPct,
            0,
          ) / totalMatchingAllocation
        : null;
    const rowDrawdown =
      totalMatchingAllocation > 0
        ? matchingRows.reduce(
            (sum, row) => sum + row.fallbackMaxDrawdownPct * row.allocationPct,
            0,
          ) / totalMatchingAllocation
        : null;

    const coin = coinBySymbol.get(symbol);
    const sparkline =
      coin?.sparkline_in_7d?.price ??
      assetCardByBaseSymbol.get(symbol)?.sparkline ??
      [];

    const impliedReturnPct = Number.isFinite(
      coin?.price_change_percentage_7d_in_currency,
    )
      ? Number(coin?.price_change_percentage_7d_in_currency)
      : (rowExpectedReturn ?? 0);
    const impliedVolatilityPct = computeSeriesVolatilityPct(sparkline);
    const impliedDrawdownPct = computeSeriesMaxDrawdownPct(sparkline);
    const volatilityPct =
      impliedVolatilityPct > 0
        ? impliedVolatilityPct
        : (rowVolatility ?? Math.max(10, Math.abs(impliedReturnPct) * 1.4));
    const maxDrawdownPct =
      impliedDrawdownPct < 0
        ? impliedDrawdownPct
        : (rowDrawdown ?? -Math.max(8, Math.abs(impliedReturnPct) * 1.2));
    const sharpe = volatilityPct > 0 ? impliedReturnPct / volatilityPct : 0;

    return {
      symbol,
      currentAllocationPct: simulatorCurrentAllocations[symbol] ?? 0,
      metrics: {
        expectedReturnPct: impliedReturnPct,
        volatilityPct,
        maxDrawdownPct,
        sharpe,
      },
    };
  });

  const trackedCurrentWeights = trackedAssetMetrics.reduce((acc, asset) => {
    acc[asset.symbol] = asset.currentAllocationPct;
    return acc;
  }, {} as AllocationSimulatorWeights);

  const trackedMetricsBySymbol = trackedAssetMetrics.reduce(
    (acc, asset) => {
      acc[asset.symbol] = asset.metrics;
      return acc;
    },
    {} as Record<string, PortfolioRiskMetrics>,
  );

  const trackedSymbolSet = new Set(portfolioSimulatorSymbols);

  const untrackedPositionRows = positionRiskRows.filter(
    (row) => !trackedSymbolSet.has(row.baseSymbol),
  );
  const otherAssetMetrics =
    untrackedPositionRows.length > 0
      ? buildWeightedRiskMetrics(
          untrackedPositionRows.map((row) => ({
            weightPct: row.allocationPct,
            metrics: {
              expectedReturnPct: row.expectedReturnPct,
              volatilityPct: row.fallbackVolatilityPct,
              maxDrawdownPct: row.fallbackMaxDrawdownPct,
              sharpe:
                row.fallbackVolatilityPct > 0
                  ? row.expectedReturnPct / row.fallbackVolatilityPct
                  : 0,
            },
          })),
        )
      : {
          expectedReturnPct: 0,
          volatilityPct: 16,
          maxDrawdownPct: -10,
          sharpe: 0,
        };
  const cashMetrics: PortfolioRiskMetrics = {
    expectedReturnPct: 0,
    volatilityPct: 1,
    maxDrawdownPct: 0,
    sharpe: 0,
  };

  const currentTrackedTotal = portfolioSimulatorSymbols.reduce(
    (sum, symbol) => sum + trackedCurrentWeights[symbol],
    0,
  );
  const totalPositionAllocationPct = portfolioData
    ? Math.min(
        100,
        Math.max(
          0,
          (portfolioData.positions ?? []).reduce(
            (sum, position) =>
              sum + Math.max(0, Number(position.allocation_pct || 0)),
            0,
          ),
        ),
      )
    : Math.min(100, currentTrackedTotal);
  const currentOtherWeightPct = Math.max(
    0,
    totalPositionAllocationPct - currentTrackedTotal,
  );
  const currentCashWeightPct = Math.max(0, 100 - totalPositionAllocationPct);

  const rawDraftTotal = portfolioSimulatorSymbols.reduce(
    (sum, symbol) => sum + Math.max(0, allocationSimulatorTargets[symbol] ?? 0),
    0,
  );
  const normalizedDraftTargets = normalizeAllocationTargets(
    allocationSimulatorTargets,
    portfolioSimulatorSymbols,
  );
  const allocationSimulationPending =
    portfolioSimulatorSymbols.length > 0 &&
    !hasSameAllocationWeights(
      allocationSimulatorAppliedTargets,
      normalizedDraftTargets,
    );
  const simulatedTrackedWeights = normalizeAllocationTargets(
    allocationSimulatorAppliedTargets,
    portfolioSimulatorSymbols,
  );
  const simulatedTrackedTotal = portfolioSimulatorSymbols.reduce(
    (sum, symbol) => sum + simulatedTrackedWeights[symbol],
    0,
  );
  const simulatedRemainderPct = Math.max(0, 100 - simulatedTrackedTotal);
  const remainderReference = currentOtherWeightPct + currentCashWeightPct;
  const simulatedOtherWeightPct =
    remainderReference > 0
      ? (simulatedRemainderPct * currentOtherWeightPct) / remainderReference
      : simulatedRemainderPct;
  const simulatedCashWeightPct = Math.max(
    0,
    simulatedRemainderPct - simulatedOtherWeightPct,
  );

  const buildPortfolioMetrics = (
    trackedWeights: AllocationSimulatorWeights,
    otherWeightPct: number,
    cashWeightPct: number,
  ) => {
    const components = portfolioSimulatorSymbols.map((symbol) => {
      const metrics = trackedMetricsBySymbol[symbol] ?? {
        expectedReturnPct: 0,
        volatilityPct: 0,
        maxDrawdownPct: 0,
        sharpe: 0,
      };

      return {
        weightPct: trackedWeights[symbol] ?? 0,
        metrics,
      };
    });

    components.push({ weightPct: otherWeightPct, metrics: otherAssetMetrics });
    components.push({ weightPct: cashWeightPct, metrics: cashMetrics });

    return buildWeightedRiskMetrics(components);
  };

  const currentPortfolioRiskMetrics = buildPortfolioMetrics(
    trackedCurrentWeights,
    currentOtherWeightPct,
    currentCashWeightPct,
  );
  const simulatedPortfolioRiskMetrics = buildPortfolioMetrics(
    simulatedTrackedWeights,
    simulatedOtherWeightPct,
    simulatedCashWeightPct,
  );
  const currentPortfolioReturnFromPortfolio =
    portfolioData?.summary.day_pnl_pct ??
    currentPortfolioRiskMetrics.expectedReturnPct;
  const currentDrawdownCandidates = (portfolioData?.positions ?? [])
    .map((position) => Number(position.unrealized_intraday_plpc))
    .filter((value) => Number.isFinite(value));
  const fallbackDrawdownCandidates = (portfolioData?.positions ?? [])
    .map((position) => Number(position.unrealized_plpc))
    .filter((value) => Number.isFinite(value));
  const currentPortfolioDrawdownFromPortfolio =
    currentDrawdownCandidates.length > 0
      ? Math.min(0, ...currentDrawdownCandidates)
      : fallbackDrawdownCandidates.length > 0
        ? Math.min(0, ...fallbackDrawdownCandidates)
        : currentPortfolioRiskMetrics.maxDrawdownPct;
  const currentPortfolioVolatilityForDisplay =
    currentPortfolioRiskMetrics.volatilityPct;
  const currentPortfolioSharpeFromPortfolio =
    currentPortfolioVolatilityForDisplay > 0
      ? currentPortfolioReturnFromPortfolio /
        currentPortfolioVolatilityForDisplay
      : 0;
  const currentPortfolioRiskLabel = classifyRiskLevel(
    currentPortfolioVolatilityForDisplay,
  );
  const simulatedPortfolioRiskLabel = classifyRiskLevel(
    simulatedPortfolioRiskMetrics.volatilityPct,
  );
  const riskReductionPct =
    currentPortfolioVolatilityForDisplay > 0
      ? ((currentPortfolioVolatilityForDisplay -
          simulatedPortfolioRiskMetrics.volatilityPct) /
          currentPortfolioVolatilityForDisplay) *
        100
      : 0;
  const expectedReturnDeltaPct =
    simulatedPortfolioRiskMetrics.expectedReturnPct -
    currentPortfolioReturnFromPortfolio;
  const netPnlImpact =
    (portfolioData?.summary.equity ?? 0) * (expectedReturnDeltaPct / 100);
  const safetyStance = classifySafetyStance(
    currentPortfolioVolatilityForDisplay,
    simulatedPortfolioRiskMetrics.volatilityPct,
  );
  const simulatedPortfolioDisplay = allocationSimulationResult
    ? allocationSimulationResult.simulatedPortfolio
    : {
        expectedReturnPct: simulatedPortfolioRiskMetrics.expectedReturnPct,
        riskLabel: simulatedPortfolioRiskLabel,
        maxDrawdownPct: simulatedPortfolioRiskMetrics.maxDrawdownPct,
        sharpe: simulatedPortfolioRiskMetrics.sharpe,
      };
  const impactDisplay = allocationSimulationResult
    ? allocationSimulationResult.impact
    : {
        netPnlImpact,
        riskReductionPct,
        profileShift: safetyStance,
      };
  const recommendationsDisplay =
    allocationSimulationResult?.recommendations ?? [];
  const safetyStanceForDisplay = impactDisplay.profileShift;
  const safetyStanceToneClass =
    safetyStanceForDisplay === "Safer"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : safetyStanceForDisplay === "Aggressive"
        ? "border-red-500/30 bg-red-500/10 text-red-300"
        : "border-amber-500/30 bg-amber-500/10 text-amber-300";

  const handleAnalyzeAllocationSimulation = useCallback(async () => {
    if (portfolioSimulatorSymbols.length === 0) return;

    const normalizedTargets = normalizeAllocationTargets(
      allocationSimulatorTargets,
      portfolioSimulatorSymbols,
    );

    const proposedAllocations: AllocationProposal[] =
      portfolioSimulatorSymbols.map((symbol) => ({
        symbol,
        currentPct: trackedCurrentWeights[symbol] ?? 0,
        targetPct: normalizedTargets[symbol] ?? 0,
        expectedReturnPct:
          trackedMetricsBySymbol[symbol]?.expectedReturnPct ?? 0,
        volatilityPct: trackedMetricsBySymbol[symbol]?.volatilityPct ?? 0,
        maxDrawdownPct: trackedMetricsBySymbol[symbol]?.maxDrawdownPct ?? 0,
      }));
    const localRecommendations = buildLocalSimulationRecommendations(
      proposedAllocations,
      simulatedPortfolioRiskLabel,
    );

    const localProjection = {
      simulatedPortfolio: {
        expectedReturnPct: simulatedPortfolioRiskMetrics.expectedReturnPct,
        riskLabel: simulatedPortfolioRiskLabel,
        maxDrawdownPct: simulatedPortfolioRiskMetrics.maxDrawdownPct,
        sharpe: simulatedPortfolioRiskMetrics.sharpe,
      },
      impact: {
        netPnlImpact,
        riskReductionPct,
        profileShift: safetyStance,
      },
      recommendations: localRecommendations,
    };

    // Show a fast local estimate immediately while the remote model refines it.
    setAllocationSimulationResult(localProjection);
    setAllocationSimulatorAppliedTargets(normalizedTargets);
    setAllocationSimulatorTouched(true);
    setAllocationSimulationLoading(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 4500);

    try {
      const response = await fetch("/api/portfolio-simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          currentPortfolio: {
            equity: portfolioData?.summary.equity ?? 0,
            returnPct: currentPortfolioReturnFromPortfolio,
            riskLabel: currentPortfolioRiskLabel,
            volatilityPct: currentPortfolioVolatilityForDisplay,
            maxDrawdownPct: currentPortfolioDrawdownFromPortfolio,
            sharpe: currentPortfolioSharpeFromPortfolio,
          },
          proposedAllocations,
          localProjection,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to analyze simulated allocation.");
      }

      const payload = (await response.json()) as AllocationSimulationResult;
      setAllocationSimulationResult(payload);
    } catch {
      // Keep the optimistic local estimate when the remote call is slow/unavailable.
    } finally {
      window.clearTimeout(timeoutId);
      setAllocationSimulationLoading(false);
    }
  }, [
    allocationSimulatorTargets,
    currentPortfolioDrawdownFromPortfolio,
    currentPortfolioReturnFromPortfolio,
    currentPortfolioRiskLabel,
    currentPortfolioSharpeFromPortfolio,
    currentPortfolioVolatilityForDisplay,
    netPnlImpact,
    portfolioData?.summary.equity,
    portfolioSimulatorSymbols,
    riskReductionPct,
    safetyStance,
    simulatedPortfolioRiskLabel,
    simulatedPortfolioRiskMetrics.expectedReturnPct,
    simulatedPortfolioRiskMetrics.maxDrawdownPct,
    simulatedPortfolioRiskMetrics.sharpe,
    trackedCurrentWeights,
    trackedMetricsBySymbol,
  ]);

  useEffect(() => {
    if (pathname !== "/risk-analysis") {
      setAllocationSimulatorTouched(false);
      return;
    }

    if (allocationSimulatorTouched) return;

    setAllocationSimulatorTargets((prev) => {
      if (hasSameAllocationWeights(prev, simulatorCurrentAllocations)) {
        return prev;
      }

      return simulatorCurrentAllocations;
    });
    setAllocationSimulatorAppliedTargets((prev) => {
      if (hasSameAllocationWeights(prev, simulatorCurrentAllocations)) {
        return prev;
      }

      return simulatorCurrentAllocations;
    });
    setAllocationSimulationResult(null);
  }, [pathname, allocationSimulatorTouched, simulatorCurrentAllocations]);

  useEffect(() => {
    if (pathname !== "/risk-analysis" || !allocationSimulationPending) {
      allocationAutoAnalyzeTriggeredRef.current = false;
      return;
    }

    const onScroll = () => {
      if (
        allocationSimulationLoading ||
        allocationAutoAnalyzeTriggeredRef.current
      ) {
        return;
      }

      allocationAutoAnalyzeTriggeredRef.current = true;
      toast("Analysing, Please wait!");
      void handleAnalyzeAllocationSimulation();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, [
    pathname,
    allocationSimulationPending,
    allocationSimulationLoading,
    handleAnalyzeAllocationSimulation,
  ]);

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
    { label: "Trending", href: "/trending" },
    { label: "Watchlist", href: "/watchlist" },
    { label: "Alerts", href: "/alerts" },
    { label: "Portfolio", href: "/portfolio" },
    { label: "Risk Analysis", href: "/risk-analysis" },
    { label: "MCP", href: "/mcp" },
  ] as const;

  const mcpStatCards = [
    { label: "MCP Tools", value: "26", detail: "Data, actions, intelligence" },
    {
      label: "CLI Commands",
      value: "34",
      detail: "tm portfolio, tm pnl, tm order",
    },
    {
      label: "Median Latency",
      value: "182ms",
      detail: "Simulated MCP round-trip",
    },
    {
      label: "Success Rate",
      value: "99.2%",
      detail: "Read + execution requests",
    },
  ] as const;
  const mcpCoverageBars = [
    { label: "Account + Portfolio", value: 94 },
    { label: "Market Data", value: 97 },
    { label: "Order Execution", value: 89 },
    { label: "Risk + Allocation", value: 92 },
    { label: "AI Recommendations", value: 96 },
  ] as const;
  const mcpCapabilityMatrix = [
    {
      capability: "Portfolio Snapshot",
      mcpTool: "get_portfolio",
      cli: "tm portfolio",
      status: "Ready",
      notes: "Real-time equity, cash, and allocations",
    },
    {
      capability: "PnL + Drawdown",
      mcpTool: "get_pnl",
      cli: "tm pnl --window 30d",
      status: "Ready",
      notes: "Daily and cumulative PnL attribution",
    },
    {
      capability: "Order Placement",
      mcpTool: "place_order",
      cli: "tm order buy BTC 100",
      status: "Guardrailed",
      notes: "Approval + scoped trade permissions",
    },
    {
      capability: "Rebalance",
      mcpTool: "rebalance_portfolio",
      cli: "tm rebalance --target model_a",
      status: "Beta",
      notes: "Allocation-aware smart routing",
    },
    {
      capability: "Risk Analysis",
      mcpTool: "optimize_allocation",
      cli: "tm risk optimize",
      status: "Ready",
      notes: "Volatility, drawdown, Sharpe-driven",
    },
    {
      capability: "AI Strategy Suggestions",
      mcpTool: "suggest_strategy",
      cli: "tm strategy suggest",
      status: "Ready",
      notes: "Scenario-aware recommendation layer",
    },
  ] as const;
  const mcpLatencySeries = [430, 320, 290, 260, 230, 210, 205, 198, 192, 188];
  const mcpLatencyPath = buildLinePathWithBounds(
    mcpLatencySeries,
    150,
    460,
    420,
    130,
    8,
  );

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

                <div className="overflow-x-auto pb-1">
                  <div className="flex min-w-max items-center gap-2">
                    {visiblePredictionFilters.map((filter) => {
                      const active = predictionFilter === filter.key;

                      return (
                        <button
                          key={filter.key}
                          type="button"
                          onClick={() => setPredictionFilter(filter.key)}
                          className={`rounded-full border px-4 py-2 text-xs font-medium transition-colors ${
                            active
                              ? "border-white/[0.16] bg-white/[0.1] text-white"
                              : "border-white/[0.08] bg-[#0b0b0d] text-zinc-400 hover:border-white/[0.12] hover:text-zinc-200"
                          }`}
                        >
                          {filter.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {filteredPredictionMarkets.length === 0 ? (
                  <div className="rounded-2xl border border-white/[0.07] bg-[#0a0a0a] px-6 py-10 text-center text-sm text-zinc-500">
                    No prediction markets matched your search and filter.
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
              <div ref={homeSectionRef} className="scroll-mt-24 space-y-6">
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-medium text-zinc-200">
                      My Watchlist
                    </h2>
                    <button
                      type="button"
                      onClick={openWatchlistModal}
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
                  <WatchlistMoversChart
                    key={watchlistMoversKey}
                    coins={watchlistMovers}
                  />
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
                            {coin.name} is trading at {fmt(coin.current_price)}{" "}
                            after moving{" "}
                            <span
                              className={
                                positive ? "text-emerald-400" : "text-red-400"
                              }
                            >
                              {positive ? "+" : "-"}
                              {pctCompact(coin.price_change_percentage_24h)}
                            </span>{" "}
                            over the last day, with volume near{" "}
                            {fmtBig(coin.total_volume)} and a 7-day move of{" "}
                            {pctCompact(get7dChange(coin))}.
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
                      <span className="text-xs text-zinc-500">
                        Refreshing...
                      </span>
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
                            {item.publishedAt && (
                              <span>{item.publishedAt}</span>
                            )}
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
            ) : pathname === "/alerts" ? (
              <div ref={homeSectionRef} className="scroll-mt-24 space-y-6">
                <section className="space-y-4">
                  <div>
                    <h1 className="text-[22px] font-semibold text-zinc-100">
                      Alerts
                    </h1>
                    <p className="mt-1 text-sm text-zinc-500">
                      Build custom crypto alerts for price, percentage changes,
                      periodic checks, and volume spikes.
                    </p>
                  </div>

                  <div className="rounded-[22px] border border-white/[0.08] bg-[#0a0a0a] p-4 shadow-[0_18px_46px_rgba(0,0,0,0.36)] md:p-5">
                    <Tabs
                      value={alertsMode}
                      onValueChange={(value) =>
                        setAlertsMode(value as AlertsMode)
                      }
                      className="space-y-4"
                    >
                      <div className="overflow-x-auto pb-1">
                        <TabsList className="min-w-max border-white/[0.12] bg-[#111111]">
                          {ALERTS_TABS.map((tab) => (
                            <TabsTrigger
                              key={tab.key}
                              value={tab.key}
                              className="text-zinc-400 data-[state=active]:bg-white/[0.1] data-[state=active]:text-zinc-100"
                            >
                              {tab.label}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </div>

                      <TabsContent value="price" className="space-y-4">
                        <div>
                          <h2 className="text-[24px] font-semibold text-zinc-100">
                            Price Alert
                          </h2>
                          <p className="mt-1 text-[14px] text-zinc-500">
                            Get notified when a coin goes above or below your
                            target price.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[18px] leading-[2] text-zinc-100">
                          Send me an{" "}
                          <select
                            value={alertChannel}
                            onChange={(event) =>
                              setAlertChannel(event.target.value)
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            {ALERT_CHANNEL_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>{" "}
                          as soon as{" "}
                          <select
                            value={alertAssetSearch}
                            onChange={(event) =>
                              setAlertAssetSearch(event.target.value)
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            {ALERT_ASSET_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>{" "}
                          goes{" "}
                          <select
                            value={alertDirection}
                            onChange={(event) =>
                              setAlertDirection(
                                event.target.value as "above" | "below",
                              )
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            <option value="above">above</option>
                            <option value="below">below</option>
                          </select>{" "}
                          the price of{" "}
                          <input
                            value={alertTargetPrice}
                            onChange={(event) =>
                              setAlertTargetPrice(event.target.value)
                            }
                            inputMode="decimal"
                            placeholder="0.0"
                            className="w-[120px] rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 placeholder:text-zinc-500 outline-none"
                          />{" "}
                          on{" "}
                          <select
                            value={alertExchange}
                            onChange={(event) =>
                              setAlertExchange(event.target.value)
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            {ALERT_EXCHANGE_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          .
                          <button
                            type="button"
                            onClick={handleSetAlert}
                            className="ml-2 w-fit rounded-full bg-white px-5 py-1.5 text-sm font-semibold tracking-[0.08em] text-black transition-colors hover:bg-zinc-200"
                          >
                            Set Alert
                          </button>
                        </div>
                      </TabsContent>

                      <TabsContent value="percentage" className="space-y-4">
                        <div>
                          <h2 className="text-[24px] font-semibold text-zinc-100">
                            Percentage Price Alert
                          </h2>
                          <p className="mt-1 text-[14px] text-zinc-500">
                            Get notified when a coin changes in value by a
                            specific percent.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[18px] leading-[2] text-zinc-100">
                          Send me an{" "}
                          <select
                            value={alertChannel}
                            onChange={(event) =>
                              setAlertChannel(event.target.value)
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            {ALERT_CHANNEL_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>{" "}
                          as soon as{" "}
                          <select
                            value={alertAssetSearch}
                            onChange={(event) =>
                              setAlertAssetSearch(event.target.value)
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            {ALERT_ASSET_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>{" "}
                          <select
                            value={alertPercentageDirection}
                            onChange={(event) =>
                              setAlertPercentageDirection(
                                event.target.value as "up" | "down",
                              )
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            <option value="up">goes up</option>
                            <option value="down">goes down</option>
                          </select>{" "}
                          by{" "}
                          <input
                            value={alertPercentageChange}
                            onChange={(event) =>
                              setAlertPercentageChange(event.target.value)
                            }
                            inputMode="decimal"
                            placeholder="0"
                            className="w-[96px] rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 placeholder:text-zinc-500 outline-none"
                          />{" "}
                          percent within the last{" "}
                          <select
                            value={alertPercentageWindow}
                            onChange={(event) =>
                              setAlertPercentageWindow(event.target.value)
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            {ALERT_PERCENTAGE_WINDOW_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>{" "}
                          on{" "}
                          <select
                            value={alertExchange}
                            onChange={(event) =>
                              setAlertExchange(event.target.value)
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            {ALERT_EXCHANGE_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          .
                          <button
                            type="button"
                            onClick={handleSetAlert}
                            className="ml-2 w-fit rounded-full bg-white px-5 py-1.5 text-sm font-semibold tracking-[0.08em] text-black transition-colors hover:bg-zinc-200"
                          >
                            Set Alert
                          </button>
                        </div>
                      </TabsContent>

                      <TabsContent value="periodic" className="space-y-4">
                        <div>
                          <h2 className="text-[24px] font-semibold text-zinc-100">
                            Periodic Price Alerts
                          </h2>
                          <p className="mt-1 text-[14px] text-zinc-500">
                            Get notified of the price of an asset at regular
                            intervals.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[18px] leading-[2] text-zinc-100">
                          Send me an{" "}
                          <select
                            value={alertChannel}
                            onChange={(event) =>
                              setAlertChannel(event.target.value)
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            {ALERT_CHANNEL_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>{" "}
                          every{" "}
                          <select
                            value={alertPeriodicInterval}
                            onChange={(event) =>
                              setAlertPeriodicInterval(event.target.value)
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            {ALERT_PERIODIC_INTERVAL_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>{" "}
                          with the current price of{" "}
                          <select
                            value={alertAssetSearch}
                            onChange={(event) =>
                              setAlertAssetSearch(event.target.value)
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            {ALERT_ASSET_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>{" "}
                          on{" "}
                          <select
                            value={alertExchange}
                            onChange={(event) =>
                              setAlertExchange(event.target.value)
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            {ALERT_EXCHANGE_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          .
                          <button
                            type="button"
                            onClick={handleSetAlert}
                            className="ml-2 w-fit rounded-full bg-white px-5 py-1.5 text-sm font-semibold tracking-[0.08em] text-black transition-colors hover:bg-zinc-200"
                          >
                            Set Alert
                          </button>
                        </div>
                      </TabsContent>

                      <TabsContent value="volume" className="space-y-4">
                        <div>
                          <h2 className="text-[24px] font-semibold text-zinc-100">
                            Volume Alert
                          </h2>
                          <p className="mt-1 text-[14px] text-zinc-500">
                            Get notified of unusual trading volume on crypto
                            exchanges.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[18px] leading-[2] text-zinc-100">
                          Send me an{" "}
                          <select
                            value={alertChannel}
                            onChange={(event) =>
                              setAlertChannel(event.target.value)
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            {ALERT_CHANNEL_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>{" "}
                          as soon as the trading volume of{" "}
                          <select
                            value={alertAssetSearch}
                            onChange={(event) =>
                              setAlertAssetSearch(event.target.value)
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            {ALERT_ASSET_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>{" "}
                          on{" "}
                          <select
                            value={alertExchange}
                            onChange={(event) =>
                              setAlertExchange(event.target.value)
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            {ALERT_EXCHANGE_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>{" "}
                          increases by{" "}
                          <select
                            value={alertVolumeMultiple}
                            onChange={(event) =>
                              setAlertVolumeMultiple(event.target.value)
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            {ALERT_VOLUME_MULTIPLE_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>{" "}
                          within the last{" "}
                          <select
                            value={alertVolumeWindow}
                            onChange={(event) =>
                              setAlertVolumeWindow(event.target.value)
                            }
                            className="rounded-xl border border-white/[0.2] bg-[#121212] px-3 py-1.5 text-[18px] text-zinc-100 outline-none"
                          >
                            {ALERT_VOLUME_WINDOW_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          .
                          <button
                            type="button"
                            onClick={handleSetAlert}
                            className="ml-2 w-fit rounded-full bg-white px-5 py-1.5 text-sm font-semibold tracking-[0.08em] text-black transition-colors hover:bg-zinc-200"
                          >
                            Set Alert
                          </button>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>
                </section>
              </div>
            ) : pathname === "/portfolio" ? (
              <div ref={homeSectionRef} className="scroll-mt-24 space-y-6">
                <section className="space-y-3">
                  {!portfolioGateReady ? (
                    <div className="flex items-center gap-3 border border-white/[0.07] bg-[#0a0a0a] px-4 py-8 text-sm text-zinc-500">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Preparing portfolio access...
                    </div>
                  ) : !portfolioConnected ? (
                    <div className="mx-auto max-w-[580px] text-center">
                      <div className="rounded-[20px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),rgba(10,10,10,0.95)_55%)] px-5 py-6 shadow-[0_18px_56px_rgba(0,0,0,0.42)] md:px-7 md:py-7">
                        <div className="mx-auto mb-4 flex w-fit items-center gap-2.5 rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2">
                          <Image
                            src="/logo.svg"
                            alt="TrueMarkets"
                            width={22}
                            height={26}
                            className="h-6 w-auto opacity-85"
                          />
                          <span className="text-sm text-zinc-500">↔</span>
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.95]">
                            <BarChart2 className="h-3.5 w-3.5 text-black" />
                          </div>
                        </div>

                        <h1 className="text-[26px] font-semibold leading-tight text-zinc-100 md:text-[30px]">
                          Connect your financial accounts
                        </h1>
                        <p className="mx-auto mt-2 max-w-[470px] text-[15px] leading-6 text-zinc-400">
                          Securely link your broker to unlock live holdings,
                          positions, and order activity in one place.
                        </p>

                        <div className="mx-auto mt-6 max-w-[470px] space-y-3 text-left">
                          <div className="flex items-start gap-2.5">
                            <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                              <Zap className="h-3.5 w-3.5 text-zinc-300" />
                            </span>
                            <div>
                              <p className="text-[17px] font-medium text-zinc-100">
                                Instant account sync
                              </p>
                              <p className="mt-0.5 text-[14px] leading-5 text-zinc-400">
                                See holdings, transactions, and liabilities in
                                one place, updated in real time.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-2.5">
                            <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                              <Globe className="h-3.5 w-3.5 text-zinc-300" />
                            </span>
                            <div>
                              <p className="text-[17px] font-medium text-zinc-100">
                                AI-powered insights
                              </p>
                              <p className="mt-0.5 text-[14px] leading-5 text-zinc-400">
                                Ask anything about your portfolio, spending,
                                risks, and account activity.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-2.5">
                            <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                              <RefreshCw className="h-3.5 w-3.5 text-zinc-300" />
                            </span>
                            <div>
                              <p className="text-[17px] font-medium text-zinc-100">
                                Bank-level security
                              </p>
                              <p className="mt-0.5 text-[14px] leading-5 text-zinc-400">
                                256-bit encryption with read-only access to your
                                account data.
                              </p>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleConnectPortfolio}
                          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.22] bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
                        >
                          Connect Account
                        </button>
                      </div>

                      <p className="mt-3 text-xs text-zinc-500">
                        Portolio Connect show's Shreyansh Saurabhs's Alpaca
                        Account
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                          <h1 className="text-[22px] font-semibold text-zinc-100">
                            Portfolio
                          </h1>
                          <p className="mt-1 text-sm text-zinc-500">
                            Live Alpaca account data from your configured API
                            credentials.
                          </p>
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
                          <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
                            <section
                              className={`p-3.5 md:p-4 ${CARD_SHELL_CLASS}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-xs font-medium text-zinc-500">
                                    Net Worth
                                  </p>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <p className="text-[28px] font-semibold leading-none tracking-tight text-zinc-100 tabular-nums md:text-[32px]">
                                      $
                                      {Math.round(
                                        portfolioData.summary.equity,
                                      ).toLocaleString("en-US")}
                                    </p>
                                    <p
                                      className={`text-[16px] font-medium leading-none tabular-nums md:text-[18px] ${
                                        portfolioNetWorthChange >= 0
                                          ? "text-emerald-400"
                                          : "text-red-400"
                                      }`}
                                    >
                                      {portfolioNetWorthChange >= 0 ? "+" : "-"}
                                      $
                                      {Math.abs(
                                        Math.round(portfolioNetWorthChange),
                                      ).toLocaleString("en-US")}
                                    </p>
                                    <span
                                      className={`rounded px-1.5 py-0.5 text-[13px] font-medium leading-none tabular-nums md:text-[14px] ${
                                        portfolioNetWorthChangePct >= 0
                                          ? "bg-emerald-500/12 text-emerald-400"
                                          : "bg-red-500/12 text-red-400"
                                      }`}
                                    >
                                      {portfolioNetWorthChangePct >= 0
                                        ? "+"
                                        : "-"}
                                      {Math.abs(
                                        portfolioNetWorthChangePct,
                                      ).toFixed(2)}
                                      %
                                    </span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    void fetchPortfolioRouteData();
                                  }}
                                  disabled={portfolioRouteLoading}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.12] bg-white/[0.02] text-zinc-400 transition-colors hover:border-white/[0.2] hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-600"
                                  aria-label="Refresh portfolio overview"
                                >
                                  <RefreshCw
                                    className={`h-3.5 w-3.5 ${
                                      portfolioRouteLoading
                                        ? "animate-spin"
                                        : ""
                                    }`}
                                  />
                                </button>
                              </div>

                              <div className="mt-3 grid gap-2.5 md:grid-cols-3">
                                <div>
                                  <p className="text-xs text-zinc-500">
                                    Claimable
                                  </p>
                                  <p className="mt-0.5 text-[17px] font-semibold text-zinc-100 tabular-nums md:text-[18px]">
                                    $
                                    {Math.round(
                                      portfolioData.summary.cash,
                                    ).toLocaleString("en-US")}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-zinc-500">
                                    Total Assets
                                  </p>
                                  <p className="mt-0.5 text-[17px] font-semibold text-zinc-100 tabular-nums md:text-[18px]">
                                    $
                                    {Math.round(
                                      portfolioData.summary.equity,
                                    ).toLocaleString("en-US")}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-zinc-500">
                                    Total Liabilities
                                  </p>
                                  <p className="mt-0.5 text-[17px] font-semibold text-zinc-100 tabular-nums md:text-[18px]">
                                    $
                                    {Math.round(
                                      portfolioLiabilities,
                                    ).toLocaleString("en-US")}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-3">
                                <p className="text-xs font-medium text-zinc-300">
                                  Risk Profile
                                </p>
                                <div className="mt-1.5 overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.02]">
                                  <div className="flex h-3.5 w-full">
                                    {portfolioAllocationSlices.map((slice) => (
                                      <span
                                        key={`risk-${slice.label}`}
                                        className="h-full"
                                        style={{
                                          width: `${slice.pct}%`,
                                          backgroundColor: slice.color,
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>

                                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                                  {portfolioAllocationSlices.map((slice) => (
                                    <div
                                      key={`risk-legend-${slice.label}`}
                                      className="min-w-[70px]"
                                    >
                                      <div className="flex items-center gap-1">
                                        <span
                                          className="h-1.5 w-1.5 rounded-full"
                                          style={{
                                            backgroundColor: slice.color,
                                          }}
                                        />
                                        <span className="text-[11px] text-zinc-200">
                                          {slice.label}
                                        </span>
                                      </div>
                                      <p className="pl-2.5 text-[11px] tabular-nums text-zinc-500">
                                        {slice.pct.toFixed(2)}%
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </section>

                            <section
                              className={`p-3.5 md:p-4 ${CARD_SHELL_CLASS}`}
                            >
                              <h2 className="text-[16px] font-semibold text-zinc-100 md:text-[18px]">
                                Portfolio Allocation
                              </h2>

                              <div className="mt-2.5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div className="mx-auto shrink-0 md:mx-0">
                                  <PortfolioAllocationDonut
                                    slices={portfolioAllocationSlices}
                                    total={portfolioData.summary.equity}
                                  />
                                </div>

                                <div className="space-y-1 md:min-w-[150px]">
                                  {portfolioAllocationSlices.map((slice) => (
                                    <div
                                      key={`allocation-${slice.label}`}
                                      className="flex items-center justify-between gap-2"
                                    >
                                      <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-zinc-200">
                                        <span
                                          className="h-2 w-2 rounded-full"
                                          style={{
                                            backgroundColor: slice.color,
                                          }}
                                        />
                                        <span className="truncate">
                                          {slice.label}
                                        </span>
                                      </span>
                                      <span className="text-[12px] font-semibold tabular-nums text-zinc-100">
                                        {slice.pct.toFixed(2)}%
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </section>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                                portfolioData.summary.day_pnl_pct >= 0
                                  ? "+"
                                  : ""
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
                              value={String(
                                portfolioData.summary.positions_count,
                              )}
                              detail={`Pending orders ${portfolioData.summary.pending_orders_count}`}
                            />
                            <PortfolioStatTile
                              label="Filled Orders"
                              value={String(
                                portfolioData.summary.filled_orders_count,
                              )}
                              detail={`Partially filled ${portfolioData.summary.partially_filled_orders_count}`}
                            />
                            <PortfolioStatTile
                              label="Account Number"
                              value={
                                portfolioData.account.account_number
                                  ? `••••${String(
                                      portfolioData.account.account_number,
                                    ).slice(-4)}`
                                  : "--"
                              }
                            />
                            <PortfolioStatTile
                              label="Account Status"
                              value={
                                portfolioData.account.status
                                  ? portfolioData.account.status.toUpperCase()
                                  : "ACTIVE"
                              }
                            />
                          </div>

                          <div className="space-y-4">
                            <PortfolioCard data={portfolioData} />

                            <section className="space-y-2">
                              <h2 className="text-sm font-medium text-zinc-200">
                                Open Positions
                              </h2>
                              <PortfolioPositionsTable
                                positions={portfolioData.positions}
                              />
                            </section>
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
                    </>
                  )}
                </section>
              </div>
            ) : pathname === "/risk-analysis" ? (
              <div ref={homeSectionRef} className="scroll-mt-24 space-y-6">
                <section className="space-y-3">
                  {!portfolioGateReady ? (
                    <div className="flex items-center gap-3 border border-white/[0.07] bg-[#0a0a0a] px-4 py-8 text-sm text-zinc-500">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Preparing risk analysis access...
                    </div>
                  ) : !portfolioConnected ? (
                    <div className="mx-auto max-w-[580px] text-center">
                      <div className="rounded-[20px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),rgba(10,10,10,0.95)_55%)] px-5 py-6 shadow-[0_18px_56px_rgba(0,0,0,0.42)] md:px-7 md:py-7">
                        <div className="mx-auto mb-4 flex w-fit items-center gap-2.5 rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2">
                          <Image
                            src="/logo.svg"
                            alt="TrueMarkets"
                            width={22}
                            height={26}
                            className="h-6 w-auto opacity-85"
                          />
                          <span className="text-sm text-zinc-500">↔</span>
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.95]">
                            <BarChart2 className="h-3.5 w-3.5 text-black" />
                          </div>
                        </div>

                        <h1 className="text-[26px] font-semibold leading-tight text-zinc-100 md:text-[30px]">
                          Connect your financial accounts
                        </h1>
                        <p className="mx-auto mt-2 max-w-[470px] text-[15px] leading-6 text-zinc-400">
                          Securely link your broker to unlock portfolio-wide
                          risk analytics and simulations in one place.
                        </p>

                        <div className="mx-auto mt-6 max-w-[470px] space-y-3 text-left">
                          <div className="flex items-start gap-2.5">
                            <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                              <Zap className="h-3.5 w-3.5 text-zinc-300" />
                            </span>
                            <div>
                              <p className="text-[17px] font-medium text-zinc-100">
                                Portfolio-wide risk visibility
                              </p>
                              <p className="mt-0.5 text-[14px] leading-5 text-zinc-400">
                                Analyze all assets in one place with allocation
                                breakdowns, volatility insights, and real-time
                                performance tracking.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-2.5">
                            <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                              <Globe className="h-3.5 w-3.5 text-zinc-300" />
                            </span>
                            <div>
                              <p className="text-[17px] font-medium text-zinc-100">
                                Interactive simulation engine
                              </p>
                              <p className="mt-0.5 text-[14px] leading-5 text-zinc-400">
                                Adjust asset allocations dynamically to see how
                                changes impact returns, risk, and overall
                                portfolio performance.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-2.5">
                            <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                              <RefreshCw className="h-3.5 w-3.5 text-zinc-300" />
                            </span>
                            <div>
                              <p className="text-[17px] font-medium text-zinc-100">
                                AI-driven insights
                              </p>
                              <p className="mt-0.5 text-[14px] leading-5 text-zinc-400">
                                Get intelligent recommendations on reducing
                                risk, optimizing allocation, and understanding
                                potential market scenarios.
                              </p>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleConnectPortfolio}
                          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.22] bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
                        >
                          Connect Account
                        </button>
                      </div>

                      <p className="mt-3 text-xs text-zinc-500">
                        Portfolio Connect show's Shreyansh Saurabhs's Alpaca
                        Account
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                          <h1 className="text-[22px] font-semibold text-zinc-100">
                            Risk Analysis
                          </h1>
                          <p className="mt-1 text-sm text-zinc-500">
                            Live Alpaca account data from your configured API
                            credentials.
                          </p>
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
                        <div className="space-y-4">
                          <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
                            <section
                              className={`p-3.5 md:p-4 ${CARD_SHELL_CLASS}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-xs font-medium text-zinc-500">
                                    Net Worth
                                  </p>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <p className="text-[28px] font-semibold leading-none tracking-tight text-zinc-100 tabular-nums md:text-[32px]">
                                      $
                                      {Math.round(
                                        portfolioData.summary.equity,
                                      ).toLocaleString("en-US")}
                                    </p>
                                    <p
                                      className={`text-[16px] font-medium leading-none tabular-nums md:text-[18px] ${
                                        portfolioNetWorthChange >= 0
                                          ? "text-emerald-400"
                                          : "text-red-400"
                                      }`}
                                    >
                                      {portfolioNetWorthChange >= 0 ? "+" : "-"}
                                      $
                                      {Math.abs(
                                        Math.round(portfolioNetWorthChange),
                                      ).toLocaleString("en-US")}
                                    </p>
                                    <span
                                      className={`rounded px-1.5 py-0.5 text-[13px] font-medium leading-none tabular-nums md:text-[14px] ${
                                        portfolioNetWorthChangePct >= 0
                                          ? "bg-emerald-500/12 text-emerald-400"
                                          : "bg-red-500/12 text-red-400"
                                      }`}
                                    >
                                      {portfolioNetWorthChangePct >= 0
                                        ? "+"
                                        : "-"}
                                      {Math.abs(
                                        portfolioNetWorthChangePct,
                                      ).toFixed(2)}
                                      %
                                    </span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    void fetchPortfolioRouteData();
                                  }}
                                  disabled={portfolioRouteLoading}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.12] bg-white/[0.02] text-zinc-400 transition-colors hover:border-white/[0.2] hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-600"
                                  aria-label="Refresh portfolio overview"
                                >
                                  <RefreshCw
                                    className={`h-3.5 w-3.5 ${
                                      portfolioRouteLoading
                                        ? "animate-spin"
                                        : ""
                                    }`}
                                  />
                                </button>
                              </div>

                              <div className="mt-3 grid gap-2.5 md:grid-cols-3">
                                <div>
                                  <p className="text-xs text-zinc-500">
                                    Claimable
                                  </p>
                                  <p className="mt-0.5 text-[17px] font-semibold text-zinc-100 tabular-nums md:text-[18px]">
                                    $
                                    {Math.round(
                                      portfolioData.summary.cash,
                                    ).toLocaleString("en-US")}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-zinc-500">
                                    Total Assets
                                  </p>
                                  <p className="mt-0.5 text-[17px] font-semibold text-zinc-100 tabular-nums md:text-[18px]">
                                    $
                                    {Math.round(
                                      portfolioData.summary.equity,
                                    ).toLocaleString("en-US")}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-zinc-500">
                                    Total Liabilities
                                  </p>
                                  <p className="mt-0.5 text-[17px] font-semibold text-zinc-100 tabular-nums md:text-[18px]">
                                    $
                                    {Math.round(
                                      portfolioLiabilities,
                                    ).toLocaleString("en-US")}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-3">
                                <p className="text-xs font-medium text-zinc-300">
                                  Risk Profile
                                </p>
                                <div className="mt-1.5 overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.02]">
                                  <div className="flex h-3.5 w-full">
                                    {portfolioAllocationSlices.map((slice) => (
                                      <span
                                        key={`risk-${slice.label}`}
                                        className="h-full"
                                        style={{
                                          width: `${slice.pct}%`,
                                          backgroundColor: slice.color,
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>

                                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                                  {portfolioAllocationSlices.map((slice) => (
                                    <div
                                      key={`risk-legend-${slice.label}`}
                                      className="min-w-[70px]"
                                    >
                                      <div className="flex items-center gap-1">
                                        <span
                                          className="h-1.5 w-1.5 rounded-full"
                                          style={{
                                            backgroundColor: slice.color,
                                          }}
                                        />
                                        <span className="text-[11px] text-zinc-200">
                                          {slice.label}
                                        </span>
                                      </div>
                                      <p className="pl-2.5 text-[11px] tabular-nums text-zinc-500">
                                        {slice.pct.toFixed(2)}%
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </section>

                            <section
                              className={`p-3.5 md:p-4 ${CARD_SHELL_CLASS}`}
                            >
                              <h2 className="text-[16px] font-semibold text-zinc-100 md:text-[18px]">
                                Portfolio Allocation
                              </h2>

                              <div className="mt-2.5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div className="mx-auto shrink-0 md:mx-0">
                                  <PortfolioAllocationDonut
                                    slices={portfolioAllocationSlices}
                                    total={portfolioData.summary.equity}
                                  />
                                </div>

                                <div className="space-y-1 md:min-w-[150px]">
                                  {portfolioAllocationSlices.map((slice) => (
                                    <div
                                      key={`allocation-${slice.label}`}
                                      className="flex items-center justify-between gap-2"
                                    >
                                      <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-zinc-200">
                                        <span
                                          className="h-2 w-2 rounded-full"
                                          style={{
                                            backgroundColor: slice.color,
                                          }}
                                        />
                                        <span className="truncate">
                                          {slice.label}
                                        </span>
                                      </span>
                                      <span className="text-[12px] font-semibold tabular-nums text-zinc-100">
                                        {slice.pct.toFixed(2)}%
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </section>
                          </div>

                          <section
                            className={`p-3.5 md:p-4 ${CARD_SHELL_CLASS}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h2 className="text-[16px] font-semibold text-zinc-100 md:text-[18px]">
                                Allocation Simulator
                              </h2>
                              <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                                Scroll to analyze
                              </span>
                            </div>

                            <div className="mt-3 grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(290px,0.85fr)]">
                              <div className="flex h-full flex-col gap-3">
                                {trackedAssetMetrics.map((asset, index) => {
                                  const simulatedPct =
                                    simulatedTrackedWeights[asset.symbol] ?? 0;
                                  const draftTargetPct =
                                    allocationSimulatorTargets[asset.symbol] ??
                                    asset.currentAllocationPct ??
                                    0;
                                  const showNormalizationHint =
                                    rawDraftTotal > 100 &&
                                    index === trackedAssetMetrics.length - 1;

                                  return (
                                    <div
                                      key={`allocation-sim-${asset.symbol}`}
                                      className="flex min-h-[150px] flex-1 flex-col justify-between rounded-xl border border-white/8 bg-white/2 px-3 py-2.5"
                                    >
                                      <div>
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-[13px] font-medium text-zinc-100">
                                            {asset.symbol}:{" "}
                                            {asset.currentAllocationPct.toFixed(
                                              1,
                                            )}
                                            % → {simulatedPct.toFixed(1)}%
                                          </p>
                                          <span className="text-[12px] tabular-nums text-zinc-300">
                                            Target {draftTargetPct.toFixed(1)}%
                                          </span>
                                        </div>
                                        <input
                                          type="range"
                                          min={0}
                                          max={100}
                                          step={0.5}
                                          value={draftTargetPct}
                                          onChange={(event) => {
                                            const rawValue = Number(
                                              event.target.value,
                                            );
                                            const nextValue = Number.isFinite(
                                              rawValue,
                                            )
                                              ? Math.min(
                                                  100,
                                                  Math.max(0, rawValue),
                                                )
                                              : 0;

                                            setAllocationSimulatorTouched(true);
                                            setAllocationSimulatorTargets(
                                              (prev) => ({
                                                ...prev,
                                                [asset.symbol]: nextValue,
                                              }),
                                            );
                                          }}
                                          className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-emerald-400"
                                        />
                                        <p className="mt-1.5 text-[11px] text-zinc-500">
                                          Expected return{" "}
                                          {pct(asset.metrics.expectedReturnPct)}{" "}
                                          · Vol{" "}
                                          {asset.metrics.volatilityPct.toFixed(
                                            1,
                                          )}
                                          % · Max DD{" "}
                                          {asset.metrics.maxDrawdownPct.toFixed(
                                            1,
                                          )}
                                          %
                                        </p>
                                      </div>

                                      {showNormalizationHint ? (
                                        <p className="mt-2 text-[11px] text-amber-300">
                                          Combined slider targets exceed 100%,
                                          so weights are normalized
                                          proportionally.
                                        </p>
                                      ) : (
                                        <span className="mt-2 block h-[16px]" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="space-y-2.5">
                                <div className="rounded-xl border border-white/8 bg-white/2 px-3 py-2.5">
                                  <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                                    Current Portfolio
                                  </p>
                                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                                    <p className="text-zinc-400">Return</p>
                                    <p className="text-right font-medium tabular-nums text-zinc-100">
                                      {pct(currentPortfolioReturnFromPortfolio)}
                                    </p>
                                    <p className="text-zinc-400">Risk</p>
                                    <p className="text-right font-medium text-zinc-100">
                                      {currentPortfolioRiskLabel}
                                    </p>
                                    <p className="text-zinc-400">
                                      Max Drawdown
                                    </p>
                                    <p className="text-right font-medium tabular-nums text-zinc-100">
                                      {currentPortfolioDrawdownFromPortfolio.toFixed(
                                        1,
                                      )}
                                      %
                                    </p>
                                    <p className="text-zinc-400">
                                      Sharpe (advanced)
                                    </p>
                                    <p className="text-right font-medium tabular-nums text-zinc-100">
                                      {currentPortfolioSharpeFromPortfolio.toFixed(
                                        2,
                                      )}
                                    </p>
                                  </div>
                                </div>

                                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5">
                                  <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-300">
                                    Simulated Portfolio
                                  </p>
                                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                                    <p className="text-emerald-100/80">
                                      Return
                                    </p>
                                    <p className="text-right font-medium tabular-nums text-emerald-100">
                                      {pct(
                                        simulatedPortfolioDisplay.expectedReturnPct,
                                      )}
                                    </p>
                                    <p className="text-emerald-100/80">Risk</p>
                                    <p className="text-right font-medium text-emerald-100">
                                      {simulatedPortfolioDisplay.riskLabel}
                                    </p>
                                    <p className="text-emerald-100/80">
                                      Max Drawdown
                                    </p>
                                    <p className="text-right font-medium tabular-nums text-emerald-100">
                                      {simulatedPortfolioDisplay.maxDrawdownPct.toFixed(
                                        1,
                                      )}
                                      %
                                    </p>
                                    <p className="text-emerald-100/80">
                                      Sharpe (advanced)
                                    </p>
                                    <p className="text-right font-medium tabular-nums text-emerald-100">
                                      {simulatedPortfolioDisplay.sharpe.toFixed(
                                        2,
                                      )}
                                    </p>
                                  </div>
                                </div>

                                <div className="grid gap-2 md:grid-cols-3">
                                  <div className="rounded-lg border border-white/8 bg-white/2 px-2.5 py-2">
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                      Net PnL Impact
                                    </p>
                                    <p
                                      className={`mt-1 text-[13px] font-medium tabular-nums ${
                                        impactDisplay.netPnlImpact >= 0
                                          ? "text-emerald-300"
                                          : "text-red-300"
                                      }`}
                                    >
                                      {impactDisplay.netPnlImpact >= 0
                                        ? "+"
                                        : "-"}
                                      {fmtBig(
                                        Math.abs(impactDisplay.netPnlImpact),
                                      )}
                                    </p>
                                  </div>

                                  <div className="rounded-lg border border-white/8 bg-white/2 px-2.5 py-2">
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                      Risk Reduction
                                    </p>
                                    <p
                                      className={`mt-1 text-[13px] font-medium tabular-nums ${
                                        impactDisplay.riskReductionPct >= 0
                                          ? "text-emerald-300"
                                          : "text-red-300"
                                      }`}
                                    >
                                      {impactDisplay.riskReductionPct >= 0
                                        ? "+"
                                        : ""}
                                      {impactDisplay.riskReductionPct.toFixed(
                                        1,
                                      )}
                                      %
                                    </p>
                                  </div>

                                  <div className="rounded-lg border border-white/8 bg-white/2 px-2.5 py-2">
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                      Profile Shift
                                    </p>
                                    <span
                                      className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${safetyStanceToneClass}`}
                                    >
                                      {safetyStanceForDisplay} vs Aggressive
                                    </span>
                                  </div>
                                </div>

                                <div className="rounded-xl border border-white/8 bg-white/2 px-3 py-2.5">
                                  <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                                    AI Recommendations
                                  </p>
                                  {recommendationsDisplay.length > 0 ? (
                                    <div className="mt-2 space-y-1.5">
                                      {recommendationsDisplay.map(
                                        (recommendation) => (
                                          <p
                                            key={recommendation}
                                            className="text-[12px] leading-5 text-zinc-300"
                                          >
                                            {recommendation}
                                          </p>
                                        ),
                                      )}
                                    </div>
                                  ) : (
                                    <p className="mt-2 text-[12px] text-zinc-500">
                                      Scroll after changing allocations to
                                      analyze and generate recommendations.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </section>

                          <section className="space-y-3">
                            <h2 className="text-sm font-medium text-zinc-200">
                              Portfolio Assets
                            </h2>

                            {riskAnalysisAssetCards.length === 0 ? (
                              <div className="rounded-[20px] border border-white/[0.08] bg-[#0a0a0a] px-4 py-5 text-sm text-zinc-500">
                                No portfolio assets available.
                              </div>
                            ) : (
                              <div className="grid gap-3 md:grid-cols-3">
                                {riskAnalysisAssetCards.map((asset) => (
                                  <div
                                    key={asset.id}
                                    className="rounded-[20px] border border-white/[0.07] bg-[#0a0a0a] p-4"
                                  >
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="truncate text-[15px] font-semibold text-zinc-100">
                                          {asset.symbol}
                                        </p>
                                        <p className="truncate text-[12px] uppercase tracking-wide text-zinc-500">
                                          Qty{" "}
                                          {asset.qty.toLocaleString("en-US")}
                                        </p>
                                      </div>
                                      <span
                                        className={`inline-flex items-center gap-1 text-[13px] font-medium tabular-nums ${
                                          asset.positive
                                            ? "text-emerald-400"
                                            : "text-red-400"
                                        }`}
                                      >
                                        {asset.positive ? (
                                          <ArrowUpRight className="h-3 w-3" />
                                        ) : (
                                          <ArrowDownRight className="h-3 w-3" />
                                        )}
                                        {Math.abs(asset.notableMovePct).toFixed(
                                          2,
                                        )}
                                        %
                                      </span>
                                    </div>

                                    {asset.sparkline.length > 1 && (
                                      <CardSparkline
                                        data={asset.sparkline}
                                        positive={asset.positive}
                                        height={78}
                                      />
                                    )}

                                    <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-white">
                                      Notable Price Movement
                                    </p>

                                    {(() => {
                                      const assetNews =
                                        riskAnalysisNewsBySymbol[
                                          asset.symbol.toUpperCase()
                                        ] ?? [];
                                      const timeline =
                                        buildNotablePriceTimeline(assetNews);

                                      if (timeline.length === 0) {
                                        return (
                                          <p className="mt-2 text-[13px] leading-6 text-zinc-400">
                                            {riskAnalysisNewsLoading
                                              ? "Analyzing up to 30 articles for notable movement..."
                                              : `${asset.symbol} is trading near ${fmt(asset.currentPrice)} with ${asset.positive ? "+" : "-"}${Math.abs(asset.notableMovePct).toFixed(2)}% movement. Position value is ${fmtBig(asset.marketValue)}.`}
                                          </p>
                                        );
                                      }

                                      return (
                                        <div className="mt-2 max-h-[380px] space-y-0.5 overflow-y-auto pr-1">
                                          {timeline.map((entry, index) => {
                                            const isLast =
                                              index === timeline.length - 1;

                                            return (
                                              <div
                                                key={`${asset.id}-${entry.label}`}
                                                className={`relative pl-7 ${
                                                  isLast ? "" : "pb-3"
                                                }`}
                                              >
                                                {!isLast && (
                                                  <span className="absolute left-2 top-5 bottom-0 w-px bg-white/12" />
                                                )}
                                                <span
                                                  className={`absolute left-0 top-1.5 h-4 w-4 rounded-full border ${
                                                    index === 0
                                                      ? "border-emerald-400/60 bg-emerald-400/20"
                                                      : "border-white/20 bg-white/5"
                                                  }`}
                                                />

                                                <div className="rounded-xl border border-white/6 bg-white/2 px-3 py-2">
                                                  <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                                                    {entry.label}
                                                  </p>
                                                  {index === 0 && (
                                                    <div className="mt-1 flex items-center gap-2 text-sm">
                                                      <span className="font-semibold tabular-nums text-zinc-100">
                                                        {fmt(
                                                          asset.currentPrice,
                                                        )}
                                                      </span>
                                                      <span
                                                        className={`inline-flex items-center gap-1 tabular-nums ${
                                                          asset.positive
                                                            ? "text-emerald-400"
                                                            : "text-red-400"
                                                        }`}
                                                      >
                                                        {asset.positive ? (
                                                          <ArrowUpRight className="h-3 w-3" />
                                                        ) : (
                                                          <ArrowDownRight className="h-3 w-3" />
                                                        )}
                                                        {Math.abs(
                                                          asset.notableMovePct,
                                                        ).toFixed(1)}
                                                        %
                                                      </span>
                                                    </div>
                                                  )}
                                                  <p className="mt-1.5 text-[13px] leading-6 text-zinc-400">
                                                    {entry.summary}
                                                  </p>
                                                  <p className="mt-1 text-[11px] text-zinc-500">
                                                    {entry.citedCount} cited of{" "}
                                                    {entry.analyzedCount}{" "}
                                                    articles analyzed
                                                  </p>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                ))}
                              </div>
                            )}
                          </section>
                        </div>
                      ) : null}
                    </>
                  )}
                </section>
              </div>
            ) : pathname === "/mcp" ? (
              <div ref={homeSectionRef} className="scroll-mt-24 space-y-6">
                <section className="space-y-3">
                  <div className="space-y-2">
                    <div>
                      <h1 className="text-[22px] font-semibold text-zinc-100">
                        TrueMarkets MCP Capabilities
                      </h1>
                      <p className="mt-1 text-sm text-zinc-500">
                        This page demonstrates what a TrueMarkets MCP + CLI can
                        expose without executing live brokerage actions.
                      </p>
                    </div>
                    <a
                      href="https://zerodha.com/z-connect/featured/connect-your-zerodha-account-to-ai-assistants-with-kite-mcp"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit items-center gap-1 rounded-md border border-white/[0.12] bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:border-white/[0.2] hover:text-zinc-100"
                    >
                      Zerodha MCP reference
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {mcpStatCards.map((card) => (
                      <div
                        key={card.label}
                        className="rounded-[18px] border border-white/[0.07] bg-[#0a0a0a] px-4 py-3.5"
                      >
                        <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                          {card.label}
                        </p>
                        <p className="mt-1 text-[24px] font-semibold tabular-nums text-zinc-100">
                          {card.value}
                        </p>
                        <p className="mt-1 text-[12px] text-zinc-500">
                          {card.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="grid gap-3 xl:grid-cols-2">
                  <div className="rounded-[18px] border border-white/[0.07] bg-[#0a0a0a] p-4">
                    <h2 className="text-sm font-medium text-zinc-200">
                      Capability Coverage
                    </h2>
                    <div className="mt-3 space-y-2.5">
                      {mcpCoverageBars.map((item) => (
                        <div key={item.label}>
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <p className="text-[12px] text-zinc-300">
                              {item.label}
                            </p>
                            <p className="text-[12px] tabular-nums text-zinc-500">
                              {item.value}%
                            </p>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#4f7cff] to-[#23d18b]"
                              style={{ width: `${item.value}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-white/[0.07] bg-[#0a0a0a] p-4">
                    <h2 className="text-sm font-medium text-zinc-200">
                      MCP Latency Trend (Simulated)
                    </h2>
                    <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06] bg-black/30 px-2 py-3">
                      <svg
                        viewBox="0 0 420 130"
                        className="h-[140px] w-full"
                        preserveAspectRatio="none"
                      >
                        <defs>
                          <linearGradient
                            id="mcpLatencyStroke"
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="0"
                          >
                            <stop offset="0%" stopColor="#4f7cff" />
                            <stop offset="100%" stopColor="#23d18b" />
                          </linearGradient>
                        </defs>
                        <path
                          d={mcpLatencyPath}
                          fill="none"
                          stroke="url(#mcpLatencyStroke)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <p className="mt-2 text-[12px] text-zinc-500">
                      Trend shows optimization from ~430ms to sub-200ms tool
                      calls via caching and scoped context payloads.
                    </p>
                  </div>
                </section>

                <section className="space-y-2">
                  <h2 className="text-sm font-medium text-zinc-200">
                    MCP + CLI Capability Matrix
                  </h2>
                  <div className="overflow-hidden border-y border-white/[0.07] bg-[#0a0a0a]">
                    <div className="grid grid-cols-[1.2fr_1fr_1fr_0.75fr_1.2fr] gap-4 border-b border-white/[0.06] px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                      <span>Capability</span>
                      <span>MCP Tool</span>
                      <span>CLI</span>
                      <span>Status</span>
                      <span>Notes</span>
                    </div>
                    {mcpCapabilityMatrix.map((row) => (
                      <div
                        key={`${row.capability}-${row.mcpTool}`}
                        className="grid grid-cols-[1.2fr_1fr_1fr_0.75fr_1.2fr] gap-4 border-b border-white/[0.06] px-4 py-3 text-[13px] last:border-b-0"
                      >
                        <span className="text-zinc-200">{row.capability}</span>
                        <span className="font-mono text-zinc-400">
                          {row.mcpTool}
                        </span>
                        <span className="font-mono text-zinc-400">
                          {row.cli}
                        </span>
                        <span className="text-zinc-300">{row.status}</span>
                        <span className="text-zinc-500">{row.notes}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-[18px] border border-white/[0.07] bg-[#0a0a0a] p-4">
                  <h2 className="text-sm font-medium text-zinc-200">
                    CLI + MCP Positioning
                  </h2>
                  <p className="mt-2 text-[13px] leading-6 text-zinc-400">
                    TrueMarkets can mirror the Zerodha-style MCP blueprint while
                    extending it with AI-native tools. CLI and MCP should share
                    one backend so human operators and AI agents use identical
                    primitives.
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                        Example CLI
                      </p>
                      <p className="mt-1 font-mono text-[12px] text-zinc-300">
                        tm portfolio
                      </p>
                      <p className="mt-1 font-mono text-[12px] text-zinc-300">
                        tm pnl --window 30d
                      </p>
                      <p className="mt-1 font-mono text-[12px] text-zinc-300">
                        tm order buy BTC 100
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                        Example MCP Prompts
                      </p>
                      <p className="mt-1 text-[12px] text-zinc-300">
                        What is my portfolio PnL today?
                      </p>
                      <p className="mt-1 text-[12px] text-zinc-300">
                        Rebalance me to reduce volatility by 10%
                      </p>
                      <p className="mt-1 text-[12px] text-zinc-300">
                        Suggest a hedge across BTC/ETH/SOL
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            ) : pathname === "/trending" ? (
              <div
                ref={homeSectionRef}
                className="scroll-mt-24 flex flex-col gap-5 lg:flex-row lg:items-start"
              >
                <div className="min-w-0 flex-1 space-y-6">
                  <section className="space-y-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                      <div>
                        <h1 className="text-[22px] font-semibold text-zinc-100">
                          Trending
                        </h1>
                        <p className="mt-1 text-sm text-zinc-500">
                          The strongest cross-market movers, highest-conviction
                          prediction markets, and the headlines driving them.
                        </p>
                      </div>
                      <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                        {formatRelativeUpdate(dashboardUpdatedAt)}
                      </span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {trendingCoins.slice(0, 4).map((coin, index) => {
                        const positive = coin.price_change_percentage_24h >= 0;
                        const oneHour = get1hChange(coin);
                        const sevenDay = get7dChange(coin);

                        return (
                          <div
                            key={coin.id}
                            className="rounded-[18px] border border-white/[0.07] bg-[#0a0a0a] p-4 transition-colors hover:border-white/[0.12] hover:bg-[#0d0d0f]"
                          >
                            <div className="mb-4 flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
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
                                  <p className="truncate text-[12px] uppercase tracking-[0.14em] text-zinc-500">
                                    #{index + 1} trending
                                  </p>
                                </div>
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

                            <div className="grid grid-cols-2 gap-3 text-[12px]">
                              <div>
                                <p className="text-zinc-500">Price</p>
                                <p className="mt-1 font-medium tabular-nums text-zinc-100">
                                  {fmt(coin.current_price)}
                                </p>
                              </div>
                              <div>
                                <p className="text-zinc-500">Volume</p>
                                <p className="mt-1 font-medium tabular-nums text-zinc-100">
                                  {fmtBig(coin.total_volume)}
                                </p>
                              </div>
                              <div>
                                <p className="text-zinc-500">1H</p>
                                <p
                                  className={`mt-1 font-medium tabular-nums ${
                                    oneHour >= 0
                                      ? "text-emerald-400"
                                      : "text-red-400"
                                  }`}
                                >
                                  {oneHour >= 0 ? "+" : ""}
                                  {oneHour.toFixed(2)}%
                                </p>
                              </div>
                              <div>
                                <p className="text-zinc-500">7D</p>
                                <p
                                  className={`mt-1 font-medium tabular-nums ${
                                    sevenDay >= 0
                                      ? "text-emerald-400"
                                      : "text-red-400"
                                  }`}
                                >
                                  {sevenDay >= 0 ? "+" : ""}
                                  {sevenDay.toFixed(2)}%
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-medium text-zinc-200">
                        Trending Assets
                      </h2>
                      <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                        Ranked by momentum, volume, and velocity
                      </span>
                    </div>
                    <div className="overflow-hidden border-y border-white/[0.07] bg-[#0a0a0a]">
                      <div className="grid grid-cols-[64px_minmax(0,1.4fr)_0.85fr_0.8fr_0.8fr_0.85fr_110px] gap-4 border-b border-white/[0.06] px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                        <span>Rank</span>
                        <span>Asset</span>
                        <span className="text-right">Price</span>
                        <span className="text-right">1H</span>
                        <span className="text-right">24H</span>
                        <span className="text-right">Volume</span>
                        <span className="text-right">7D Trend</span>
                      </div>
                      {trendingCoins.map((coin, index) => {
                        const oneHour = get1hChange(coin);
                        const oneDay = coin.price_change_percentage_24h ?? 0;

                        return (
                          <div
                            key={coin.id}
                            className="grid grid-cols-[64px_minmax(0,1.4fr)_0.85fr_0.8fr_0.8fr_0.85fr_110px] gap-4 border-b border-white/[0.06] px-4 py-3 last:border-b-0"
                          >
                            <div className="text-sm font-medium tabular-nums text-zinc-500">
                              #{index + 1}
                            </div>
                            <div className="flex min-w-0 items-center gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={coin.image}
                                alt={coin.name}
                                className="h-9 w-9 rounded-full bg-black/30 object-cover"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-[14px] font-medium text-zinc-100">
                                  {coin.name}
                                </p>
                                <p className="truncate text-[12px] uppercase tracking-[0.12em] text-zinc-500">
                                  {coin.symbol}
                                </p>
                              </div>
                            </div>
                            <span className="text-right text-[13px] tabular-nums text-zinc-300">
                              {fmt(coin.current_price)}
                            </span>
                            <span
                              className={`text-right text-[13px] tabular-nums ${
                                oneHour >= 0
                                  ? "text-emerald-400"
                                  : "text-red-400"
                              }`}
                            >
                              {oneHour >= 0 ? "+" : ""}
                              {oneHour.toFixed(2)}%
                            </span>
                            <span
                              className={`text-right text-[13px] tabular-nums ${
                                oneDay >= 0
                                  ? "text-emerald-400"
                                  : "text-red-400"
                              }`}
                            >
                              {oneDay >= 0 ? "+" : ""}
                              {oneDay.toFixed(2)}%
                            </span>
                            <span className="text-right text-[13px] tabular-nums text-zinc-300">
                              {fmtBig(coin.total_volume)}
                            </span>
                            <div className="flex justify-end">
                              <MarketLeaderSparkline
                                data={coin.sparkline_in_7d?.price ?? []}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-medium text-zinc-200">
                        Trending News
                      </h2>
                      {trendingNewsLoading && (
                        <span className="text-xs text-zinc-500">
                          Refreshing...
                        </span>
                      )}
                    </div>
                    <div className="overflow-hidden border-y border-white/[0.07] bg-[#0a0a0a]">
                      {trendingNewsLoading && trendingNews.length === 0 ? (
                        <div className="px-4 py-8 text-sm text-zinc-500">
                          Loading trending headlines...
                        </div>
                      ) : trendingNews.length === 0 ? (
                        <div className="px-4 py-8 text-sm text-zinc-500">
                          No trending headlines available right now.
                        </div>
                      ) : (
                        trendingNews.map((item, index) => (
                          <a
                            key={`${item.link}-${index}`}
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block border-b border-white/[0.06] px-4 py-4 last:border-b-0 transition-colors hover:bg-white/[0.02]"
                          >
                            <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                              {item.source && <span>{item.source}</span>}
                              {item.publishedAt && (
                                <span>{item.publishedAt}</span>
                              )}
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

                <aside className="w-full lg:w-[360px] lg:shrink-0 lg:sticky lg:top-[88px] lg:self-start">
                  <section className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4 text-[#5d7cff]" />
                        <h2 className="text-[15px] font-semibold text-zinc-100">
                          Top Social Mentions
                        </h2>
                      </div>
                    </div>
                    <div className="overflow-hidden border border-white/[0.07] bg-[#0a0a0a]">
                      <div className="max-h-[calc(100vh-150px)] overflow-y-auto divide-y divide-white/[0.06] pr-1">
                        {topSocialMentionPosts.map((item) => (
                          <div
                            key={`${item.authorHandle}-${item.url}`}
                            className="px-4 py-5"
                          >
                            <div className="mb-4 flex items-center gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.authorAvatar}
                                alt={item.authorName}
                                className="h-12 w-12 rounded-full object-cover"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-[14px] font-semibold text-zinc-100">
                                    {item.authorName}
                                  </p>
                                  <span className="truncate text-[13px] text-zinc-500">
                                    {item.authorHandle}
                                  </span>
                                </div>
                                <p className="mt-0.5 flex items-center gap-2 text-[12px] text-zinc-500">
                                  <span>X</span>
                                  <span>
                                    {fmtCount(item.followers)} Followers
                                  </span>
                                  <span className="rounded-full border border-white/[0.08] px-1.5 py-0.5 text-[10px] uppercase">
                                    {item.tokenName}
                                  </span>
                                </p>
                              </div>
                            </div>

                            <p className="mb-4 whitespace-pre-line text-[14px] leading-8 text-zinc-100">
                              {item.text}{" "}
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#5d7cff] hover:text-[#7f96ff]"
                              >
                                Read All
                              </a>
                            </p>

                            {item.mediaUrls && item.mediaUrls.length > 0 && (
                              <div
                                className={`mb-4 grid gap-2 ${
                                  item.mediaUrls.length === 1
                                    ? "grid-cols-1"
                                    : "grid-cols-2"
                                }`}
                              >
                                {item.mediaUrls.slice(0, 2).map((mediaUrl) => (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    key={mediaUrl}
                                    src={mediaUrl}
                                    alt={item.tokenName}
                                    className="h-[150px] w-full rounded-2xl border border-white/[0.06] object-cover"
                                  />
                                ))}
                              </div>
                            )}

                            <div className="flex items-center justify-between gap-3 text-[12px] text-zinc-500">
                              <span>
                                {formatRelativeAgeFromUnix(item.publishTime)}
                              </span>
                              <div className="flex items-center gap-4">
                                <span className="inline-flex items-center gap-1.5">
                                  <Eye className="h-3.5 w-3.5" />
                                  {fmtCount(item.views)}
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                  <Heart className="h-3.5 w-3.5" />
                                  {fmtCount(item.likes)}
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                  <MessageCircleMore className="h-3.5 w-3.5" />
                                  {fmtCount(item.replies)}
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                  <Repeat2 className="h-3.5 w-3.5" />
                                  {fmtCount(item.reposts)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                </aside>
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
                        <span>SOL Dom.</span>
                        <span className="text-zinc-200 font-medium">
                          {solDominancePct !== null
                            ? `${solDominancePct.toFixed(1)}%`
                            : "--"}
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
                          <DiscussionChartCard
                            key={market.id}
                            market={market}
                          />
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
                          <span>
                            {coins.length + predictions.length} live inputs
                          </span>
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
                              const oneDay =
                                coin.price_change_percentage_24h ?? 0;
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
                                        oneHour >= 0
                                          ? "text-emerald-400"
                                          : "text-red-400"
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
                                        oneDay >= 0
                                          ? "text-emerald-400"
                                          : "text-red-400"
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
                                        sevenDay >= 0
                                          ? "text-emerald-400"
                                          : "text-red-400"
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
                                    <span
                                      className={`text-[12px] font-medium tabular-nums ${multipleColor}`}
                                    >
                                      {volumeAdv.toFixed(1)}x
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-center">
                                    <MarketSentimentMeter
                                      score={sentimentScore}
                                    />
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
                                    setMarketLeadersPage((page) =>
                                      Math.max(0, page - 1),
                                    )
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
                                      Math.min(
                                        marketLeadersPageCount - 1,
                                        page + 1,
                                      ),
                                    )
                                  }
                                  disabled={
                                    clampedMarketLeadersPage >=
                                    marketLeadersPageCount - 1
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
                              const oneDay =
                                coin.price_change_percentage_24h ?? 0;
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
                                        oneHour >= 0
                                          ? "text-emerald-400"
                                          : "text-red-400"
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
                                        oneDay >= 0
                                          ? "text-emerald-400"
                                          : "text-red-400"
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
                                        sevenDay >= 0
                                          ? "text-emerald-400"
                                          : "text-red-400"
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
                                    <span
                                      className={`text-[12px] font-medium tabular-nums ${multipleColor}`}
                                    >
                                      {volumeAdv.toFixed(1)}x
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-center">
                                    <MarketSentimentMeter
                                      score={sentimentScore}
                                    />
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
                                    setHighVolumePage((page) =>
                                      Math.max(0, page - 1),
                                    )
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
                                      Math.min(
                                        highVolumePageCount - 1,
                                        page + 1,
                                      ),
                                    )
                                  }
                                  disabled={
                                    clampedHighVolumePage >=
                                    highVolumePageCount - 1
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
                              msg.role === "user"
                                ? "justify-end"
                                : "justify-start"
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
                                  streaming={
                                    streaming && idx === messages.length - 1
                                  }
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
                          {(
                            [
                              ["gainers", "Top Gainers"],
                              ["losers", "Top Losers"],
                            ] as const
                          ).map(([tab, label]) => (
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
                                    isActive
                                      ? sentimentBarColor
                                      : "bg-white/[0.09]"
                                  }`}
                                />
                              ))}
                            </div>
                            <span
                              className={`whitespace-nowrap text-[11px] font-semibold ${sentimentColor}`}
                            >
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
                                  {Math.abs(
                                    coin.price_change_percentage_24h,
                                  ).toFixed(1)}
                                  %
                                </span>
                              </div>

                              <div className="flex items-center justify-end text-right">
                                <span
                                  className={`text-[12px] font-medium tabular-nums ${multipleColor}`}
                                >
                                  {multiple}
                                </span>
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section ref={predictionsSectionRef} className="scroll-mt-24">
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
                            parseFloat(market.outcomePrices?.[0] ?? "0.5") *
                              100,
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
                                        isHigh
                                          ? "text-emerald-400"
                                          : "text-zinc-400"
                                      }
                                    >
                                      Yes{" "}
                                      <span className="font-semibold tabular-nums">
                                        {yesPct}%
                                      </span>
                                    </span>
                                    <span
                                      className={
                                        !isHigh
                                          ? "text-red-400"
                                          : "text-zinc-500"
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
                                      {new Date(
                                        market.endDate,
                                      ).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        year: "2-digit",
                                      })}
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

      {watchlistModalOpen && (
        <div
          className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          onClick={() => setWatchlistModalOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl overflow-hidden rounded-[22px] border border-white/[0.1] bg-[#0a0a0a] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <div>
                <h2 className="text-[16px] font-semibold text-zinc-100">
                  Manage Watchlist Assets
                </h2>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Choose which assets appear in My Watchlist and Watchlist
                  Movers.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWatchlistModalOpen(false)}
                className="text-zinc-600 transition-colors hover:text-zinc-300"
                aria-label="Close watchlist modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 px-5 py-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[13px] font-medium text-zinc-300">
                    Selected Assets
                  </h3>
                  <span className="text-[12px] text-zinc-500">
                    {watchlistDraftIds.length} selected
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {watchlistDraftCoins.map((coin) => (
                    <button
                      key={`selected-${coin.id}`}
                      type="button"
                      onClick={() => removeWatchlistAsset(coin.id)}
                      className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-white/[0.14] hover:bg-white/[0.07]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={coin.image}
                        alt={coin.name}
                        className="h-5 w-5 rounded-full object-cover"
                      />
                      <span>{coin.name}</span>
                      <X className="h-3.5 w-3.5 text-zinc-500" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-[13px] font-medium text-zinc-300">
                  Add Assets
                </h3>
                <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#0d0d10] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-colors hover:border-white/[0.12] focus-within:border-white/[0.18]">
                  <Search className="h-4 w-4 shrink-0 text-zinc-500" />
                  <input
                    type="text"
                    value={watchlistAssetSearch}
                    onChange={(e) => setWatchlistAssetSearch(e.target.value)}
                    placeholder="Search assets by name or symbol..."
                    className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
                  />
                  {watchlistAssetSearch && (
                    <button
                      type="button"
                      onClick={() => setWatchlistAssetSearch("")}
                      className="text-zinc-600 transition-colors hover:text-zinc-300"
                      aria-label="Clear watchlist asset search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="max-h-[260px] overflow-y-auto pr-1">
                  <div className="flex flex-wrap gap-2">
                    {watchlistFilteredChoices.length === 0 ? (
                      <p className="text-sm text-zinc-500">
                        No matching assets available to add.
                      </p>
                    ) : (
                      watchlistFilteredChoices.map((coin) => (
                        <button
                          key={`available-${coin.id}`}
                          type="button"
                          onClick={() => addWatchlistAsset(coin.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#0b0b0d] px-3 py-2 text-sm text-zinc-400 transition-colors hover:border-white/[0.12] hover:text-zinc-200"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={coin.image}
                            alt={coin.name}
                            className="h-5 w-5 rounded-full object-cover"
                          />
                          <span>{coin.name}</span>
                          <span className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">
                            {coin.symbol}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-white/[0.07] px-5 py-4">
              <p className="text-[12px] text-zinc-500">
                Select at least one asset to save your watchlist.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWatchlistModalOpen(false)}
                  className="rounded-full border border-white/[0.08] px-4 py-2 text-sm text-zinc-400 transition-colors hover:border-white/[0.12] hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveWatchlistAssets}
                  disabled={watchlistDraftIds.length === 0}
                  className="rounded-full border border-white/[0.16] bg-white/[0.1] px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/[0.22] hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:bg-white/[0.03] disabled:text-zinc-600"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Trading Dashboard Modal ── */}
      <TradingDashboardModal
        open={showTradingModal}
        onClose={() => setShowTradingModal(false)}
      />

      <div className="fixed bottom-0 left-[62px] right-0 z-50 bg-linear-to-t from-[#000000] via-[#000000]/95 to-transparent px-4 pb-4 pt-6 md:left-[72px] md:px-6 xl:px-8 2xl:px-10">
        <div className="mx-auto max-w-[1480px]">
          <form onSubmit={handleComposerSubmit}>
            <div
              ref={composerMenuRef}
              className="relative flex items-center gap-3 rounded-2xl border border-white/12 bg-[#0a0a0a] px-4 py-3 shadow-[0_0_40px_rgba(0,0,0,0.8)] transition-colors hover:border-white/18 focus-within:border-white/26"
            >
              <button
                type="button"
                onClick={() => setComposerMenuOpen((prev) => !prev)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.12] text-zinc-400 transition-colors hover:border-white/[0.2] hover:text-zinc-200"
                aria-label="Open chat actions"
              >
                <Plus className="h-4 w-4" />
              </button>

              {composerMenuOpen && (
                <div className="absolute bottom-12 left-0 z-20 w-64 rounded-2xl border border-white/[0.08] bg-[#0a0a0a] p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
                  <button
                    type="button"
                    onClick={openUploadPicker}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.05] hover:text-zinc-100"
                  >
                    <span>Upload files or images</span>
                  </button>
                  <button
                    type="button"
                    onClick={enableDeepResearch}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.05] hover:text-zinc-100"
                  >
                    <span>Deep research</span>
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.html,.css,.xml,.yaml,.yml,.pdf"
                className="hidden"
                onChange={(e) => {
                  void handleFilesSelected(e.target.files);
                  e.currentTarget.value = "";
                }}
              />

              {deepResearchMode && (
                <button
                  type="button"
                  onClick={() => setDeepResearchMode(false)}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-400/35 bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-300 transition-colors hover:bg-blue-500/20"
                >
                  Deep Research
                  <X className="h-3 w-3" />
                </button>
              )}

              {pendingAttachments.length > 0 && (
                <div className="flex max-w-[38%] items-center gap-1.5 overflow-x-auto whitespace-nowrap">
                  {pendingAttachments.map((attachment) => (
                    <button
                      key={attachment.name}
                      type="button"
                      onClick={() => removePendingAttachment(attachment.name)}
                      className="inline-flex items-center gap-1 rounded-full border border-white/[0.14] bg-white/[0.04] px-2 py-1 text-[10px] text-zinc-300"
                    >
                      <span className="max-w-[120px] truncate">
                        {attachment.name}
                      </span>
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}

              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={composerPlaceholder}
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
                disabled={
                  (query.trim().length === 0 &&
                    pendingAttachments.length === 0) ||
                  streaming
                }
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
