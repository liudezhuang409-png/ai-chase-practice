import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeMistakeWithAI } from "@/lib/ai";
import { getApiUser } from "@/lib/auth";
import { listExamMistakes, saveMistakeAnalysis } from "@/lib/exam-os";

const bodySchema = z.object({ id: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const user = await getApiUser();
    const { id } = bodySchema.parse(await request.json());
    const mistake = (await listExamMistakes(user.id)).find((item) => item.id === id);
    if (!mistake) return NextResponse.json({ error: "错题不存在。" }, { status: 404 });

    const analysis = await analyzeMistakeWithAI({
      wrongQuestion: mistake.question,
      userAnswer: mistake.my_answer,
      correctAnswer: mistake.correct_answer,
      userNote: mistake.wrong_reason,
      knowledgePoint: `${mistake.chapter}`,
      questionType: mistake.question_type
    });
    await saveMistakeAnalysis(user.id, id, analysis as unknown as Record<string, unknown>);
    return NextResponse.json({ analysis });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    return NextResponse.json({ error: "AI 分析失败，请稍后重试。" }, { status: 500 });
  }
}
