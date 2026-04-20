import { NextRequest } from "next/server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5";

interface CoinInput {
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
}

interface AllocationOutput {
  symbol: string;
  pct: number;
  reason: string;
}

interface RecommendationResponse {
  allocations: AllocationOutput[];
  strategy: string;
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

const SYSTEM_PROMPT = `You are a crypto portfolio allocation strategist for TrueMarkets.

Given a list of coins with their current prices and market caps, recommend optimal allocation percentages.

Return ONLY strict JSON with this exact schema:
{
  "allocations": [
    { "symbol": "<SYMBOL>", "pct": <integer percentage>, "reason": "<one sentence>" }
  ],
  "strategy": "<one sentence describing the overall strategy>"
}

Rules:
- All percentages must sum to exactly 100.
- Every coin provided in the input MUST appear in the output allocations.
- Do NOT add any coins not in the input.
- pct must be an integer >= 1 for each coin.
- Consider market cap, risk/reward profile, correlation, and current market conditions.
- Favor higher allocation to large-cap stable assets, moderate allocation to mid-cap growth assets, and smaller allocation to high-risk small-cap assets.
- reason must be one concise sentence explaining why that specific allocation was chosen.
- strategy must be one concise sentence describing the overall portfolio approach.
- No markdown, no code fences, no extra keys.`;

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

function parseResponseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const objectStart = text.indexOf("{");
    const objectEnd = text.lastIndexOf("}");
    if (objectStart < 0 || objectEnd <= objectStart) return null;
    try {
      return JSON.parse(text.slice(objectStart, objectEnd + 1));
    } catch {
      return null;
    }
  }
}

function buildFallback(coins: CoinInput[]): RecommendationResponse {
  // Fallback: allocate by market cap
  const totalMcap = coins.reduce((s, c) => s + (c.market_cap || 1), 0);
  const raw = coins.map((c) => ((c.market_cap || 1) / totalMcap) * 100);
  const floored = raw.map(Math.floor);
  // Ensure min 1%
  const adjusted = floored.map((v) => Math.max(v, 1));
  let remainder = 100 - adjusted.reduce((a, b) => a + b, 0);
  const decimals = raw
    .map((v, i) => ({ i, d: v - adjusted[i] }))
    .sort((a, b) => b.d - a.d);
  for (const { i } of decimals) {
    if (remainder <= 0) break;
    adjusted[i]++;
    remainder--;
  }
  // If over 100 due to min 1% enforcement, trim from largest
  while (adjusted.reduce((a, b) => a + b, 0) > 100) {
    const maxIdx = adjusted.indexOf(Math.max(...adjusted));
    adjusted[maxIdx]--;
  }

  return {
    allocations: coins.map((c, i) => ({
      symbol: c.symbol,
      pct: adjusted[i],
      reason: "Allocated proportionally by market capitalization.",
    })),
    strategy:
      "Market-cap weighted allocation as AI recommendation is unavailable.",
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { coins: CoinInput[] };
  const coins = Array.isArray(body.coins) ? body.coins : [];

  if (coins.length === 0) {
    return Response.json(
      { error: "No coins provided" },
      { status: 400 },
    );
  }

  const fallback = buildFallback(coins);

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
        temperature: 0.3,
        max_tokens: 600,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              coins: coins.map((c) => ({
                symbol: c.symbol,
                name: c.name,
                current_price: c.current_price,
                market_cap: c.market_cap,
              })),
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
    const parsed = parseResponseJson(rawText) as RecommendationResponse | null;

    if (
      !parsed ||
      !Array.isArray(parsed.allocations) ||
      parsed.allocations.length === 0
    ) {
      return Response.json(fallback);
    }

    // Validate: all symbols present, percentages sum to 100
    const inputSymbols = new Set(
      coins.map((c) => c.symbol.toLowerCase()),
    );
    const validAllocations = parsed.allocations.filter((a) =>
      inputSymbols.has(a.symbol.toLowerCase()),
    );

    const totalPct = validAllocations.reduce((s, a) => s + (a.pct || 0), 0);
    if (validAllocations.length !== coins.length || totalPct !== 100) {
      return Response.json(fallback);
    }

    return Response.json({
      allocations: validAllocations,
      strategy:
        typeof parsed.strategy === "string"
          ? parsed.strategy
          : fallback.strategy,
    });
  } catch {
    return Response.json(fallback);
  }
}
