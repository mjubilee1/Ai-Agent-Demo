import { NextRequest, NextResponse } from "next/server";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId") || "";
  const r = await fetch(`${BACKEND_URL}/actions?sessionId=${encodeURIComponent(sessionId)}`);
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}