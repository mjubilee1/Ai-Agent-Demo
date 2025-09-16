import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ||
  (process.env.BACKEND_HOST ? `https://${process.env.BACKEND_HOST}` : "http://localhost:4000");

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const response = await fetch(`${BACKEND_URL}/parse-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error in parse-intent route:', error);
    return NextResponse.json(
      { error: "Failed to parse intent" },
      { status: 500 }
    );
  }
}
