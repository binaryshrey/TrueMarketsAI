import { NextRequest } from "next/server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5";

type PortfolioRiskLabel = "Low" | "Medium" | "High";
type ProfileShift = "Safer" | "Balanced" | "Aggressive";

interface AllocationSimulationResult {
  simulatedPortfolio: {
    expectedReturnPct: number;
    riskLabel: PortfolioRiskLabel;
    maxDrawdownPct: number;
    sharpe: number;
  };
  impact: {
    netPnlImpact: number;
    riskReductionPct: number;
    profileShift: ProfileShift;
  };
  recommendations: string[];
}

interface SimulationRequestPayload {
  currentPortfolio: {
    equity: number;
    returnPct: number;
    riskLabel: PortfolioRiskLabel;
    volatilityPct: number;
    maxDrawdownPct: number;
    sharpe: number;
  };
  proposedAllocations: Array<{
    symbol: string;
    currentPct: number;
    targetPct: number;
    expectedReturnPct: number;
    volatilityPct: number;
    maxDrawdownPct: number;
  }>;
  localProjection: AllocationSimulationResult;
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

const SYSTEM_PROMPT = `You are a quantitative portfolio risk analyst.
Given the current portfolio metrics and proposed allocations, return ONLY JSON with this exact schema:
{
  "simulatedPortfolio": {
    "expectedReturnPct": number,
    "riskLabel": "Low" | "Medium" | "High",
    "maxDrawdownPct": number,
    "sharpe": number
  },
  "impact": {
    "netPnlImpact": number,
    "riskReductionPct": number,
    "profileShift": "Safer" | "Balanced" | "Aggressive"
  },
  "recommendations": ["string", "string", "string"]
}
Rules:
- Keep values numeric and finite.
- maxDrawdownPct should be <= 0.
- riskReductionPct is positive when risk decreases.
- profileShift reflects simulated vs current risk.
- recommendations should be concise, action-oriented portfolio suggestions.
- Do not include markdown fences or any extra text.`;

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeRiskLabel(
  value: unknown,
  fallback: PortfolioRiskLabel,
): PortfolioRiskLabel {
  if (value === "Low" || value === "Medium" || value === "High") return value;
  return fallback;
}

function normalizeProfileShift(
  value: unknown,
  fallback: ProfileShift,
): ProfileShift {
  if (value === "Safer" || value === "Balanced" || value === "Aggressive") {
    return value;
  }
  return fallback;
}

function normalizeResult(
  value: unknown,
  fallback: AllocationSimulationResult,
): AllocationSimulationResult {
  if (!value || typeof value !== "object") return fallback;

  const root = value as Record<string, unknown>;
  const simulated = root.simulatedPortfolio as
    | Record<string, unknown>
    | undefined;
  const impact = root.impact as Record<string, unknown> | undefined;
  const recommendations = Array.isArray(root.recommendations)
    ? root.recommendations
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return {
    simulatedPortfolio: {
      expectedReturnPct: asFiniteNumber(
        simulated?.expectedReturnPct,
        fallback.simulatedPortfolio.expectedReturnPct,
      ),
      riskLabel: normalizeRiskLabel(
        simulated?.riskLabel,
        fallback.simulatedPortfolio.riskLabel,
      ),
      maxDrawdownPct: Math.min(
        0,
        asFiniteNumber(
          simulated?.maxDrawdownPct,
          fallback.simulatedPortfolio.maxDrawdownPct,
        ),
      ),
      sharpe: asFiniteNumber(
        simulated?.sharpe,
        fallback.simulatedPortfolio.sharpe,
      ),
    },
    impact: {
      netPnlImpact: asFiniteNumber(
        impact?.netPnlImpact,
        fallback.impact.netPnlImpact,
      ),
      riskReductionPct: asFiniteNumber(
        impact?.riskReductionPct,
        fallback.impact.riskReductionPct,
      ),
      profileShift: normalizeProfileShift(
        impact?.profileShift,
        fallback.impact.profileShift,
      ),
    },
    recommendations:
      recommendations.length > 0 ? recommendations : fallback.recommendations,
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

export async function POST(req: NextRequest) {
  const body = (await req.json()) as SimulationRequestPayload;
  const fallback = body?.localProjection;

  if (!fallback) {
    return Response.json({ error: "Missing localProjection" }, { status: 400 });
  }

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
        temperature: 0,
        max_tokens: 180,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              currentPortfolio: body.currentPortfolio,
              proposedAllocations: body.proposedAllocations,
              localProjection: body.localProjection,
            }),
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
