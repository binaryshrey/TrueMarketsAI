import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/rebalance-workflows/runs?workflow_id=<uuid>&run_id=<uuid>
 *
 * Returns persisted execution run data (pre-trade / post-trade analysis).
 * - If run_id is provided, returns that specific run.
 * - Otherwise returns the most recent run for the workflow.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const workflowId = searchParams.get("workflow_id");
  const runId = searchParams.get("run_id");

  if (!workflowId) {
    return NextResponse.json(
      { error: "Missing workflow_id" },
      { status: 400 },
    );
  }

  if (runId) {
    const { data, error } = await supabase
      .from("workflow_execution_runs")
      .select("*")
      .eq("workflow_id", workflowId)
      .eq("run_id", runId)
      .single();

    if (error || !data) {
      return NextResponse.json({ run: null });
    }

    return NextResponse.json({ run: data });
  }

  // No run_id — fetch most recent run
  const { data, error } = await supabase
    .from("workflow_execution_runs")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return NextResponse.json({ run: null });
  }

  return NextResponse.json({ run: data });
}
