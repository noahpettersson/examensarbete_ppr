import { NextRequest } from "next/server";
import { fetchBlockData } from "@/data/repositories";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ blockId: string }> },
) {
  const { blockId } = await context.params;
  const searchParams = request.nextUrl.searchParams;
  const baseLatencyMs = Number(searchParams.get("baseLatencyMs") ?? 0);
  const userId = request.cookies.get("BENCH_USER_ID")?.value;

  const data = await fetchBlockData(blockId, {
    dynamic: true,
    baseLatencyMs,
    userId,
  });

  return Response.json(data);
}
