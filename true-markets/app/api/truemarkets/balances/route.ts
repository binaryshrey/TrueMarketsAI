import { NextRequest, NextResponse } from "next/server";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { getTrueMarketsServerConfig } from "@/lib/truemarkets";

export const runtime = "nodejs";
const execFile = promisify(execFileCb);

interface RawBalance {
  [key: string]: unknown;
}

interface RawBalanceResponse {
  balances?: RawBalance[];
  message?: string;
  error?: string;
}

interface NormalizedBalance {
  id: string;
  chain: string;
  asset: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string | null;
  tradeable: boolean;
  stable: boolean;
  balance: string;
  price_usd?: number;
  value_usd?: number;
}

function normalizeBalance(balance: RawBalance): NormalizedBalance {
  return {
    id: toText(balance.id),
    chain: toText(balance.chain),
    asset: toText(balance.asset),
    symbol: toText(balance.symbol),
    name: toText(balance.name),
    decimals: toNum(balance.decimals),
    icon: typeof balance.icon === "string" ? balance.icon : null,
    tradeable: Boolean(balance.tradeable),
    stable: Boolean(balance.stable),
    balance: toText(balance.balance, "0"),
  };
}

async function fetchCliPriceUsd(symbol: string): Promise<number | null> {
  try {
    const { stdout } = await execFile("tm", ["price", symbol, "-o", "json"], {
      timeout: 20_000,
      maxBuffer: 2 * 1024 * 1024,
    });

    const payload = JSON.parse(stdout) as RawBalance;
    const price = toNum(payload.price, Number.NaN);
    if (!Number.isFinite(price) || price <= 0) return null;
    return price;
  } catch {
    return null;
  }
}

async function enrichBalancesWithCliPrices(
  balances: NormalizedBalance[],
): Promise<NormalizedBalance[]> {
  const nonStableSymbols = Array.from(
    new Set(
      balances
        .filter((balance) => !balance.stable)
        .map((balance) => balance.symbol.toUpperCase())
        .filter((symbol) => symbol.length > 0),
    ),
  );

  const pricePairs = await Promise.all(
    nonStableSymbols.map(
      async (symbol) => [symbol, await fetchCliPriceUsd(symbol)] as const,
    ),
  );
  const priceBySymbol = new Map<string, number>();
  for (const [symbol, price] of pricePairs) {
    if (Number.isFinite(price) && price !== null && price > 0) {
      priceBySymbol.set(symbol, price);
    }
  }

  return balances.map((balance) => {
    const quantity = Math.max(toNum(balance.balance), 0);
    const priceUsd = balance.stable
      ? 1
      : priceBySymbol.get(balance.symbol.toUpperCase());

    if (
      !Number.isFinite(priceUsd) ||
      typeof priceUsd !== "number" ||
      priceUsd <= 0
    ) {
      return balance;
    }

    return {
      ...balance,
      price_usd: priceUsd,
      value_usd: quantity * priceUsd,
    };
  });
}

