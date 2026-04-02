import { NextRequest } from "next/server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5";
const OPENROUTER_DEEP_RESEARCH_MODEL =
  process.env.OPENROUTER_DEEP_RESEARCH_MODEL ?? OPENROUTER_MODEL;

const MAX_ATTACHMENT_COUNT = 5;
const MAX_ATTACHMENT_TEXT_CHARS = 12000;

type ChatAttachmentPayload = {
  name: string;
  mimeType: string;
  kind: "image" | "text" | "binary";
  size: number;
  textContent?: string;
  imageDataUrl?: string;
};

const SYSTEM_PROMPT = `You are a market assistant for crypto, equities, and ETFs. Detect the user's intent:

1. If they ask about THEIR PORTFOLIO, OPEN POSITIONS, P&L, ACCOUNT PERFORMANCE, PENDING ORDERS, PARTIALLY FILLED ORDERS, or FILLED ORDERS, respond with:
__PORTFOLIO_CARD__{"scope":"account"}

Then on the next line add 1-2 concise sentences summarizing what you'll show.

2. If they ask about the CURRENT PRICE, trading data, market stats, chart, or performance of a specific asset, respond with one asset card marker in this exact format:

For CRYPTO:
__ASSET_CARD__{"assetType":"crypto","coinId":"<coingecko-id>","symbol":"<TICKER>","name":"<Full Name>"}

For EQUITIES/ETFs:
__ASSET_CARD__{"assetType":"equity","symbol":"<TICKER>","name":"<Company or ETF Name>"}

If the user specifically wants to BUY, PURCHASE, or TRADE the asset, include "buyIntent":true.

Then on the very next line add 2–3 sentences of concise market context: current price level, recent price action/trend, and one key insight. Use **bold** for key figures. If buyIntent is true, end with a brief risk note.

Use official CoinGecko IDs for crypto and standard uppercase tickers for equities/ETFs (e.g., NVDA, AAPL, SPY, QQQ, TSLA, MSFT).

3. For ALL other questions (market analysis, trends, predictions, explanations, comparisons, general knowledge) respond normally. Use **bold** for key terms and bullet points for lists. Keep responses under 350 words.

When a <portfolio_context_json> block is present in the user message, treat it as the latest portfolio snapshot and use it for follow-up reasoning about positions, P&L, risk, order status, and trade ideas. Do not claim live refresh unless explicitly requested.
When a <news_context_json> block is present, use those headlines as the latest related context when answering follow-up questions. Reference them when useful and keep links in the UI separate (they are rendered by the client).

After every normal text response (not asset card), append exactly:
**Sources:** [pick all that apply, separated by " · ": CoinGecko (for crypto price/market data), Yahoo Finance (for equity/ETF market data), Alpaca (for account/portfolio/order data), Polymarket (for prediction markets), Alternative.me (for fear & greed sentiment), Claude AI (for analysis, trends, general knowledge)]`;

