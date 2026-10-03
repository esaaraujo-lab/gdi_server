import { NextResponse } from "next/server";

export const runtime = "edge";

/** Health-check edge (compatível Cloudflare Workers). */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "Mimi Mimos — Haute Parfumerie",
    runtime: "edge",
    timestamp: new Date().toISOString(),
  });
}
