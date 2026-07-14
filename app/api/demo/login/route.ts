import { NextResponse } from "next/server";
import { enableDemoSession, isDemoModeEnabled } from "@/lib/demo";

export async function POST() {
  if (!isDemoModeEnabled()) {
    return NextResponse.json(
      {
        error: "当前不是 demo 模式。"
      },
      { status: 400 }
    );
  }

  await enableDemoSession();

  return NextResponse.json({
    ok: true
  });
}
