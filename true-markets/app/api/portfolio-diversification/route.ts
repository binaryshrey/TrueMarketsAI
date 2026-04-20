import { NextRequest } from "next/server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5";

interface AllocationInput {
  label: string;
  pct: number;
  value?: number;
}

interface DiversificationInsight {
  score: number;
  grade: string;
  summary: string;
  recommendation: string;
  improvementPoints: number;
}

interface DiversificationRequestPayload {
  allocations: AllocationInput[];
  localProjection?: DiversificationInsight;
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

const SYSTEM_PROMPT = `You are a portfolio diversification analyst.
Return ONLY strict JSON with this exact schema:
{
  "score": number,
  "grade": string,
  "summary": string,
  "recommendation": string,
  "improvementPoints": number
}
Rules:
- score is an integer between 0 and 100.
- grade should look like A+, A, A-, B+, B, B-, C+, C, C-, or D.
- summary must be one concise sentence that starts with "Grade <grade>".
- recommendation must be one concise actionable sentence for a CRYPTO-ONLY portfolio.
- Do not recommend traditional assets such as equities, stocks, bonds, treasuries, gold, commodities, or ETFs.
- recommendation must ONLY adjust allocation percentages among labels that already exist in the input allocations.
- Do NOT suggest adding, introducing, or buying any new coin/asset not already in the current portfolio labels.
- improvementPoints is an integer showing realistic score uplift if recommendation is applied.
- No markdown, no code fences, no extra keys.`;

const NON_CRYPTO_RECOMMENDATION_REGEX =
  /\b(traditional assets?|equit(?:y|ies)|stocks?|bonds?|treasur(?:y|ies)|commodit(?:y|ies)|gold|etf|etfs)\b/i;
const NEW_ASSET_ACTION_REGEX =
  /\b(add|introduce|new\s+coin|new\s+asset|new\s+position|buy\s+into|outside|beyond|broaden|expand)\b/i;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function scoreToGrade(score: number): string {
  if (score >= 93) return "A";
  if (score >= 88) return "A-";
  if (score >= 82) return "B+";
  if (score >= 75) return "B";
  if (score >= 68) return "B-";
  if (score >= 60) return "C+";
  if (score >= 52) return "C";
  if (score >= 44) return "C-";
  return "D";
}

function buildInPortfolioRebalanceRecommendation(
  allocations: Array<{ label: string; pct: number }>,
  improvementPoints: number,
): string {
  const [first, second, third] = allocations;

  if (!first || !second) {
    return "Use only your current coins: with fewer than two active allocations, a cross-coin rebalance recommendation is not available yet.";
  }

  const transfer = Math.round(clamp((first.pct - second.pct) * 0.24, 2, 12));
  const secondShare = third ? Math.round(transfer * 0.65) : transfer;
  const thirdShare = third ? transfer - secondShare : 0;

  const firstTarget = Math.max(0, Math.round(first.pct - transfer));
  const secondTarget = Math.min(100, Math.round(second.pct + secondShare));

  if (third && thirdShare > 0) {
    const thirdTarget = Math.min(100, Math.round(third.pct + thirdShare));
    return `Rebalance within current holdings by moving ${transfer}% from ${first.label} into ${second.label} (+${secondShare}%) and ${third.label} (+${thirdShare}%), targeting roughly ${firstTarget}%/${secondTarget}%/${thirdTarget}% for those three positions and a potential +${improvementPoints} score uplift.`;
  }

  return `Rebalance within current holdings by moving ${transfer}% from ${first.label} to ${second.label}, targeting roughly ${firstTarget}% ${first.label} and ${secondTarget}% ${second.label}, with a potential +${improvementPoints} score uplift.`;
}

function buildLocalProjection(
  allocations: AllocationInput[],
): DiversificationInsight {
  const cleanAllocations = allocations
    .map((item) => ({
      label: item.label?.trim() || "Asset",
      pct: clamp(asFiniteNumber(item.pct, 0), 0, 100),
    }))
    .filter((item) => item.pct > 0)
    .sort((a, b) => b.pct - a.pct);

  if (cleanAllocations.length === 0) {
    return {
      score: 50,
      grade: "C",
      summary:
        "Grade C - insufficient allocation data to assess diversification with confidence.",
      recommendation:
        "Use only your current coins: with no active allocations, a cross-coin rebalance recommendation is not available yet.",
      improvementPoints: 8,
    };
  }

  const hhi = cleanAllocations.reduce(
    (sum, item) => sum + (item.pct / 100) ** 2,
    0,
  );
  const dominantWeight = cleanAllocations[0]?.pct ?? 0;
  const majorBuckets = cleanAllocations.filter((item) => item.pct >= 10).length;
  const effectiveCount = hhi > 0 ? 1 / hhi : 1;

  const rawScore =
    90 -
    dominantWeight * 0.42 -
    hhi * 110 +
    Math.min(12, majorBuckets * 2.5) +
    Math.min(8, effectiveCount * 1.4);
  const score = Math.round(clamp(rawScore, 28, 96));
  const grade = scoreToGrade(score);
  const improvementPoints = Math.round(clamp((86 - score) * 0.28, 3, 12));

  const topLabel = cleanAllocations[0].label;

  const summary =
    score >= 82
      ? `Grade ${grade} - strong diversification, with exposure spread across ${majorBuckets} meaningful allocations.`
      : score >= 68
        ? `Grade ${grade} - decent diversification, but concentration in ${topLabel} still elevates portfolio risk.`
        : `Grade ${grade} - concentration risk is elevated, led by a heavy ${topLabel} allocation.`;

  const recommendation = buildInPortfolioRebalanceRecommendation(
    cleanAllocations,
    improvementPoints,
  );

  return {
    score,
    grade,
    summary,
    recommendation,
    improvementPoints,
  };
}

function parseResponseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const objectStart = text.indexOf("{");
    const objectEnd = text.lastIndexOf("}");
    if (objectStart < 0 || objectEnd <= objectStart) return null;

