import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import {
  buildNextPromptHint,
  getPracticeSessionForUser,
  insertPracticeLog,
  markPracticeSessionAnswered,
  upsertKnowledgeStatus
} from "@/lib/practice";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  selectedAnswer: z.enum(["A", "B", "C", "D"])
});

export async function POST(request: Request) {
  try {
    const user = await getApiUser();
    const body = bodySchema.parse(await request.json());
    const session = await getPracticeSessionForUser(body.sessionId, user.id);

    if (!session) {
      return NextResponse.json(
        {
          error: "题目会话不存在。"
        },
        { status: 404 }
      );
    }

    if (session.status === "expired") {
      return NextResponse.json(
        {
          error: "这道题已经过期，请重新生成。"
        },
        { status: 409 }
      );
    }

    const question = session.question_payload;
    const correct = body.selectedAnswer === question.answer;

    if (session.status === "answered") {
      return NextResponse.json({
        correct: Boolean(session.is_correct),
        correctAnswer: question.answer,
        analysis: question.analysis,
        shouldChase: !session.is_correct,
        nextPromptHint: buildNextPromptHint({
          knowledgePoint: session.knowledge_point,
          correctAnswer: question.answer,
          selectedAnswer: session.selected_answer,
          correct: Boolean(session.is_correct)
        })
      });
    }

    const updated = await markPracticeSessionAnswered({
      sessionId: session.id,
      userId: user.id,
      selectedAnswer: body.selectedAnswer,
      isCorrect: correct
    });

    if (!updated) {
      const latest = await getPracticeSessionForUser(body.sessionId, user.id);

      if (latest?.status === "answered") {
        return NextResponse.json({
          correct: Boolean(latest.is_correct),
          correctAnswer: question.answer,
          analysis: question.analysis,
          shouldChase: !latest.is_correct,
          nextPromptHint: buildNextPromptHint({
            knowledgePoint: latest.knowledge_point,
            correctAnswer: question.answer,
            selectedAnswer: latest.selected_answer,
            correct: Boolean(latest.is_correct)
          })
        });
      }

      throw new Error("FAILED_TO_UPDATE_SESSION");
    }

    await insertPracticeLog({
      userId: user.id,
      knowledgePoint: session.knowledge_point,
      selectedAnswer: body.selectedAnswer,
      correctAnswer: question.answer,
      isCorrect: correct,
      chaseMode: session.chase_mode,
      questionPayload: question,
      sessionId: session.id
    });

    await upsertKnowledgeStatus({
      userId: user.id,
      knowledgePoint: session.knowledge_point,
      correct
    });

    return NextResponse.json({
      correct,
      correctAnswer: question.answer,
      analysis: question.analysis,
      shouldChase: !correct,
      nextPromptHint: buildNextPromptHint({
        knowledgePoint: session.knowledge_point,
        correctAnswer: question.answer,
        selectedAnswer: body.selectedAnswer,
        correct
      })
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        {
          error: "请先登录后再提交答案。"
        },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          error: "答案请求格式不正确。"
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "提交答案失败，请刷新后重试。"
      },
      { status: 400 }
    );
  }
}
