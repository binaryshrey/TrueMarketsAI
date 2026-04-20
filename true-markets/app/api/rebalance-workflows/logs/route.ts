import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/rebalance-workflows/logs?workflow_id=<uuid>&run_id=<uuid>
 *
 * Returns persisted execution logs.
 * - If run_id is provided, returns logs for that specific run.
 * - Otherwise returns logs for the most recent run of the workflow.
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
    // Fetch logs for a specific run
    const { data, error } = await supabase
      .from("workflow_execution_logs")
      .select("time, node, level, msg, seq, run_id")
      .eq("workflow_id", workflowId)
      .eq("run_id", runId)
      .order("seq", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs: data, run_id: runId });
  }

  // No run_id — find the most recent run, then fetch its logs
  const { data: latestRow, error: latestErr } = await supabase
    .from("workflow_execution_logs")
    .select("run_id")
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (latestErr || !latestRow) {
    return NextResponse.json({ logs: [], run_id: null });
  }

  const latestRunId = latestRow.run_id;

  const { data, error } = await supabase
    .from("workflow_execution_logs")
    .select("time, node, level, msg, seq, run_id")
    .eq("workflow_id", workflowId)
    .eq("run_id", latestRunId)
    .order("seq", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data, run_id: latestRunId });
}