    const candidate = text.slice(objectStart, objectEnd + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

function extractMessageText(payload: OpenRouterResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === "string" ? item.text : ""))
      .join("\n")
      .trim();
  }

  return "";
}

function normalizeResult(
  value: unknown,
  fallback: DiversificationInsight,
): DiversificationInsight {
  if (!value || typeof value !== "object") return fallback;

  const root = value as Record<string, unknown>;
  const score = Math.round(
    clamp(asFiniteNumber(root.score, fallback.score), 0, 100),
  );
  const grade = normalizeText(root.grade, scoreToGrade(score));
  const improvementPoints = Math.round(
    clamp(
      asFiniteNumber(root.improvementPoints, fallback.improvementPoints),
      1,
      25,
    ),
  );

  const rawRecommendation = normalizeText(
    root.recommendation,
    fallback.recommendation,
  );
  const safeRecommendation = NON_CRYPTO_RECOMMENDATION_REGEX.test(
    rawRecommendation,
  )
    ? fallback.recommendation
    : NEW_ASSET_ACTION_REGEX.test(rawRecommendation)
      ? fallback.recommendation
      : fallback.recommendation;

  return {
    score,
    grade,
    summary: normalizeText(
      root.summary,
      `Grade ${grade} - diversification assessment is currently unavailable.`,
    ),
    recommendation: safeRecommendation,
    improvementPoints,
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as DiversificationRequestPayload;
  const allocations = Array.isArray(body.allocations) ? body.allocations : [];
  const fallback = body.localProjection ?? buildLocalProjection(allocations);

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json(fallback);
  }

  try {
    const openRouterResponse = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": req.nextUrl.origin,
        "X-Title": "TrueMarkets",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature: 0.15,
        max_tokens: 220,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({ allocations, fallback }),
          },
        ],
      }),
    });

    if (!openRouterResponse.ok) {
      return Response.json(fallback);
    }

    const payload = (await openRouterResponse.json()) as OpenRouterResponse;
    const rawText = extractMessageText(payload);
    const parsed = parseResponseJson(rawText);
    const normalized = normalizeResult(parsed, fallback);

    return Response.json(normalized);
  } catch {
    return Response.json(fallback);
  }
}
