import { NextResponse } from "next/server";
import { z } from "zod";
import { generateQuestionWithAI } from "@/lib/ai";
import { getApiUser } from "@/lib/auth";
import { createPracticeSession } from "@/lib/practice";
import { ensurePracticeQuota, FREE_DAILY_LIMIT, getPracticeQuotaSnapshot } from "@/lib/quota";
import { getLocalReferenceQuestion } from "@/lib/reference-bank";
import { getWebReferenceQuestion } from "@/lib/web-question-bank";

const bodySchema = z.object({
  subject: z.enum(["中级会计实务", "财务管理", "经济法"]).optional(),
  knowledgePoint: z.string().min(1, "knowledge point is required"),
  questionType: z.enum(["single", "multiple", "judge", "calculation", "comprehensive"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  practiceMode: z.enum(["daily", "chase", "review", "mock-exam"]).optional(),
  chaseMode: z.boolean().optional(),
  lastWrongReason: z.string().optional(),
  sourceMode: z.enum(["local-first", "ai-only", "web-2026"]).optional(),
  excludeQuestionIds: z.array(z.string()).optional()
});

export async function POST(request: Request) {
  try {
    const user = await getApiUser();
    const body = bodySchema.parse(await request.json());
    const sourceMode = body.sourceMode ?? "local-first";
    const shouldUseAi = sourceMode === "ai-only";

    let quota = await getPracticeQuotaSnapshot(user.id);
    let question = sourceMode === "web-2026"
      ? getWebReferenceQuestion({
          subject: body.subject,
          knowledgePoint: body.knowledgePoint.trim(),
          questionType: body.questionType,
          excludeQuestionIds: body.excludeQuestionIds
        })
      : shouldUseAi
        ? null
        : getLocalReferenceQuestion({
            subject: body.subject,
            knowledgePoint: body.knowledgePoint.trim(),
            questionType: body.questionType,
            excludeQuestionIds: body.excludeQuestionIds
          });

    if (sourceMode === "web-2026" && !question) {
      return NextResponse.json(
        {
          code: "WEB_QUESTION_NOT_FOUND",
          error: "暂无已核验的2026同类题，可以继续下一道本地原题。"
        },
        { status: 404 }
      );
    }

    if (!question) {
      quota = await ensurePracticeQuota(user.id);
      question = await generateQuestionWithAI({
        subject: body.subject,
        knowledgePoint: body.knowledgePoint.trim(),
        questionType: body.questionType,
        difficulty: body.difficulty,
        practiceMode: body.practiceMode,
        chaseMode: body.chaseMode,
        lastWrongReason: body.lastWrongReason
      });
    }

    const session = await createPracticeSession({
      userId: user.id,
      knowledgePoint: body.knowledgePoint.trim(),
      questionType: body.questionType,
      difficulty: body.difficulty,
      practiceMode: body.practiceMode ?? (body.chaseMode ? "chase" : "daily"),
      questionPayload: question,
      chaseMode: Boolean(body.chaseMode)
    });

    const remainingFreeQuota =
      quota.plan !== "free"
        ? null
        : Math.max(FREE_DAILY_LIMIT - (quota.todayCount + (question.source === "ai" ? 1 : 0)), 0);

    return NextResponse.json({
      sessionId: session.id,
      question,
      remainingFreeQuota,
      plan: quota.plan,
      chaseMode: Boolean(body.chaseMode),
      recommendedNextDifficulty: body.difficulty
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
          error: "免费用户今天只有 3 次出题机会，强化练习同样会计次。若想继续练习，可以升级会员方案。"
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
        { error: "出题失败，请稍后重试。" },
      { status: 500 }
    );
  }
}
