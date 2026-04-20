import { NextRequest } from "next/server";

export const runtime = "nodejs";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4-5";

const SYSTEM_PROMPT = `You are a workflow assistant for TrueMarkets — a crypto portfolio rebalancing platform.

You have full context of the selected rebalance workflow configuration and its execution logs. Use this context to answer user questions about:
- What happened during execution (which nodes ran, what trades were placed, any errors)
- Why a specific node succeeded or failed
- Current drift, allocation percentages, prices fetched
- Trade plan details (what was bought/sold, amounts, order IDs)
- Post-trade analysis (drift improvement, fees, benefit score)
- Workflow configuration (trigger conditions, rebalance mode, engine type, venue)
- Suggestions for improving the workflow

Rules:
- Be concise and direct — 2-5 sentences unless the user asks for detail.
- Reference specific log entries and numbers from the execution when relevant.
- If the workflow hasn't been executed yet (no logs), say so and describe what will happen when it runs.
- Use **bold** for key figures and metrics.
- Do not make up data — only reference what's in the provided context.`;

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export async function POST(req: NextRequest) {
  if (!process.env.OPENROUTER_API_KEY) {
    return new Response("Missing OPENROUTER_API_KEY", { status: 500 });
  }

  const body = await req.json();
  const message: string = body.message || "";
  const workflow: Record<string, unknown> | null = body.workflow || null;
  const logs: Array<{ time: string; node: string; level: string; msg: string }> =
    body.logs || [];
  const history: ChatMessage[] = body.history || [];

  // Build context block
  const contextParts: string[] = [];

  if (workflow) {
    contextParts.push(`<workflow_config>
${JSON.stringify(workflow, null, 2)}
</workflow_config>`);
  }

  if (logs.length > 0) {
    const logText = logs
      .map((l) => `[${l.time}] [${l.node}] [${l.level}] ${l.msg}`)
      .join("\n");
    contextParts.push(`<execution_logs>
${logText}
</execution_logs>`);
  }

  // Build message history for multi-turn
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  // Add context as the first user message if we have any
  if (contextParts.length > 0 && history.length === 0) {
    // First message — include context inline
    messages.push({
      role: "user",
      content: `${contextParts.join("\n\n")}\n\nUser question:\n${message}`,
    });
  } else {
    // Multi-turn — add context as a system-level injection, then history
    if (contextParts.length > 0) {
      messages.push({
        role: "user",
        content: `${contextParts.join("\n\n")}\n\n(Context above is the current workflow state. Now continuing the conversation.)`,
      });
      messages.push({
        role: "assistant",
        content:
          "Understood. I have the workflow configuration and execution logs. What would you like to know?",
      });
    }

    for (const msg of history) {
      messages.push({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.text,
      });
    }

    messages.push({ role: "user", content: message });
  }

  // Stream response
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
            model: OPENROUTER_MODEL,
            stream: true,
            max_tokens: 512,
            temperature: 0.2,
            messages,
          }),
        });

        if (!response.ok || !response.body) {
          const errorText = await response.text();
          controller.enqueue(
            encoder.encode(`Error: ${errorText.slice(0, 200)}`),
          );
          controller.close();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") {
              if (payload === "[DONE]") {
                controller.close();
                return;
              }
              continue;
            }
            try {
              const parsed = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const delta = parsed.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length > 0) {
                controller.enqueue(encoder.encode(delta));
              }
            } catch {
              // skip
            }
          }
        }

        controller.close();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Chat request failed";
        controller.enqueue(encoder.encode(`Error: ${msg}`));
        controller.close();
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