export async function POST(req: NextRequest) {
  if (!process.env.OPENROUTER_API_KEY) {
    return new Response("Missing OPENROUTER_API_KEY", { status: 500 });
  }

  const { message, portfolioContext, newsContext, deepResearch, attachments } =
    (await req.json()) as {
      message: string;
      portfolioContext?: unknown;
      newsContext?: unknown;
      deepResearch?: boolean;
      attachments?: ChatAttachmentPayload[];
    };

  const hasPortfolioContext =
    portfolioContext !== null && portfolioContext !== undefined;
  const hasNewsContext = newsContext !== null && newsContext !== undefined;
  const portfolioContextText = hasPortfolioContext
    ? JSON.stringify(portfolioContext)
    : "";
  const newsContextText = hasNewsContext ? JSON.stringify(newsContext) : "";

  const contextBlocks: string[] = [];
  if (hasPortfolioContext) {
    contextBlocks.push(`<portfolio_context_json>
${portfolioContextText}
</portfolio_context_json>`);
  }
  if (hasNewsContext) {
    contextBlocks.push(`<news_context_json>
${newsContextText}
</news_context_json>`);
  }

  const normalizedAttachments = Array.isArray(attachments)
    ? attachments.slice(0, MAX_ATTACHMENT_COUNT)
    : [];

  const attachmentBlocks: string[] = [];
  const imageAttachments: Array<{ name: string; imageDataUrl: string }> = [];

  for (const attachment of normalizedAttachments) {
    if (!attachment?.name || !attachment?.mimeType || !attachment?.kind) {
      continue;
    }

    if (
      attachment.kind === "image" &&
      typeof attachment.imageDataUrl === "string" &&
      attachment.imageDataUrl.startsWith("data:")
    ) {
      imageAttachments.push({
        name: attachment.name,
        imageDataUrl: attachment.imageDataUrl,
      });
      continue;
    }

    if (attachment.kind === "text") {
      const truncatedText = (attachment.textContent ?? "").slice(
        0,
        MAX_ATTACHMENT_TEXT_CHARS,
      );
      attachmentBlocks.push(`<attachment name="${attachment.name}" mime_type="${attachment.mimeType}" kind="text">
${truncatedText || "[empty text file]"}
</attachment>`);
      continue;
    }

    attachmentBlocks.push(
      `<attachment name="${attachment.name}" mime_type="${attachment.mimeType}" kind="binary">binary file attached (${attachment.size} bytes)</attachment>`,
    );
  }

  if (attachmentBlocks.length > 0 || imageAttachments.length > 0) {
    const imageSummary = imageAttachments.length
      ? `Attached images: ${imageAttachments.map((item) => item.name).join(", ")}`
      : "";
    const textSummary = attachmentBlocks.length
      ? attachmentBlocks.join("\n\n")
      : "";
    contextBlocks.push(`<attachments>
${[imageSummary, textSummary].filter(Boolean).join("\n\n")}
</attachments>`);
  }

  const userContent = contextBlocks.length
    ? `${contextBlocks.join("\n\n")}

User question:
${message}`
    : message;

  const deepResearchPrompt = `\n\nDeep Research Mode:\n- Perform thorough, methodical analysis before answering.\n- If files or images are attached, prioritize extracting evidence from them.\n- Explicitly distinguish facts, assumptions, and uncertainties.\n- Return a concise conclusion first, then supporting points.`;

  const activeSystemPrompt = deepResearch
    ? `${SYSTEM_PROMPT}${deepResearchPrompt}`
    : SYSTEM_PROMPT;

  const userMessageContent = imageAttachments.length
    ? [
        { type: "text", text: userContent },
        ...imageAttachments.map((item) => ({
          type: "image_url" as const,
          image_url: { url: item.imageDataUrl },
        })),
      ]
    : userContent;

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": req.nextUrl.origin,
            "X-Title": "TrueMarkets",
          },
          body: JSON.stringify({
            model: deepResearch
              ? OPENROUTER_DEEP_RESEARCH_MODEL
              : OPENROUTER_MODEL,
            stream: true,
            max_tokens: 1024,
            temperature: 0.2,
            messages: [
              { role: "system", content: activeSystemPrompt },
              { role: "user", content: userMessageContent },
            ],
          }),
        });

        if (!response.ok || !response.body) {
          const errorText = await response.text();
          throw new Error(
            `OpenRouter ${response.status}: ${errorText.slice(0, 400)}`,
          );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const flushSseLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) return false;

          const payload = trimmed.slice(5).trim();
          if (!payload) return false;
          if (payload === "[DONE]") return true;

          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              controller.enqueue(encoder.encode(delta));
            }
          } catch {
            // Ignore malformed SSE chunks and continue streaming.
          }

          return false;
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const shouldClose = flushSseLine(line);
            if (shouldClose) {
              controller.close();
              return;
            }
          }
        }

        if (buffer.length > 0) {
          flushSseLine(buffer);
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
