import { NextResponse } from "next/server";
import { z } from "zod";
import { buildSubjectiveAnalysisText, gradeSubjectiveAnswerWithAI, parseSubjectiveReviewFromAnalysis } from "@/lib/ai";
import { getApiUser } from "@/lib/auth";
import { findSubjectByKnowledgePoint } from "@/lib/knowledge-catalog";
import { ensureMockExamAccess, getMockExamPaperForUser, saveMockExamReport } from "@/lib/mock-exam";
import {
  answerSessionInDemo,
  evaluateAnswer,
  getPracticeSessionForUser,
  insertPracticeLog,
  markPracticeSessionAnswered,
  serializeAnswer,
  upsertKnowledgeStatus
} from "@/lib/practice";
import type {
  MockExamQuestionResult,
  MockExamReport,
  MockExamWeaknessInsight,
  QuestionPayload,
  SubmissionVerdict
} from "@/lib/types";

const answerSchema = z.object({
  sessionId: z.string().uuid(),
  selectedAnswer: z.string().optional(),
  selfAssessment: z.enum(["correct", "wrong", "confused"]).optional(),
  markedConfused: z.boolean().optional()
});

const bodySchema = z.object({
  paperId: z.string().uuid(),
  answers: z.array(answerSchema)
});

function buildMasterySummary(report: {
  accuracyRate: number;
  weakestPoints: MockExamWeaknessInsight[];
}) {
  if (report.accuracyRate >= 0.85) {
    return "这套迷你模考已经比较稳，可以继续切到更综合的题组，或直接再来一套整科冲刺卷。";
  }

  if (report.accuracyRate >= 0.6) {
    return `当前基础还在，但「${report.weakestPoints[0]?.knowledgePoint ?? "主观题表达"}」这类点还需要再压一轮。`;
  }

  return `这科的薄弱点还比较集中，建议先围绕「${report.weakestPoints[0]?.knowledgePoint ?? "当前错题点"}」做 2 轮专项强化，再回来重测。`;
}

function buildWeaknessInsights(results: MockExamQuestionResult[]) {
  const wrongResults = results.filter((item) => !item.correct);
  const grouped = new Map<string, MockExamQuestionResult[]>();

  for (const item of wrongResults) {
    const current = grouped.get(item.knowledgePoint) ?? [];
    current.push(item);
    grouped.set(item.knowledgePoint, current);
  }

  return [...grouped.entries()]
    .map(([knowledgePoint, items]) => {
      const subject = findSubjectByKnowledgePoint(knowledgePoint) ?? "未分类科目";
      const hasSubjective = items.some(
        (item) => item.questionType === "calculation" || item.questionType === "comprehensive"
      );
      const recommendation = hasSubjective
        ? "先回到分步作答和关键口径，再做一轮同点强化，把表达写顺。"
        : "先围绕这个考点做 2 到 3 道变式题，把边界条件和干扰项再压一轮。";

      return {
        knowledgePoint,
        subject,
        wrongCount: items.length,
        questionTypes: [...new Set(items.map((item) => item.questionType))],
        recommendation
      } satisfies MockExamWeaknessInsight;
    })
    .sort((a, b) => b.wrongCount - a.wrongCount)
    .slice(0, 3);
}

function isSubjectiveQuestion(question: QuestionPayload) {
  return question.type === "calculation" || question.type === "comprehensive";
}

async function resolveSubmissionResult(params: {
  question: QuestionPayload;
  selectedAnswer?: string;
  selfAssessment?: "correct" | "wrong" | "confused";
  markedConfused?: boolean;
}) {
  if (params.markedConfused || params.selfAssessment === "confused") {
    return {
      correct: false,
      verdict: "confused" as const,
      aiReview: null
    };
  }

  if (isSubjectiveQuestion(params.question) && params.selectedAnswer?.trim()) {
    const aiReview = await gradeSubjectiveAnswerWithAI({
      question: params.question,
      userAnswer: params.selectedAnswer.trim()
    });

    if (aiReview) {
      return {
        correct: aiReview.verdict === "correct",
        verdict: aiReview.verdict,
        aiReview
      };
    }
  }

  const evaluated = evaluateAnswer({
    question: params.question,
    selectedAnswer: params.selectedAnswer,
    selfAssessment: params.selfAssessment,
    markedConfused: params.markedConfused
  });

  return {
    ...evaluated,
    aiReview: null
  };
}

