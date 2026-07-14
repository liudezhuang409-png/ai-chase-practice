import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeMistakeWithAI, generateQuestionWithAI } from "@/lib/ai";
import { getApiUser } from "@/lib/auth";
import { createPracticeSession } from "@/lib/practice";
import { ensurePracticeQuota, FREE_DAILY_LIMIT } from "@/lib/quota";
import type { AnalyzeMistakeResponse } from "@/lib/types";

const bodySchema = z.object({
  wrongQuestion: z.string().min(6),
  userAnswer: z.string().optional(),
  correctAnswer: z.string().optional(),
  userNote: z.string().optional(),
  knowledgePoint: z.string().optional(),
  questionType: z.enum(["single", "multiple", "judge", "calculation", "comprehensive"]).optional()
});

export async function POST(request: Request) {
  try {
    const user = await getApiUser();
    const body = bodySchema.parse(await request.json());
    const quota = await ensurePracticeQuota(user.id);

    const rawAnalysis = await analyzeMistakeWithAI({
      wrongQuestion: body.wrongQuestion.trim(),
      userAnswer: body.userAnswer,
      correctAnswer: body.correctAnswer,
      userNote: body.userNote,
      knowledgePoint: body.knowledgePoint,
      questionType: body.questionType
    });
    const analysis = {
      ...rawAnalysis,
      knowledgePoint: body.knowledgePoint?.trim() || rawAnalysis.knowledgePoint,
      questionType: body.questionType ?? rawAnalysis.questionType
    };

    const question = await generateQuestionWithAI({
      knowledgePoint: analysis.knowledgePoint,
      questionType: analysis.questionType,
      difficulty: "medium",
      practiceMode: "chase",
      chaseMode: true,
      lastWrongReason: `${analysis.errorTypeLabel}：${analysis.diagnosis}。纠正方向：${analysis.variantStrategy}`
    });

    const session = await createPracticeSession({
      userId: user.id,
      knowledgePoint: analysis.knowledgePoint,
      questionType: analysis.questionType,
      difficulty: "medium",
      practiceMode: "chase",
      questionPayload: question,
      chaseMode: true
    });

    const remainingFreeQuota =
      quota.plan !== "free"
        ? null
        : Math.max(FREE_DAILY_LIMIT - (quota.todayCount + 1), 0);

    return NextResponse.json({
      analysis,
      sessionId: session.id,
      question,
      remainingFreeQuota,
      plan: quota.plan
    } satisfies AnalyzeMistakeResponse);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        {
          error: "请先登录后再分析错题。"
        },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === "FREE_LIMIT_REACHED") {
      return NextResponse.json(
        {
          error: "免费版每天可以纠正 3 道错题。升级 9.9 元会员后，这个功能不限次使用。"
        },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          error: "错题内容太少，请至少粘贴题干或补充你的错误答案。"
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "错题分析失败，请稍后重试。"
      },
      { status: 500 }
    );
  }
}
