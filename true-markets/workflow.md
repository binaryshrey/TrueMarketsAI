# Rebalance Workflow Pipeline

## Overview

The rebalance workflow executes an 8-node pipeline that monitors market conditions, analyzes portfolio drift, plans trades, executes them, and reports results. Each node runs sequentially with real-time status updates streamed to the UI via Server-Sent Events (SSE).

---

## Pipeline Nodes

### 1. TRIGGER — Market Trigger
**Color:** `#f1c232` (Gold)

Monitors market conditions and determines whether a rebalance should fire.

**Supported trigger modes:**
- **Price condition:** Fires when a specific coin's price crosses a threshold (e.g., "BTC above $70,000")
- **Percentage condition:** Fires when a coin moves by a percentage
- **Ratio deviation:** Fires when any asset drifts beyond a threshold from target allocation
- **Time-based:** Fires on a fixed schedule (4h, 12h, 1d, 1w)

**API used:** `GET /api/crypto` (proxies CoinGecko `/simple/price` for real-time prices)

**Internal logic:**
1. Fetch current prices for all portfolio assets from CoinGecko
2. Evaluate the configured trigger condition
3. If condition is NOT met, the node fails and the workflow returns to `scheduled` status
4. If condition IS met, proceed to the next node

---

### 2. PRE-TRADE — Drift Analyzer
**Color:** `#8b5cf6` (Purple)

Calculates portfolio drift — how far each asset has drifted from its target allocation.

**APIs used:**
- `GET /api/alpaca/portfolio` — Fetches current Alpaca positions and account info
- CoinGecko prices (from trigger node)

**Internal logic:**
1. Fetch current positions from Alpaca (or use investment amount if no positions exist)
2. Calculate total portfolio value
3. For each asset: compute `currentPct`, `targetPct`, `driftPct`, and `diffUsd`
4. Flag overweight (positive drift) and underweight (negative drift) assets
5. Report max drift across all assets

**Output:** Array of drift entries with symbol, target %, current %, drift %, and USD difference

---

### 3. VALIDATOR — Validation Gate
**Color:** `#a855f7` (Violet)

Re-verifies conditions to prevent stale execution. Guards against price movement between trigger and trade.

**API used:** CoinGecko `/simple/price` (re-fetch)

**Internal logic:**
1. Re-fetch all asset prices
2. Compare against prices from the trigger node
3. Calculate maximum slippage between the two snapshots
4. If slippage exceeds 2%, abort the workflow (node fails)
5. If within tolerance, confirm drift is still valid and proceed

**Guardrails:**
- Max slippage: 2% between trigger and validation
- Price staleness: Validates prices are fresh (< 10s old)

---

### 4. PLANNER — Trade Planner
**Color:** `#3b82f6` (Blue)

Generates the optimal set of trades to rebalance the portfolio.

**Two engine types:**

#### TrueSignal (AI-Driven)
**API used:** OpenRouter API (`POST https://openrouter.ai/api/v1/chat/completions`)

- Model: Configurable (defaults to `anthropic/claude-sonnet-4-5`)
- Sends drift data, current prices, investment amount, and risk parameters to the AI
- AI returns a JSON trade plan with `{ symbol, side, notional }` entries
- Falls back to deterministic planning if AI is unavailable

#### Custom Script (Deterministic)
No external API — uses built-in logic:
1. For each asset with >1% drift, create a trade
2. Overweight assets get sell orders, underweight get buy orders
3. Notional amount = absolute USD difference from target
4. Sort: sells execute before buys (to free up capital)

**Output:** Array of trade orders: `{ symbol, side: "buy"|"sell", notional: USD }`

---

### 5. EXECUTOR — Execution Engine
**Color:** `#10b981` (Green)

Places orders through the configured broker.

**API used:** `POST /api/alpaca/order` (Alpaca Paper Trading API)

**Alpaca order payload:**
```json
{
  "symbol": "BTC/USD",
  "side": "buy",
  "type": "market",
  "time_in_force": "gtc",
  "notional": "250.00"
}
```

**Internal logic:**
1. For each trade in the plan:
   - Skip trades with notional < $1 (below minimum)
   - Place a market order via Alpaca API
   - Record order ID and status
2. Wait for order acknowledgment
3. Track success/failure count

**Paper mode without Alpaca credentials:**
- Simulates trades locally
- Calculates qty from price and logs simulated fills

**Error handling:**
- Individual order failures don't abort the entire workflow
- Tracks per-order success/failure
- Only fails the node if ALL orders fail

---

### 6. VERIFIER — Verification Engine
**Color:** `#06b6d4` (Cyan)

