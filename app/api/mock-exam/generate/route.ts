import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import { getUserStats } from "@/lib/dashboard";
import { ensureMockExamAccess, generateMockExamPaper } from "@/lib/mock-exam";
import { findSubjectByKnowledgePoint } from "@/lib/knowledge-catalog";

const bodySchema = z.object({
  subject: z.string().min(1, "subject is required")
});

export async function POST(request: Request) {
  try {
    const user = await getApiUser();
    await ensureMockExamAccess(user.id);
    const body = bodySchema.parse(await request.json());
    const stats = await getUserStats(user.id);
    const paper = await generateMockExamPaper({
      userId: user.id,
      subject: body.subject.trim(),
      weakestKnowledge: stats.weakestKnowledge
    });

    return NextResponse.json({
      paper,
      recommendedFocus:
        stats.weakestKnowledge.find((item) => findSubjectByKnowledgePoint(item.knowledgePoint) === body.subject.trim())
          ?.knowledgePoint ?? paper.generated_questions[0]?.knowledgePoint ?? "",
      plan: "premium"
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "请先登录后再生成模拟考试。" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "MOCK_EXAM_PREMIUM_REQUIRED") {
      return NextResponse.json(
        { error: "模拟考试为高级会员能力，请先升级到 19.9 元档后再开始。" },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "请求参数不合法。" }, { status: 400 });
    }

    return NextResponse.json({ error: "模拟考试生成失败，请稍后重试。" }, { status: 500 });
  }
}
