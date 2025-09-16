import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ||
  (process.env.BACKEND_HOST ? `https://${process.env.BACKEND_HOST}` : "http://localhost:4000");

export async function GET(req: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/documents`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error in documents route:', error);
    return NextResponse.json(
      { error: "Failed to get documents" },
      { status: 500 }
    );
  }
}
