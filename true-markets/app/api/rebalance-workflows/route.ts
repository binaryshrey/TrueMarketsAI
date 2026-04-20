import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await supabase
    .from("rebalance_workflows")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ workflows: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const row = {
    name: body.name || "Untitled Strategy",
    mode: body.mode, // "live" | "paper"
    allocation_type: body.allocation_type, // "equal" | "marketcap" | "ai"
    allocations: body.allocations, // jsonb: [{ symbol, name, image, pct }]
    investment: body.investment || 0,
    rebalance_mode: body.rebalance_mode, // "ratio" | "time" | "conditions"
    threshold: body.threshold,
    time_interval: body.time_interval,
    condition_tab: body.condition_tab,
    condition_coin: body.condition_coin,
    condition_direction: body.condition_direction,
    condition_value: body.condition_value,
    engine_type: body.engine_type || "truesignal", // "truesignal" | "custom"
    custom_script: body.custom_script,
    data_source: body.data_source || "CoinGecko + Alpaca",
    ai_model: body.ai_model,
    venue: body.venue || "Alpaca",
    stop_loss: body.stop_loss,
    take_profit: body.take_profit,
    status: "scheduled", // "scheduled" | "ongoing" | "completed"
  };

  const { data, error } = await supabase
    .from("rebalance_workflows")
    .insert(row)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ workflow: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "Missing workflow id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("rebalance_workflows")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
