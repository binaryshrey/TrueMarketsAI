-- Run this in Supabase SQL Editor to create the rebalance_workflows table

create table if not exists rebalance_workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled Strategy',
  mode text not null check (mode in ('live', 'paper')),
  allocation_type text not null check (allocation_type in ('equal', 'marketcap', 'ai')),
  allocations jsonb not null default '[]',
  investment numeric not null default 0,
  rebalance_mode text not null check (rebalance_mode in ('ratio', 'time', 'conditions')),
  threshold integer,
  time_interval text,
  condition_tab text,
  condition_coin text,
  condition_direction text,
  condition_value text,
  engine_type text not null default 'truesignal' check (engine_type in ('truesignal', 'custom')),
  custom_script text,
  data_source text not null default 'CoinGecko + Alpaca',
  ai_model text,
  venue text not null default 'Alpaca',
  stop_loss numeric,
  take_profit numeric,
  status text not null default 'scheduled' check (status in ('scheduled', 'ongoing', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS but allow all operations for anon (adjust for production)
alter table rebalance_workflows enable row level security;

create policy "Allow all operations for anon" on rebalance_workflows
  for all using (true) with check (true);


-- Execution logs for workflow runs
create table if not exists workflow_execution_logs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references rebalance_workflows(id) on delete cascade,
  run_id uuid not null,                           -- groups logs from a single execution
  seq integer not null,                           -- ordering within a run
  time text not null,                             -- wall-clock timestamp string
  node text not null,                             -- TRIGGER, PRE-TRADE, etc.
  level text not null check (level in ('info', 'ok', 'warn', 'error')),
  msg text not null,
  created_at timestamptz not null default now()
);

create index idx_exec_logs_workflow on workflow_execution_logs(workflow_id, run_id, seq);

alter table workflow_execution_logs enable row level security;

create policy "Allow all operations for anon" on workflow_execution_logs
  for all using (true) with check (true);


-- Structured analysis data per execution run
create table if not exists workflow_execution_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references rebalance_workflows(id) on delete cascade,
  run_id uuid not null unique,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  pre_trade jsonb,                                -- PreTradeData snapshot
  post_trade jsonb,                               -- PostTradeData snapshot
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_exec_runs_workflow on workflow_execution_runs(workflow_id, started_at desc);

alter table workflow_execution_runs enable row level security;

create policy "Allow all operations for anon" on workflow_execution_runs
  for all using (true) with check (true);