Reconciles actual positions against expected state after execution.

**API used:** Alpaca Positions API (`GET /v2/positions`)

**Internal logic:**
1. Wait 1.5s for order fills to settle
2. Re-fetch all positions from Alpaca
3. For each executed order, verify the corresponding position exists
4. Log position quantities and market values
5. Flag any positions that aren't yet visible (pending fills)

---

### 7. POST-TRADE — Post-Trade Analyzer
**Color:** `#f97316` (Orange)

Evaluates the quality and effectiveness of the rebalance.

**No external API** — pure computation on execution data.

**Metrics calculated:**
- **Drift reduction:** Compares max drift before vs estimated drift after trades
- **Total volume:** Sum of all trade notional amounts
- **Estimated fees:** 0.1% of total volume (Alpaca paper is fee-free, but logged for realism)
- **Benefit score:** Percentage of drift eliminated by the rebalance

**Output example:**
```
Drift reduced: 8.20% -> 0.30% | Improvement: 7.90pts
Total traded: $325.00 across 3 order(s)
Estimated fees: $0.33 (0.1%)
Benefit score: 96.3% drift reduction
```

---

### 8. REPORTER — Report & Log
**Color:** `#f43f5e` (Rose)

Persists execution results and updates workflow status.

**API used:** Supabase (`UPDATE rebalance_workflows SET status = 'completed'`)

**Internal logic:**
1. Update workflow status to `completed` in Supabase
2. Log final summary with trade count, volume, and drift improvement
3. Mark workflow execution as complete

---

## API Endpoints

### `POST /api/rebalance-workflows/execute`
**SSE streaming endpoint** — Executes a workflow pipeline and streams progress events.

**Request body:**
```json
{ "id": "<workflow-uuid>" }
```

**SSE event types:**
| Event | Data | Description |
|-------|------|-------------|
| `log` | `{ time, node, level, msg }` | Execution log entry |
| `node-status` | `{ nodeId, status }` | Node state change (running/success/failed) |
| `complete` | `{ status, trades?, error? }` | Pipeline finished |

**Log levels:** `info`, `ok`, `warn`, `error`

### `PATCH /api/rebalance-workflows/status`
Updates a workflow's status.

**Request body:**
```json
{ "id": "<workflow-uuid>", "status": "scheduled"|"ongoing"|"completed" }
```

### `GET /api/rebalance-workflows`
Returns all workflows ordered by `created_at DESC`.

### `POST /api/rebalance-workflows`
Creates a new workflow.

### `DELETE /api/rebalance-workflows`
Deletes a workflow by ID.

---

## UI Execution Behavior

### Node Status Indicators
Each node displays one of four states:

| Status | Visual |
|--------|--------|
| **Idle** | Default icon, muted border |
| **Running** | Spinner icon, bright border, wave shimmer animation (left-to-right gradient sweep in node's color) |
| **Success** | Green checkmark icon, green border glow |
| **Failed** | Red X icon, red border glow |

### Wave Animation
When a node is `running`, a CSS shimmer animation sweeps left-to-right across the node card:
- Uses the node's own color at 15% opacity
- 1.5s ease-in-out infinite loop
- `background-size: 200%` with `background-position` animation

### Log Panel
- Real-time log streaming via SSE
- Auto-scrolls to latest entry
- Color-coded by level: green (ok), yellow (warn), red (error), gray (info)
- Copy button exports all logs to clipboard
- Live execution indicator (pulsing green dot) when running

### Start/Stop Controls
- **Start:** Disabled during execution; triggers SSE connection to execute endpoint
- **Stop:** Sends abort signal; resets workflow status to `scheduled` via PATCH endpoint
- **Delete:** Disabled during execution to prevent data loss

---

## Data Flow Diagram

```
CoinGecko API ──> [TRIGGER] ──> [PRE-TRADE] ──> [VALIDATOR] ──> [PLANNER] ──> [EXECUTOR] ──> [VERIFIER] ──> [POST-TRADE] ──> [REPORTER]
                     │               │                │              │              │              │               │               │
                  Prices          Alpaca           Prices         OpenRouter      Alpaca         Alpaca         Metrics         Supabase
                                 Positions        (re-fetch)       (AI plan)     Orders        Positions      (compute)        (update)
```

---

## Environment Variables Required

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `APCA_API_KEY_ID` | Alpaca API key |
| `APCA_API_SECRET_KEY` | Alpaca API secret |
| `OPENROUTER_API_KEY` | OpenRouter API key (for AI planner) |
| `OPENROUTER_MODEL` | AI model override (default: `anthropic/claude-sonnet-4-5`) |