async function fetchBalancesViaCli(includeEvm: boolean) {
  try {
    const { stdout } = await execFile("tm", ["balances", "-o", "json"], {
      timeout: 20_000,
      maxBuffer: 2 * 1024 * 1024,
    });

    const payload = JSON.parse(stdout) as RawBalanceResponse;
    if (!Array.isArray(payload.balances)) return null;

    const balances = payload.balances
      .map((balance) => normalizeBalance(balance))
      .filter((balance) => (includeEvm ? true : balance.chain !== "evm"));
    const balancesWithPricing = await enrichBalancesWithCliPrices(balances);

    return {
      balances: balancesWithPricing,
      source: "tm-cli",
      fetched_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function buildBalancesUrl(
  baseUrl: string,
  includeEvm: boolean,
  openApiVersion: string,
) {
  const normalized = baseUrl.replace(/\/$/, "");
  const baseWithPath = /\/v1\/defi\/core\/?$/.test(normalized)
    ? normalized
    : `${normalized}/v1/defi/core`;
  const endpoint = `${baseWithPath}/balances`;
  const params = new URLSearchParams();

  if (includeEvm) {
    params.set("evm", "true");
  }
  params.set("openapiVersion", openApiVersion);

  return `${endpoint}?${params.toString()}`;
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: NextRequest) {
  const includeEvm = request.nextUrl.searchParams.get("evm") !== "false";
  const forceCli =
    request.nextUrl.searchParams.get("source")?.toLowerCase() === "cli";

  if (forceCli) {
    const cliData = await fetchBalancesViaCli(includeEvm);
    if (cliData) {
      return NextResponse.json({
        ...cliData,
        source: "tm-cli",
        forced_source: true,
      });
    }

    return NextResponse.json(
      {
        error:
          "Failed to load TrueMarkets balances via tm CLI. Ensure tm is installed and authenticated.",
      },
      { status: 503 },
    );
  }

  const {
    baseUrl,
    bearerToken,
    keyFilePath,
    openApiVersion,
    appPlatform,
    appVersion,
    userAgent,
    acceptLanguage,
    baggage,
    sentryTrace,
  } = getTrueMarketsServerConfig();
  const endpoint = buildBalancesUrl(baseUrl, includeEvm, openApiVersion);

  const headers: HeadersInit = {
    Accept: "*/*",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": acceptLanguage,
    Connection: "keep-alive",
    "x-app-platform": appPlatform,
    "x-app-version": appVersion,
    "User-Agent": userAgent,
  };

  if (baggage) {
    headers.baggage = baggage;
  }

  if (sentryTrace) {
    headers["sentry-trace"] = sentryTrace;
  }

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? ((await response.json().catch(() => ({}))) as RawBalanceResponse)
      : ({} as RawBalanceResponse);
    const rawBody = contentType.includes("application/json")
      ? ""
      : await response.text().catch(() => "");
    const cfMitigated = response.headers.get("cf-mitigated") === "challenge";

    if (!response.ok) {
      if (response.status === 403 && cfMitigated) {
        const cliFallback = await fetchBalancesViaCli(includeEvm);
        if (cliFallback) {
          return NextResponse.json({
            ...cliFallback,
            upstream_status: response.status,
            cf_mitigated: true,
            fallback: "tm-cli",
          });
        }
      }

      const baseMessage =
        payload.error ||
        payload.message ||
        (rawBody ? rawBody.slice(0, 180) : "") ||
        `Failed to load TrueMarkets balances (${response.status}).`;

      const tokenHint =
        response.status === 401
          ? !bearerToken
            ? keyFilePath
              ? " Could not generate a bearer token from the configured API key file. Verify key format/algorithm (ES256)."
              : " Set TRUEMARKETS_DEFI_BEARER_TOKEN or provide TRUEMARKETS_API_KEY_FILE (or truemarkets-api-key-*.json in project root)."
            : ""
          : "";

      const challengeHint =
        response.status === 403 && cfMitigated
          ? " Upstream blocked this request with a Cloudflare challenge; request allowlisting or server-to-server access with TrueMarkets support may be required."
          : "";

      return NextResponse.json(
        {
          error: `${baseMessage}${tokenHint}${challengeHint}`,
          source: endpoint,
          upstream_status: response.status,
          cf_mitigated: cfMitigated,
        },
        { status: response.status },
      );
    }

    const balances = Array.isArray(payload.balances)
      ? payload.balances.map((balance) => normalizeBalance(balance))
      : [];

    return NextResponse.json({
      balances,
      fetched_at: new Date().toISOString(),
      source: endpoint,
    });
  } catch (err) {
    const cliFallback = await fetchBalancesViaCli(includeEvm);
    if (cliFallback) {
      return NextResponse.json({
        ...cliFallback,
        fallback: "tm-cli",
      });
    }

    const message =
      err instanceof Error
        ? err.message
        : "Failed to load TrueMarkets balances.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
