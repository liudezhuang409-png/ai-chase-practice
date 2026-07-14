import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAnswerAnalysis } from "@/lib/answer-analysis";
import { getApiUser } from "@/lib/auth";
import {
  buildSubjectiveAnalysisText,
  getNextDifficultyAfterSubmit,
  gradeSubjectiveAnswerWithAI,
  parseSubjectiveReviewFromAnalysis
} from "@/lib/ai";
import { getLatestStudyPlan, getTodayStudyPlanProgress } from "@/lib/study-plan";
import { findStudyPlanTaskContext, getNextStudyPlanTaskContext } from "@/lib/study-plan-utils";
import { recordPracticeOutcome } from "@/lib/exam-os";
import {
  answerSessionInDemo,
  buildNextPromptHint,
  evaluateAnswer,
  getPracticeSessionForUser,
  insertPracticeLog,
  markPracticeSessionAnswered,
  resolveMasteryLevel,
  serializeAnswer,
  upsertKnowledgeStatus
} from "@/lib/practice";
import type { DifficultyLevel, PracticeMode, QuestionPayload, QuestionType, SubmitAnswerResponse } from "@/lib/types";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  selectedAnswer: z.string().optional(),
  selfAssessment: z.enum(["correct", "wrong", "confused"]).optional(),
  markedConfused: z.boolean().optional()
});

async function buildStudyPlanResponseContext(params: {
  userId: string;
  knowledgePoint: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  practiceMode: PracticeMode;
}) {
  const plan = await getLatestStudyPlan(params.userId);
  const progress = await getTodayStudyPlanProgress(params.userId, plan);

  return {
    studyPlanProgress: progress,
    studyPlanTask: findStudyPlanTaskContext(plan, progress, {
      knowledgePoint: params.knowledgePoint,
      questionType: params.questionType,
      difficulty: params.difficulty,
      practiceMode: params.practiceMode
    }),
    nextStudyPlanTask: getNextStudyPlanTaskContext(plan, progress)
  };
}

function isSubjectiveQuestion(question: QuestionPayload) {
  return question.type === "calculation" || question.type === "comprehensive";
}

