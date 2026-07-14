import { NextResponse } from "next/server";
import { clearDemoSession } from "@/lib/demo";

export async function POST() {
  await clearDemoSession();

  return NextResponse.json({
    ok: true
  });
}
