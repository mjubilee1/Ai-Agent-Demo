import { NextRequest, NextResponse } from "next/server";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const r = await fetch(`${BACKEND_URL}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}
