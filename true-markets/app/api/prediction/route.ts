import { NextRequest, NextResponse } from "next/server";

interface RawMarket {
  id: string;
  question?: string;
  outcomes?: string | string[];
  outcomePrices?: string | string[];
  clobTokenIds?: string | string[];
  volume?: string | number;
  endDate?: string;
  image?: string;
  active?: boolean;
  closed?: boolean;
}

interface RawEvent {
  id: string;
  slug?: string;
  title?: string;
  active?: boolean;
  closed?: boolean;
  endDate?: string;
  image?: string;
  volume?: string | number;
  markets?: RawMarket[];
}

function parseField<T>(value: T | string | undefined): T | undefined {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return value as T;
}

interface PriceHistoryPoint {
  t: number;
  p: number;
}

interface DiscussionOption {
  label: string;
  price: number;
  tokenId?: string | null;
  history: PriceHistoryPoint[];
}

async function fetchHistory(tokenId: string): Promise<PriceHistoryPoint[]> {
  const historyResponse = await fetch(
    `https://clob.polymarket.com/prices-history?market=${encodeURIComponent(tokenId)}&interval=1w&fidelity=240`,
    {
      headers: { Accept: "application/json" },
      next: { revalidate: 120 },
    },
  );

  if (!historyResponse.ok) {
    throw new Error(`Polymarket history ${historyResponse.status}`);
  }

  const payload = (await historyResponse.json()) as {
    history?: Array<{ t?: number; p?: number }>;
  };

  return (payload.history ?? [])
    .filter(
      (point): point is { t: number; p: number } =>
        typeof point.t === "number" && typeof point.p === "number",
    )
    .map((point) => ({
      t: point.t,
      p: point.p,
    }));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") === "grid" ? "grid" : "dashboard";
    const requestedLimit = Number.parseInt(searchParams.get("limit") ?? "", 10);
    const eventLimit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, 120))
      : mode === "grid"
        ? 90
        : 12;

    const response = await fetch(
      `https://gamma-api.polymarket.com/events?active=true&closed=false&limit=${eventLimit}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 120 },
      },
    );

    if (!response.ok) {
      throw new Error(`Polymarket ${response.status}`);
    }

    const raw: RawEvent[] = await response.json();

    const selectedEvents = raw
      .filter(
        (e) => e.active && !e.closed && (e.title || e.markets?.[0]?.question),
      )
      .slice(0, mode === "grid" ? eventLimit : 6);

    const markets = await Promise.all(
      selectedEvents.map(async (e) => {
        const firstMarket = e.markets?.[0];
        const outcomes = parseField<string[]>(firstMarket?.outcomes) ?? [
          "Yes",
          "No",
        ];
        const outcomePrices = parseField<string[]>(
          firstMarket?.outcomePrices,
        ) ?? ["0.5", "0.5"];
        const clobTokenIds =
          parseField<string[]>(firstMarket?.clobTokenIds) ?? [];

        const discussionOptionsRaw = await Promise.all(
          (e.markets ?? [])
            .slice(0, mode === "grid" ? 40 : 8)
            .map(async (market) => {
              const marketQuestion = market.question?.trim();
              if (!marketQuestion) return null;

              const marketPrices = parseField<string[]>(
                market.outcomePrices,
              ) ?? ["0.5", "0.5"];
              const marketTokenIds =
                parseField<string[]>(market.clobTokenIds) ?? [];
              const yesTokenId = marketTokenIds[0];

              let history: PriceHistoryPoint[] = [];
              if (yesTokenId && mode !== "grid") {
                try {
                  history = await fetchHistory(yesTokenId);
                } catch {
                  history = [];
                }
              }

              return {
                label: marketQuestion,
                price: Number.parseFloat(marketPrices[0] ?? "0"),
                tokenId: yesTokenId ?? null,
                history,
              } satisfies DiscussionOption;
            }),
        );
        const discussionOptionsBase = discussionOptionsRaw.filter(
          (
            option,
          ): option is Exclude<(typeof discussionOptionsRaw)[number], null> =>
            option !== null,
        );
        const discussionOptions =
          mode === "grid"
            ? await Promise.all(
                discussionOptionsBase
                  .sort((a, b) => b.price - a.price)
                  .map(async (option, index) => {
                    if (index >= 2 || !option.tokenId) {
                      return option;
                    }

                    try {
                      const history = await fetchHistory(option.tokenId);
                      return { ...option, history };
                    } catch {
                      return option;
                    }
                  }),
              )
            : discussionOptionsBase;

        const histories =
          mode === "grid"
            ? outcomes.slice(0, 2).map((label, index) => ({
                label,
                tokenId: clobTokenIds[index] ?? null,
                history: [] as PriceHistoryPoint[],
              }))
            : await Promise.all(
                outcomes.slice(0, 2).map(async (label, index) => {
                  const tokenId = clobTokenIds[index];

                  if (!tokenId) {
                    return {
                      label,
                      tokenId: null,
                      history: [] as PriceHistoryPoint[],
                    };
                  }

                  try {
                    const history = await fetchHistory(tokenId);
                    return {
                      label,
                      tokenId,
                      history,
                    };
                  } catch {
                    return {
                      label,
                      tokenId,
                      history: [] as PriceHistoryPoint[],
                    };
                  }
                }),
              );

        return {
          id: e.id,
          slug: e.slug ?? null,
          question: e.title ?? firstMarket?.question ?? "",
          outcomes,
          outcomePrices,
          histories,
          discussionOptions,
          volume: String(e.volume ?? firstMarket?.volume ?? "0"),
          endDate: e.endDate ?? null,
          image: e.image ?? null,
        };
      }),
    );

    return NextResponse.json(markets);
  } catch (error) {
    console.error("Prediction market API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch prediction markets" },
      { status: 500 },
    );
  }
}