export async function POST(request: Request) {
  try {
    const user = await getApiUser();
    await ensureMockExamAccess(user.id);
    const body = bodySchema.parse(await request.json());
    const paper = await getMockExamPaperForUser(body.paperId, user.id);

    if (!paper) {
      return NextResponse.json({ error: "这套模拟考试不存在。" }, { status: 404 });
    }

    if (paper.weakness_report) {
      return NextResponse.json({
        paperId: paper.id,
        examName: paper.exam_name,
        subject: paper.config.subject,
        report: paper.weakness_report
      });
    }

    const answerMap = new Map(body.answers.map((item) => [item.sessionId, item]));
    const results: MockExamQuestionResult[] = [];

    for (const questionItem of paper.generated_questions) {
      const answerInput = answerMap.get(questionItem.sessionId);
      const session = await getPracticeSessionForUser(questionItem.sessionId, user.id);

      if (!session) {
        throw new Error("MOCK_EXAM_SESSION_NOT_FOUND");
      }

      let correct = Boolean(session.is_correct);
      let verdict = (session.self_assessment ?? "wrong") as SubmissionVerdict;
      let analysisText = session.question_payload.analysis;
      let aiReview = parseSubjectiveReviewFromAnalysis(session.question_payload.analysis);

      if (session.status === "answered") {
        correct = Boolean(session.is_correct);
        verdict = (session.self_assessment ?? (correct ? "correct" : "wrong")) as SubmissionVerdict;
      } else {
        const resolved = await resolveSubmissionResult({
          question: session.question_payload,
          selectedAnswer: answerInput?.selectedAnswer,
          selfAssessment: answerInput?.selfAssessment,
          markedConfused: answerInput?.markedConfused
        });
        analysisText = buildSubjectiveAnalysisText({
          question: session.question_payload,
          aiReview: resolved.aiReview
        });
        aiReview = resolved.aiReview;

        if (user.id === "demo-user") {
          const demoResult = await answerSessionInDemo({
            sessionId: session.id,
            userId: user.id,
            selectedAnswer: answerInput?.selectedAnswer,
            selfAssessment: answerInput?.selfAssessment,
            markedConfused: answerInput?.markedConfused,
            resolvedCorrect: resolved.correct,
            resolvedVerdict: resolved.verdict,
            analysisOverride: analysisText,
            gradingSource: resolved.aiReview ? "ai" : "self",
            aiReview: resolved.aiReview
          });

          if (!demoResult) {
            throw new Error("FAILED_TO_UPDATE_SESSION");
          }

          correct = demoResult.correct;
          verdict = demoResult.verdict;
        } else {
          const updated = await markPracticeSessionAnswered({
            sessionId: session.id,
            userId: user.id,
            selectedAnswer: answerInput?.selectedAnswer,
            selfAssessment: resolved.verdict,
            isCorrect: resolved.correct,
            questionPayloadOverride:
              resolved.aiReview || analysisText !== session.question_payload.analysis
                ? {
                    ...session.question_payload,
                    analysis: analysisText
                  }
                : undefined
          });

          if (!updated) {
            throw new Error("FAILED_TO_UPDATE_SESSION");
          }

          await insertPracticeLog({
            userId: user.id,
            knowledgePoint: session.knowledge_point,
            questionType: session.question_type,
            difficulty: session.difficulty,
            selectedAnswer: answerInput?.selectedAnswer ?? resolved.verdict,
            correctAnswer: serializeAnswer(session.question_payload.answer),
            verdict: resolved.verdict,
            isCorrect: resolved.correct,
            chaseMode: false,
            practiceMode: "mock-exam",
            questionPayload: {
              ...session.question_payload,
              analysis: analysisText
            },
            sessionId: session.id
          });

          await upsertKnowledgeStatus({
            userId: user.id,
            knowledgePoint: session.knowledge_point,
            questionType: session.question_type,
            correct: resolved.correct,
            verdict: resolved.verdict
          });

          correct = resolved.correct;
          verdict = resolved.verdict;
        }
      }

      results.push({
        sessionId: questionItem.sessionId,
        knowledgePoint: questionItem.knowledgePoint,
        questionType: questionItem.questionType,
        difficulty: questionItem.difficulty,
        correct,
        verdict,
        scoreEarned: correct ? questionItem.score : 0,
        scorePossible: questionItem.score,
        correctAnswer: questionItem.question.answer,
        analysis: analysisText,
        gradingSource: aiReview ? "ai" : "self",
        aiReview
      });
    }

    const totalScore = results.reduce((sum, item) => sum + item.scorePossible, 0);
    const earnedScore = results.reduce((sum, item) => sum + item.scoreEarned, 0);
    const correctCount = results.filter((item) => item.correct).length;
    const accuracyRate = results.length === 0 ? 0 : correctCount / results.length;
    const weakestPoints = buildWeaknessInsights(results);
    const report: MockExamReport = {
      totalScore,
      earnedScore,
      accuracyRate,
      correctCount,
      totalQuestions: results.length,
      masterySummary: buildMasterySummary({ accuracyRate, weakestPoints }),
      weakestPoints,
      results,
      submittedAt: new Date().toISOString()
    };

    await saveMockExamReport({
      userId: user.id,
      paperId: paper.id,
      report
    });

    return NextResponse.json({
      paperId: paper.id,
      examName: paper.exam_name,
      subject: paper.config.subject,
      report
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "请先登录后再交卷。" }, { status: 401 });
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

    return NextResponse.json({ error: "交卷失败，请稍后重试。" }, { status: 500 });
  }
}
