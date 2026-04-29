import { NextResponse } from "next/server";
import { z } from "zod";
import { generateQuestionWithAI } from "@/lib/ai";
import { getApiUser } from "@/lib/auth";
import { createPracticeSession } from "@/lib/practice";
import { ensurePracticeQuota, FREE_DAILY_LIMIT } from "@/lib/quota";

const bodySchema = z.object({
  knowledgePoint: z.string().min(1, "knowledge point is required"),
  chaseMode: z.boolean().optional(),
  lastWrongReason: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const user = await getApiUser();
    const body = bodySchema.parse(await request.json());
    const quota = await ensurePracticeQuota(user.id);

    const question = await generateQuestionWithAI({
      knowledgePoint: body.knowledgePoint.trim(),
      chaseMode: body.chaseMode,
      lastWrongReason: body.lastWrongReason
    });

    const session = await createPracticeSession({
      userId: user.id,
      knowledgePoint: body.knowledgePoint.trim(),
      questionPayload: question,
      chaseMode: Boolean(body.chaseMode)
    });

    const remainingFreeQuota =
      quota.plan === "pro"
        ? null
        : Math.max(FREE_DAILY_LIMIT - (quota.todayCount + 1), 0);

    return NextResponse.json({
      sessionId: session.id,
      question,
      remainingFreeQuota,
      plan: quota.plan,
      chaseMode: Boolean(body.chaseMode)
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        {
          error: "请先登录后再开始做题。"
        },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === "FREE_LIMIT_REACHED") {
      return NextResponse.json(
        {
          error: "免费用户今天只有 2 次出题机会，追杀题也会计次。请升级后继续追杀。"
        },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          error: "请求参数不合法。"
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "AI 出题失败，请稍后重试。"
      },
      { status: 500 }
    );
  }
}
