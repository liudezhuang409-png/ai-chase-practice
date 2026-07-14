import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import { generateStudyPlanWithAI } from "@/lib/study-plan-ai";
import { getStudyPlanSeed, saveStudyPlan } from "@/lib/study-plan";

const bodySchema = z.object({
  targetExam: z.string().min(1).default("中级会计师"),
  targetScore: z.number().int().min(60).max(100).default(85),
  daysToExam: z.number().int().min(1).max(365).default(68),
  dailyMinutes: z.number().int().min(10).max(240).default(45),
  studyStyle: z.enum(["short-bursts", "weekend-intensive", "mistake-first"]).default("mistake-first"),
  selectedSubjects: z.array(z.string().min(1)).max(3).default([]),
  selectedTopics: z.array(z.string().min(1)).max(6).default([])
});

export async function POST(request: Request) {
  try {
    const user = await getApiUser();
    const body = bodySchema.parse(await request.json());
    const seed = await getStudyPlanSeed(user.id);

    const payload = await generateStudyPlanWithAI({
      input: body,
      weakestKnowledge: seed.stats.weakestKnowledge,
      typeAccuracy: seed.stats.typeAccuracy
    });

    const plan = await saveStudyPlan({
      userId: user.id,
      input: body,
      payload
    });

    return NextResponse.json({
      plan
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        {
          error: "请先登录后再生成练题计划。"
        },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          error: "计划参数格式不正确。"
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "AI 生成练题计划失败，请稍后重试。"
      },
      { status: 500 }
    );
  }
}