function buildResponseAnswerAnalysis(params: {
  question: QuestionPayload;
  selectedAnswer?: string | null;
  analysis: string;
}) {
  if (params.question.source !== "ai") {
    return undefined;
  }

  return buildAnswerAnalysis(params);
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
      gradingSource: "self" as const,
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
        gradingSource: "ai" as const,
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
    gradingSource: "self" as const,
    aiReview: null
  };
}

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

    if (session.status === "answered") {
      const storedAiReview = parseSubjectiveReviewFromAnalysis(question.analysis);
      const masteryLevel = await resolveMasteryLevel(user.id, session.knowledge_point);
      const recommendedNextDifficulty = getNextDifficultyAfterSubmit({
        currentDifficulty: session.difficulty,
        correct: Boolean(session.is_correct),
        verdict: session.self_assessment ?? "wrong"
      });
      const studyPlanContext = await buildStudyPlanResponseContext({
        userId: user.id,
        knowledgePoint: session.knowledge_point,
        questionType: session.question_type,
        difficulty: session.difficulty,
        practiceMode: session.practice_mode
      });
      return NextResponse.json({
        correct: Boolean(session.is_correct),
        correctAnswer: question.answer,
        analysis: question.analysis,
        answerAnalysis: buildResponseAnswerAnalysis({
          question,
          selectedAnswer: session.selected_answer,
          analysis: question.analysis
        }),
        shouldChase: !session.is_correct,
        nextPromptHint: buildNextPromptHint({
          knowledgePoint: session.knowledge_point,
          questionType: session.question_type,
          difficulty: session.difficulty,
          correctAnswer: serializeAnswer(question.answer),
          selectedAnswer: session.selected_answer,
          correct: Boolean(session.is_correct),
          verdict: session.self_assessment ?? "wrong",
          question
        }),
        masteryLevel,
        verdict: session.self_assessment ?? (session.is_correct ? "correct" : "wrong"),
        recommendedNextDifficulty,
        gradingSource: storedAiReview ? "ai" : "self",
        aiReview: storedAiReview,
        ...studyPlanContext
      });
    }

    const resolved = await resolveSubmissionResult({
      question,
      selectedAnswer: body.selectedAnswer,
      selfAssessment: body.selfAssessment,
      markedConfused: body.markedConfused
    });
    const analysisText = question.source !== "ai"
      ? question.analysis
      : buildSubjectiveAnalysisText({
          question,
          aiReview: resolved.aiReview
        });

    if (user.id === "demo-user") {
      const demoResult = await answerSessionInDemo({
        sessionId: session.id,
        userId: user.id,
        selectedAnswer: body.selectedAnswer,
        selfAssessment: body.selfAssessment,
        markedConfused: body.markedConfused,
        resolvedCorrect: resolved.correct,
        resolvedVerdict: resolved.verdict,
        analysisOverride: analysisText,
        gradingSource: resolved.gradingSource,
        aiReview: resolved.aiReview
      });

      if (!demoResult) {
        throw new Error("FAILED_TO_UPDATE_SESSION");
      }

      await recordPracticeOutcome({
        userId: user.id,
        knowledgePoint: session.knowledge_point,
        questionType: session.question_type,
        difficulty: session.difficulty,
        question: { ...question, analysis: analysisText },
        selectedAnswer: body.selectedAnswer ?? resolved.verdict,
        correct: resolved.correct,
        chaseMode: session.chase_mode
      });

      const studyPlanContext = await buildStudyPlanResponseContext({
        userId: user.id,
        knowledgePoint: session.knowledge_point,
        questionType: session.question_type,
        difficulty: session.difficulty,
        practiceMode: session.practice_mode
      });

      return NextResponse.json({
        ...demoResult,
        recommendedNextDifficulty: getNextDifficultyAfterSubmit({
          currentDifficulty: session.difficulty,
          correct: resolved.correct,
          verdict: resolved.verdict
        }),
        ...studyPlanContext
      });
    }

    const updated = await markPracticeSessionAnswered({
      sessionId: session.id,
      userId: user.id,
      selectedAnswer: body.selectedAnswer,
      selfAssessment: resolved.verdict,
      isCorrect: resolved.correct,
      questionPayloadOverride:
        resolved.aiReview || analysisText !== question.analysis
          ? {
              ...question,
              analysis: analysisText
            }
          : undefined
    });

    if (!updated) {
      const latest = await getPracticeSessionForUser(body.sessionId, user.id);

      if (latest?.status === "answered") {
        const storedAiReview = parseSubjectiveReviewFromAnalysis(latest.question_payload.analysis);
        const recommendedNextDifficulty = getNextDifficultyAfterSubmit({
          currentDifficulty: latest.difficulty,
          correct: Boolean(latest.is_correct),
          verdict: latest.self_assessment ?? "wrong"
        });
        const studyPlanContext = await buildStudyPlanResponseContext({
          userId: user.id,
          knowledgePoint: latest.knowledge_point,
          questionType: latest.question_type,
          difficulty: latest.difficulty,
          practiceMode: latest.practice_mode
        });
        return NextResponse.json({
          correct: Boolean(latest.is_correct),
          correctAnswer: latest.question_payload.answer,
          analysis: latest.question_payload.analysis,
          answerAnalysis: buildResponseAnswerAnalysis({
            question: latest.question_payload,
            selectedAnswer: latest.selected_answer,
            analysis: latest.question_payload.analysis
          }),
          shouldChase: !latest.is_correct,
          nextPromptHint: buildNextPromptHint({
            knowledgePoint: latest.knowledge_point,
            questionType: latest.question_type,
            difficulty: latest.difficulty,
            correctAnswer: serializeAnswer(question.answer),
            selectedAnswer: latest.selected_answer,
            correct: Boolean(latest.is_correct),
            verdict: latest.self_assessment ?? "wrong",
            question: latest.question_payload
          }),
          masteryLevel: await resolveMasteryLevel(user.id, latest.knowledge_point),
          verdict: latest.self_assessment ?? (latest.is_correct ? "correct" : "wrong"),
          recommendedNextDifficulty,
          gradingSource: storedAiReview ? "ai" : "self",
          aiReview: storedAiReview,
          ...studyPlanContext
        });
      }

      throw new Error("FAILED_TO_UPDATE_SESSION");
    }

    await insertPracticeLog({
      userId: user.id,
      knowledgePoint: session.knowledge_point,
      questionType: session.question_type,
      difficulty: session.difficulty,
      selectedAnswer: body.selectedAnswer ?? resolved.verdict,
      correctAnswer: serializeAnswer(question.answer),
      verdict: resolved.verdict,
      isCorrect: resolved.correct,
      chaseMode: session.chase_mode,
      practiceMode: session.practice_mode,
      questionPayload: {
        ...question,
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

    await recordPracticeOutcome({
      userId: user.id,
      knowledgePoint: session.knowledge_point,
      questionType: session.question_type,
      difficulty: session.difficulty,
      question: { ...question, analysis: analysisText },
      selectedAnswer: body.selectedAnswer ?? resolved.verdict,
      correct: resolved.correct,
      chaseMode: session.chase_mode
    });

    const masteryLevel = await resolveMasteryLevel(user.id, session.knowledge_point);
    const recommendedNextDifficulty = getNextDifficultyAfterSubmit({
      currentDifficulty: session.difficulty,
      correct: resolved.correct,
      verdict: resolved.verdict
    });
    const studyPlanContext = await buildStudyPlanResponseContext({
      userId: user.id,
      knowledgePoint: session.knowledge_point,
      questionType: session.question_type,
      difficulty: session.difficulty,
      practiceMode: session.practice_mode
    });

    return NextResponse.json({
      correct: resolved.correct,
      correctAnswer: question.answer,
      analysis: analysisText,
      answerAnalysis: buildResponseAnswerAnalysis({
        question,
        selectedAnswer: body.selectedAnswer,
        analysis: analysisText
      }),
      shouldChase: !resolved.correct,
      nextPromptHint: buildNextPromptHint({
        knowledgePoint: session.knowledge_point,
        questionType: session.question_type,
        difficulty: session.difficulty,
        correctAnswer: serializeAnswer(question.answer),
        selectedAnswer: body.selectedAnswer ?? resolved.verdict,
        correct: resolved.correct,
        verdict: resolved.verdict,
        question
      }),
      masteryLevel,
      verdict: resolved.verdict,
      recommendedNextDifficulty,
      gradingSource: resolved.gradingSource,
      aiReview: resolved.aiReview,
      ...studyPlanContext
    } satisfies SubmitAnswerResponse);
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
