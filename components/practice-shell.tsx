"use client";

import { useEffect, useRef, useState } from "react";
import {
  findSubjectByKnowledgePoint,
  getSubjectCatalog,
  getTopicsForSubject,
  UNKNOWN_SUBJECT
} from "@/lib/knowledge-catalog";
import {
  findStudyPlanTaskContext,
  getNextStudyPlanTaskContext,
  getStudyPlanCompletionRatio
} from "@/lib/study-plan-utils";
import type {
  DifficultyLevel,
  GenerateQuestionResponse,
  MasteryLevel,
  PracticeMode,
  QuestionPayload,
  QuestionType,
  StudyPlanTaskContext,
  StudyPlanTodayProgress,
  SubmitAnswerResponse,
  UserKnowledgeSnapshot,
  UserPlan,
  UserStudyPlanRecord
} from "@/lib/types";

const QUESTION_TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: "single", label: "单选题" },
  { value: "multiple", label: "多选题" },
  { value: "judge", label: "判断题" },
  { value: "calculation", label: "计算分析" },
  { value: "comprehensive", label: "综合题" }
];

const DIFFICULTIES: Array<{ value: DifficultyLevel; label: string }> = [
  { value: "easy", label: "基础" },
  { value: "medium", label: "进阶" },
  { value: "hard", label: "冲刺" }
];

const MODES: Array<{ value: PracticeMode; label: string }> = [
  { value: "daily", label: "日常练习" },
  { value: "chase", label: "同点强化" },
  { value: "review", label: "专项巩固" },
  { value: "mock-exam", label: "模拟考试" }
];

function getQuestionTypeLabel(type: QuestionType) {
  return QUESTION_TYPES.find((item) => item.value === type)?.label ?? type;
}

function getDifficultyLabel(level: DifficultyLevel) {
  return DIFFICULTIES.find((item) => item.value === level)?.label ?? level;
}

function getMasteryLabel(level: MasteryLevel) {
  switch (level) {
    case "warning":
      return "建议优先练";
    case "shaky":
      return "仍需继续巩固";
    case "stable":
      return "基本稳定";
    case "mastered":
      return "可以准备切点";
    default:
      return level;
  }
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function formatAnswer(answer: QuestionPayload["answer"]) {
  if (typeof answer === "boolean") {
    return answer ? "正确" : "错误";
  }

  if (Array.isArray(answer)) {
    return answer.join("、");
  }

  if (typeof answer === "string") {
    return answer;
  }

  return answer.keyPoints.join("；");
}

export function PracticeShell({
  initialPlan,
  initialRemaining,
  initialKnowledgePoint,
  initialQuestionType,
  initialDifficulty,
  initialPracticeMode,
  initialFocusMode,
  initialWeakestKnowledge,
  initialStudyPlanRecord,
  initialStudyPlanProgress,
  initialActiveStudyPlanTask
}: {
  initialPlan: UserPlan;
  initialRemaining: number | null;
  initialKnowledgePoint?: string;
  initialQuestionType?: QuestionType;
  initialDifficulty?: DifficultyLevel;
  initialPracticeMode?: PracticeMode;
  initialFocusMode?: "smart" | "outline";
  initialWeakestKnowledge: UserKnowledgeSnapshot[];
  initialStudyPlanRecord: UserStudyPlanRecord | null;
  initialStudyPlanProgress: StudyPlanTodayProgress | null;
  initialActiveStudyPlanTask: StudyPlanTaskContext | null;
}) {
  const subjectCatalog = getSubjectCatalog(initialKnowledgePoint);
  const inferredSubject =
    findSubjectByKnowledgePoint(initialKnowledgePoint) ??
    (initialKnowledgePoint ? UNKNOWN_SUBJECT : subjectCatalog[0]?.subject ?? "");
  const [selectedSubject, setSelectedSubject] = useState(inferredSubject);
  const [selectedKnowledgePoint, setSelectedKnowledgePoint] = useState(initialKnowledgePoint ?? "");
  const [questionType, setQuestionType] = useState<QuestionType>(initialQuestionType ?? "single");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(initialDifficulty ?? "easy");
  const [practiceMode, setPracticeMode] = useState<PracticeMode>(initialPracticeMode ?? "daily");
  const [sessionId, setSessionId] = useState("");
  const [question, setQuestion] = useState<QuestionPayload | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string[]>([]);
  const [subjectiveDraft, setSubjectiveDraft] = useState("");
  const [subjectiveVerdict, setSubjectiveVerdict] = useState<"correct" | "wrong" | "confused">("wrong");
  const [focusMode, setFocusMode] = useState<"smart" | "outline">(
    initialFocusMode ?? (initialWeakestKnowledge.length > 0 ? "smart" : "outline")
  );
  const [smartKnowledgePoint, setSmartKnowledgePoint] = useState(
    initialWeakestKnowledge[0]?.knowledgePoint ?? initialKnowledgePoint ?? ""
  );
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<"generate" | "submit" | null>(null);
  const [feedback, setFeedback] = useState<SubmitAnswerResponse | null>(null);
  const [remaining, setRemaining] = useState<number | null>(initialRemaining);
  const [membershipPlan] = useState(initialPlan);
  const [studyPlanRecord] = useState<UserStudyPlanRecord | null>(initialStudyPlanRecord);
  const [studyPlanProgress, setStudyPlanProgress] = useState<StudyPlanTodayProgress | null>(initialStudyPlanProgress);
  const [activeStudyPlanTask, setActiveStudyPlanTask] = useState<StudyPlanTaskContext | null>(
    initialActiveStudyPlanTask
  );
  const [chaseMode, setChaseMode] = useState(false);
  const [lastWrongReason, setLastWrongReason] = useState("");
  const [error, setError] = useState("");
  const [pendingQuestionScroll, setPendingQuestionScroll] = useState(false);
  const [pendingFeedbackScroll, setPendingFeedbackScroll] = useState(false);
  const [pendingOutlineScroll, setPendingOutlineScroll] = useState(false);
  const [pendingTopScroll, setPendingTopScroll] = useState(false);
  const [outlineExpanded, setOutlineExpanded] = useState(
    Boolean(initialKnowledgePoint) || initialFocusMode === "outline"
  );
  const topSectionRef = useRef<HTMLElement | null>(null);
  const outlineSectionRef = useRef<HTMLElement | null>(null);
  const questionSectionRef = useRef<HTMLElement | null>(null);
  const feedbackSectionRef = useRef<HTMLElement | null>(null);

  const isObjective = question?.type === "single" || question?.type === "multiple" || question?.type === "judge";
  const topicOptions = getTopicsForSubject(selectedSubject, initialKnowledgePoint);
  const actualTopicOptions = topicOptions.filter((topic) => topic.includes(" / "));
  const defaultOutlineKnowledgePoint = actualTopicOptions[0] ?? topicOptions[0] ?? "";
  const selectedTopicSection = selectedKnowledgePoint.includes(" / ")
    ? selectedKnowledgePoint.split(" / ")[0]
    : "";
  const quickTopicOptions = (selectedTopicSection
    ? actualTopicOptions.filter((topic) => topic.startsWith(`${selectedTopicSection} / `))
    : actualTopicOptions
  )
    .filter((topic) => topic !== selectedKnowledgePoint)
    .slice(0, 4);
  const smartTargets = initialWeakestKnowledge.slice(0, 3);
  const activeSmartTarget =
    smartTargets.find((item) => item.knowledgePoint === smartKnowledgePoint) ?? smartTargets[0] ?? null;
  const targetSmartKnowledgePoint = (smartKnowledgePoint || activeSmartTarget?.knowledgePoint || "").trim();
  const outlineKnowledgePoint = selectedKnowledgePoint.trim() || defaultOutlineKnowledgePoint;
  const activeKnowledgePoint =
    focusMode === "smart" ? targetSmartKnowledgePoint : selectedKnowledgePoint.trim();
  const selectedQuestionTypeLabel = getQuestionTypeLabel(questionType);
  const selectedDifficultyLabel = getDifficultyLabel(difficulty);
  const selectedPracticeModeLabel =
    MODES.find((item) => item.value === practiceMode)?.label ?? practiceMode;
  const hasSmartRecommendation = Boolean(activeSmartTarget?.knowledgePoint);
  const usingOutlineFocus = focusMode === "outline" && Boolean(selectedKnowledgePoint.trim());
  const primaryFocusMode = usingOutlineFocus ? "outline" : hasSmartRecommendation ? "smart" : "outline";
  const primaryKnowledgePoint = usingOutlineFocus
    ? selectedKnowledgePoint.trim()
    : activeSmartTarget?.knowledgePoint ?? outlineKnowledgePoint;
  const primarySubject =
    findSubjectByKnowledgePoint(primaryKnowledgePoint) || selectedSubject || subjectCatalog[0]?.subject || "";
  const primaryCanGenerate = Boolean(primaryKnowledgePoint);
  const todayReason = usingOutlineFocus
    ? "你已经切到按大纲定向强化，系统会先出一题；如果答错，再围绕同题型继续变式。"
    : activeSmartTarget
      ? "你在这个考点最近出错较多，建议先做一题确认错误类型。"
      : "你还没有形成错题记录，先从这个基础考点开始一题热身。";
  const todayWrongCount = activeSmartTarget?.wrongCount ?? 0;
  const todayAccuracy = activeSmartTarget ? `${Math.round(activeSmartTarget.accuracyRate * 100)}%` : "待记录";
  const todayMastery = activeSmartTarget
    ? getMasteryLabel(activeSmartTarget.mastery)
    : usingOutlineFocus
      ? "定向巩固中"
      : "先做一轮热身";
  const planHint =
    membershipPlan === "free"
      ? `今日还可生成 ${remaining ?? 0} 题`
      : membershipPlan === "premium"
        ? "高级会员：不限次练习"
        : "会员方案：不限次练习";
  const currentSetupLine =
    primaryKnowledgePoint && primarySubject ? `${primarySubject} · ${primaryKnowledgePoint}` : primarySubject || "待选择";
  const currentSetupMeta = `${selectedQuestionTypeLabel} · ${selectedDifficultyLabel} · ${selectedPracticeModeLabel}`;
  const canSwapRecommendation = smartTargets.length > 1 || actualTopicOptions.length > 1;
  const hasDraftAnswer = isObjective ? selectedAnswer.length > 0 : subjectiveDraft.trim().length > 0;
  const currentSubmissionSummary = question
    ? feedback?.verdict === "confused"
      ? "已标记为暂时没想通"
      : isObjective
        ? selectedAnswer.length > 0
          ? selectedAnswer.join("、")
          : "还未作答"
        : subjectiveDraft.trim()
          ? truncateText(subjectiveDraft.trim(), 96)
          : "未保留主观题内容"
    : "还未作答";
  const nextRoundSummary = feedback
    ? feedback.shouldChase
      ? "继续生成同题型、同考点变式题"
      : "本轮已完成，不再自动生成新题"
    : "";
  const selectedStudyPlanTask = findStudyPlanTaskContext(studyPlanRecord, studyPlanProgress, {
    knowledgePoint: primaryKnowledgePoint || undefined,
    questionType,
    difficulty,
    practiceMode
  });
  const nextStudyPlanTask = getNextStudyPlanTaskContext(studyPlanRecord, studyPlanProgress);
  const visibleStudyPlanTask = activeStudyPlanTask ?? selectedStudyPlanTask ?? nextStudyPlanTask;
  const visibleStudyPlanProgress = studyPlanProgress;
  const visibleStudyPlanRatio = getStudyPlanCompletionRatio(visibleStudyPlanProgress);
  const visibleStudyPlanStatus = visibleStudyPlanTask
    ? visibleStudyPlanTask.completed
      ? "这项今日任务已经达标"
      : `这题会计入今日第 ${visibleStudyPlanTask.index + 1} 项任务`
    : "今天还没有绑定到具体计划任务";

  function scrollToSection(element: HTMLElement | null, offset = 96) {
    if (!element) {
      return;
    }

    const nextTop = Math.max(0, window.scrollY + element.getBoundingClientRect().top - offset);
    window.scrollTo({
      top: nextTop,
      behavior: "smooth"
    });
  }

  useEffect(() => {
    if (!question || !pendingQuestionScroll) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      scrollToSection(questionSectionRef.current, 84);
      setPendingQuestionScroll(false);
    }, 160);

    return () => window.clearTimeout(timeoutId);
  }, [pendingQuestionScroll, question]);

  useEffect(() => {
    if (!feedback || !pendingFeedbackScroll) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      scrollToSection(feedbackSectionRef.current, 84);
      setPendingFeedbackScroll(false);
    }, 160);

    return () => window.clearTimeout(timeoutId);
  }, [feedback, pendingFeedbackScroll]);

  useEffect(() => {
    if (!outlineExpanded || !pendingOutlineScroll) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      scrollToSection(outlineSectionRef.current, 84);
      setPendingOutlineScroll(false);
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [outlineExpanded, pendingOutlineScroll]);

  useEffect(() => {
    if (!pendingTopScroll) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      scrollToSection(topSectionRef.current, 84);
      setPendingTopScroll(false);
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [pendingTopScroll, selectedKnowledgePoint, focusMode]);

  function resetCurrentAnswer() {
    setSelectedAnswer([]);
    setSubjectiveDraft("");
    setSubjectiveVerdict("wrong");
    setError("");
  }

  function handleSwapRecommendation() {
    setError("");

    if (usingOutlineFocus && actualTopicOptions.length > 1) {
      const currentIndex = actualTopicOptions.findIndex((topic) => topic === outlineKnowledgePoint);
      const nextTopic = actualTopicOptions[(currentIndex + 1 + actualTopicOptions.length) % actualTopicOptions.length];
      setOutlineExpanded(true);
      setSelectedKnowledgePoint(nextTopic);
      setPendingTopScroll(true);
      const nextSubject = findSubjectByKnowledgePoint(nextTopic);
      if (nextSubject) {
        setSelectedSubject(nextSubject);
      }
      return;
    }

    if (smartTargets.length > 1) {
      const currentIndex = smartTargets.findIndex((item) => item.knowledgePoint === targetSmartKnowledgePoint);
      const nextTarget = smartTargets[(currentIndex + 1 + smartTargets.length) % smartTargets.length];
      setFocusMode("smart");
      setSmartKnowledgePoint(nextTarget.knowledgePoint);
      return;
    }

    if (actualTopicOptions.length > 1) {
      const currentIndex = actualTopicOptions.findIndex((topic) => topic === outlineKnowledgePoint);
      const nextTopic = actualTopicOptions[(currentIndex + 1 + actualTopicOptions.length) % actualTopicOptions.length];
      setFocusMode("outline");
      setOutlineExpanded(true);
      setSelectedKnowledgePoint(nextTopic);
      const nextSubject = findSubjectByKnowledgePoint(nextTopic);
      if (nextSubject) {
        setSelectedSubject(nextSubject);
      }
    }
  }

  function handlePrimaryGenerate() {
    if (!primaryKnowledgePoint) {
      setError("先确认一个考点，我们再开始练。");
      return;
    }

    void handleGenerate({
      forcedFocusMode: primaryFocusMode,
      forcedKnowledgePoint: primaryKnowledgePoint
    });
  }

  function handleSubjectChange(nextSubject: string) {
    setSelectedSubject(nextSubject);

    const nextTopics = getTopicsForSubject(nextSubject, initialKnowledgePoint);
    setSelectedKnowledgePoint(nextTopics.includes(selectedKnowledgePoint) ? selectedKnowledgePoint : "");
  }

  async function handleGenerate(params?: {
    nextChaseMode?: boolean;
    forcedFocusMode?: "smart" | "outline";
    forcedKnowledgePoint?: string;
    forcedQuestionType?: QuestionType;
    forcedDifficulty?: DifficultyLevel;
    forcedPracticeMode?: PracticeMode;
  }) {
    const targetFocusMode = params?.forcedFocusMode ?? focusMode;
    const targetQuestionType = params?.forcedQuestionType ?? questionType;
    const targetDifficulty = params?.forcedDifficulty ?? difficulty;
    const targetPracticeMode = params?.forcedPracticeMode ?? practiceMode;
    const targetKnowledgePoint =
      params?.forcedKnowledgePoint?.trim() ??
      (targetFocusMode === "smart"
        ? ((smartKnowledgePoint || activeSmartTarget?.knowledgePoint || "").trim())
        : selectedKnowledgePoint.trim());

    if (targetFocusMode === "smart" && !targetKnowledgePoint) {
      setError("你还没有形成错题记录，先切到大纲定向强化，完成第一轮练习后系统就能自动接管强化。");
      return;
    }

    if (targetFocusMode === "outline" && (!selectedSubject || !targetKnowledgePoint)) {
      setError("先选择科目和考点，我们再从这里开始练。");
      return;
    }

    setLoading(true);
    setLoadingAction("generate");
    setError("");
    setFeedback(null);
    setOutlineExpanded(false);
    resetCurrentAnswer();
    setPendingFeedbackScroll(false);

    try {
      const response = await fetch("/api/generate-question", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          knowledgePoint: targetKnowledgePoint,
          questionType: targetQuestionType,
          difficulty: targetDifficulty,
          practiceMode: targetPracticeMode,
          chaseMode: params?.nextChaseMode ?? false,
          lastWrongReason
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "出题失败，请稍后再试。");
        return;
      }

      const data = (await response.json()) as GenerateQuestionResponse;
      setSessionId(data.sessionId);
      setQuestion(data.question);
      setRemaining(data.remainingFreeQuota);
      setChaseMode(data.chaseMode);
      setDifficulty(data.recommendedNextDifficulty);
      setQuestionType(data.question.type);
      setPracticeMode(targetPracticeMode);
      setFocusMode(targetFocusMode);
      setPendingQuestionScroll(true);

      if (targetFocusMode === "smart") {
        setSmartKnowledgePoint(targetKnowledgePoint);
      }
    } catch {
      setError("AI 出题暂时没有响应，请稍后再试。");
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  function handleGenerateVariantFromFeedback() {
    if (!feedback || !question) {
      return;
    }

    void handleGenerate({
      nextChaseMode: true,
      forcedFocusMode: "smart",
      forcedKnowledgePoint: question.knowledgePoint,
      forcedQuestionType: question.type,
      forcedDifficulty: feedback.recommendedNextDifficulty,
      forcedPracticeMode: "chase"
    });
  }

  function handleFinishRound() {
    setFeedback(null);
    setQuestion(null);
    setSessionId("");
    resetCurrentAnswer();
    setPendingTopScroll(true);
  }

  function toggleAnswer(option: string) {
    if (!question) {
      return;
    }

    if (question.type === "multiple") {
      setSelectedAnswer((current) =>
        current.includes(option)
          ? current.filter((item) => item !== option)
          : [...current, option].sort()
      );
      return;
    }

    setSelectedAnswer([option]);
  }

  async function handleSubmitAnswer(params?: { markConfused?: boolean }) {
    if (!sessionId || !question) {
      setError("先生成一道题，再开始作答。");
      return;
    }

    if (isObjective && selectedAnswer.length === 0 && !params?.markConfused) {
      setError("先选择一个答案，再提交本题结果。");
      return;
    }

    if (!isObjective && !subjectiveDraft.trim() && !params?.markConfused) {
      setError("先把你的思路写下来，再提交本题结果。");
      return;
    }

    setLoading(true);
    setLoadingAction("submit");
    setError("");

    try {
      const response = await fetch("/api/submit-answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId,
          selectedAnswer: isObjective ? selectedAnswer.sort().join(",") : subjectiveDraft.trim() || undefined,
          selfAssessment: !isObjective ? subjectiveVerdict : undefined,
          markedConfused: params?.markConfused ?? false
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "提交失败，请稍后再试。");
        return;
      }

      const data = (await response.json()) as SubmitAnswerResponse;
      setFeedback(data);
      setLastWrongReason(data.nextPromptHint);
      setChaseMode(data.shouldChase);
      setDifficulty(data.recommendedNextDifficulty);
      setStudyPlanProgress(data.studyPlanProgress ?? null);
      setActiveStudyPlanTask(data.nextStudyPlanTask ?? data.studyPlanTask ?? null);
      setPendingFeedbackScroll(true);
    } catch {
      setError("提交结果时网络有点不稳定，请稍后再试。");
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  return (
    <div className="shell" style={{ padding: "36px 0 88px", display: "grid", gap: 24 }}>
      <section ref={topSectionRef} className="panel section-block practice-top-section">
        <div className="today-practice-card">
          <div className="today-practice-card__main">
            <div className="today-practice-card__copy">
              <div className="eyebrow">today recommendation</div>
              <h1 className="practice-title">先做 1 题，看错题类型</h1>
              <strong className="today-practice-card__topic">
                {primaryKnowledgePoint || "先从一个基础考点开始热身"}
              </strong>
              <p className="helper-copy muted">{todayReason}</p>
            </div>

            <div className="today-practice-card__stats">
              <div className="today-practice-stat">
                <span>错题次数</span>
                <strong>{todayWrongCount} 次</strong>
              </div>
              <div className="today-practice-stat">
                <span>当前正确率</span>
                <strong>{todayAccuracy}</strong>
              </div>
              <div className="today-practice-stat">
                <span>掌握情况</span>
                <strong>{todayMastery}</strong>
              </div>
              <div className="today-practice-stat">
                <span>科目</span>
                <strong>{primarySubject || "待选择"}</strong>
              </div>
            </div>
          </div>

          <div className="practice-summary-inline">
            <span className="eyebrow">当前练习设置</span>
            <strong>{currentSetupLine}</strong>
            <span className="muted">{currentSetupMeta}</span>
          </div>

          {studyPlanRecord && visibleStudyPlanProgress ? (
            <div className="practice-plan-sync">
              <div className="split-row" style={{ gap: 12 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <span className="eyebrow">today plan sync</span>
                  <strong>{visibleStudyPlanStatus}</strong>
                </div>
                <span className="question-badge">
                  已完成 {visibleStudyPlanProgress.completedQuestions} / {visibleStudyPlanProgress.totalQuestions} 题
                </span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${Math.round(visibleStudyPlanRatio * 100)}%` }} />
              </div>
              <div className="practice-plan-sync__meta">
                <span className="muted">
                  {visibleStudyPlanTask
                    ? `${visibleStudyPlanTask.subject} · ${visibleStudyPlanTask.knowledgePoint}`
                    : `当前计划今天已完成 ${visibleStudyPlanProgress.completedTasks} / ${visibleStudyPlanProgress.totalTasks} 项任务`}
                </span>
                <span className="muted">
                  {visibleStudyPlanTask
                    ? `${visibleStudyPlanTask.completedQuestions} / ${visibleStudyPlanTask.targetQuestions} 题 · 答对 ${visibleStudyPlanTask.correctCount} 题`
                    : "继续做题后，这里的进度会自动推进。"}
                </span>
              </div>
            </div>
          ) : null}

          <div className="today-practice-card__actions">
            <button
              className="button button--danger today-practice-card__primary"
              onClick={handlePrimaryGenerate}
              disabled={loading || !primaryCanGenerate}
            >
              {loadingAction === "generate" ? "正在生成练习题..." : "生成 1 道练习题 →"}
            </button>
            <div className="today-practice-card__secondary">
              <button className="button" onClick={handleSwapRecommendation} disabled={loading || !canSwapRecommendation}>
                换一个考点
              </button>
              <button
                className="button button--ghost"
                onClick={() => {
                  setOutlineExpanded((current) => {
                    const nextExpanded = !current;
                    if (nextExpanded) {
                      setPendingOutlineScroll(true);
                    }
                    return nextExpanded;
                  });
                }}
                disabled={loading}
              >
                {outlineExpanded ? "收起大纲选择" : "按大纲选择"}
              </button>
            </div>
            <div className="today-practice-card__quota">{planHint}</div>
          </div>
        </div>

        {loadingAction === "generate" ? (
          <div className="status-box" role="status">
            DeepSeek 正在生成 1 道题。为了节省 token，本轮只生成一题；如果答错，再按同题型生成变式题。
          </div>
        ) : null}

        {loadingAction === "submit" ? (
          <div className="status-box" role="status">
            {isObjective
              ? "正在整理你的作答结果，并准备下一轮强化建议，请稍等片刻。"
              : "AI 正在批改你的主观题答案，并整理下一轮强化建议，请稍等片刻。"}
          </div>
        ) : null}

        {error ? <div className="danger-box">{error}</div> : null}
      </section>

      <section className="panel section-block practice-config-section">
        <div className="split-row">
          <div style={{ display: "grid", gap: 6 }}>
            <div className="eyebrow">practice config</div>
            <strong style={{ color: "var(--heading)", fontSize: 24 }}>练习配置</strong>
          </div>
          <span className="muted">不想配置也可以直接开始；答错后系统会锁定同题型继续变式。</span>
        </div>

        <div className="practice-config-stack">
          <div className="practice-config-group">
            <span className="practice-config-group__label">题型</span>
            <div className="choice-grid">
              {QUESTION_TYPES.map((item) => (
                <button
                  key={item.value}
                  className={`choice-chip${questionType === item.value ? " choice-chip--selected" : ""}`}
                  onClick={() => setQuestionType(item.value)}
                >
                  <span>{item.label}</span>
                  {questionType === item.value ? <span className="choice-chip__check">✓</span> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="practice-config-group">
            <span className="practice-config-group__label">难度</span>
            <div className="choice-grid">
              {DIFFICULTIES.map((item) => (
                <button
                  key={item.value}
                  className={`choice-chip${difficulty === item.value ? " choice-chip--selected" : ""}`}
                  onClick={() => setDifficulty(item.value)}
                >
                  <span>{item.label}</span>
                  {difficulty === item.value ? <span className="choice-chip__check">✓</span> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="practice-config-group">
            <span className="practice-config-group__label">模式</span>
            <div className="choice-grid">
              {MODES.map((item) => (
                <button
                  key={item.value}
                  className={`choice-chip${practiceMode === item.value ? " choice-chip--selected" : ""}`}
                  onClick={() => setPracticeMode(item.value)}
                >
                  <span>{item.label}</span>
                  {practiceMode === item.value ? <span className="choice-chip__check">✓</span> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        ref={outlineSectionRef}
        className={`panel section-block outline-panel${outlineExpanded ? " outline-panel--open" : ""}`}
      >
        <div className="split-row">
          <div style={{ display: "grid", gap: 6 }}>
            <div className="eyebrow">outline selector</div>
            <strong style={{ color: "var(--heading)", fontSize: 24 }}>按大纲选择其他考点</strong>
          </div>
          <button
            className="button button--ghost"
            onClick={() => setOutlineExpanded((current) => !current)}
            disabled={loading}
          >
            {outlineExpanded ? "收起" : "展开"}
          </button>
        </div>

        {outlineExpanded ? (
          <>
            <div className="practice-selection-grid">
              <label className="panel outline-panel__field">
                <span className="eyebrow">subject</span>
                <select
                  className="select"
                  value={selectedSubject}
                  onChange={(event) => {
                    setFocusMode("outline");
                    setPendingTopScroll(true);
                    handleSubjectChange(event.target.value);
                  }}
                >
                  {subjectCatalog.map((item) => (
                    <option key={item.subject} value={item.subject}>
                      {item.subject}
                    </option>
                  ))}
                </select>
              </label>

              <label className="panel outline-panel__field">
                <span className="eyebrow">topic</span>
                <select
                  className="select"
                  value={selectedKnowledgePoint}
                  onChange={(event) => {
                    setFocusMode("outline");
                    setSelectedKnowledgePoint(event.target.value);
                    setPendingTopScroll(true);
                  }}
                >
                  <option value="">请选择一个考点</option>
                  {topicOptions.map((topic) => (
                    <option key={topic} value={topic}>
                      {topic}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {quickTopicOptions.length ? (
              <div className="quick-picks quick-picks--light">
                <div className="eyebrow">quick picks</div>
                <div className="segment-row">
                  {quickTopicOptions.map((topic) => (
                    <button
                      key={topic}
                      className="button button--ghost quick-pick-button"
                      onClick={() => {
                        setFocusMode("outline");
                        setSelectedKnowledgePoint(topic);
                        setPendingTopScroll(true);
                      }}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <div className="practice-footnote muted">流程：系统出题 → 你答题 → 答错变式继续 → 答稳本轮完成</div>

      {question ? (
        <section ref={questionSectionRef} className="panel section-block">
          <div className="question-header">
            <div className="question-header__meta">
              <span className="eyebrow">{chaseMode ? "follow-up practice" : "fresh practice"}</span>
              <div className="question-badges">
                <span className="question-badge">{getQuestionTypeLabel(question.type)}</span>
                <span className="question-badge">{getDifficultyLabel(question.difficulty)}</span>
                <span className="question-badge question-badge--gold">{chaseMode ? "同题型变式" : "第一题"}</span>
              </div>
            </div>
            <div className="question-header__knowledge">
              <span className="eyebrow">knowledge point</span>
              <strong>{question.knowledgePoint}</strong>
            </div>
          </div>

          <div className="question-card">
            <h2 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 34px)" }}>{question.question}</h2>
          </div>

          {question.examTips?.length ? (
            <div className="question-tips">
              <div className="eyebrow">answer tips</div>
              <div className="question-tips__list">
                {question.examTips.map((tip) => (
                  <span key={tip} className="question-tip">
                    {tip}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="answer-panel">
            <div className="answer-panel__header">
              <div>
                <div className="eyebrow">{isObjective ? "objective answer" : "subjective answer"}</div>
                <strong style={{ color: "var(--heading)", fontSize: 22 }}>
                  {isObjective ? "选出你认为最稳的答案" : "先把思路和步骤完整写下来"}
                </strong>
              </div>
              <div className="muted">
                {isObjective
                  ? question.type === "multiple"
                    ? "多选题可多次点击，支持反选。"
                    : "单选 / 判断题点击一次即可切换答案。"
                  : "主观题会优先交给 AI 判卷；如果你完全卡住，也可以直接标记没想通。"}
              </div>
            </div>

            <div className="answer-status">
              <div className="answer-status__item">
                <span>当前选择</span>
                <strong>
                  {isObjective
                    ? selectedAnswer.length > 0
                      ? selectedAnswer.join("、")
                      : "还未选择"
                    : subjectiveDraft.trim()
                      ? "已写入待 AI 批改草稿"
                      : "还未开始作答"}
                </strong>
              </div>
              <div className="answer-status__item">
                <span>提交方式</span>
                <strong>
                  {isObjective
                    ? question.type === "multiple"
                      ? "可多选，提交前可反复调整"
                      : "单次提交，系统立即判断对错"
                    : "提交后优先由 AI 判卷，再决定下一轮强化方向"}
                </strong>
              </div>
            </div>

            {isObjective ? (
              <div className="option-grid">
                {Object.entries(question.options ?? {}).map(([optionKey, optionValue]) => (
                  <button
                    key={optionKey}
                    className="button option-button"
                    onClick={() => toggleAnswer(optionKey)}
                    style={{
                      textAlign: "left",
                      background: selectedAnswer.includes(optionKey) ? "rgba(111,143,174,0.12)" : undefined,
                      borderColor: selectedAnswer.includes(optionKey) ? "rgba(111,143,174,0.28)" : undefined
                    }}
                  >
                    <span className="option-button__key">{optionKey}</span>
                    <span>{optionValue}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="subjective-panel">
                <div className="danger-box">
                  这类主观题现在会优先交给 AI 判卷。你先把步骤、分录和关键判断写出来，系统会按参考要点给出整体判定和改进建议。
                </div>
                <textarea
                  className="input textarea"
                  placeholder="把你的计算过程、分录步骤或综合题答案写在这里。提交后，AI 会结合参考要点给出判定与改进建议。"
                  value={subjectiveDraft}
                  onChange={(event) => setSubjectiveDraft(event.target.value)}
                  rows={8}
                />
                <div className="segment-row">
                  {[
                    ["correct", "需要手动判定时，按这个结果"],
                    ["wrong", "这部分我觉得还不够稳"],
                    ["confused", "我暂时没想通"]
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className="button"
                      onClick={() => setSubjectiveVerdict(value as "correct" | "wrong" | "confused")}
                      style={{
                        background:
                          subjectiveVerdict === value ? "rgba(111,143,174,0.12)" : undefined,
                        borderColor:
                          subjectiveVerdict === value ? "rgba(111,143,174,0.28)" : undefined
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="answer-panel__footer">
              <div className="answer-panel__actions">
                <button className="button button--danger" onClick={() => handleSubmitAnswer()} disabled={loading}>
                  {loadingAction === "submit" ? "正在提交结果..." : "提交本题结果"}
                </button>
                <button className="button" onClick={() => handleSubmitAnswer({ markConfused: true })} disabled={loading}>
                  这题我暂时没想通
                </button>
                <button className="button button--ghost" onClick={resetCurrentAnswer} disabled={loading || !hasDraftAnswer}>
                  清空重新作答
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {feedback ? (
        <section ref={feedbackSectionRef} className="panel section-block">
          <div className="feedback-card">
            <div className="feedback-card__headline">
              <div
                style={{
                  color: feedback.correct ? "var(--success)" : "var(--accent-strong)",
                  fontWeight: 700,
                  fontSize: 24
                }}
              >
                {feedback.correct
                  ? "本轮完成，这类题先算掌握。"
                  : feedback.verdict === "confused"
                    ? "这题先记为没想通，下一题降低干扰继续变式。"
                    : "答错了，继续生成同题型变式题。"}
              </div>
              <div className="question-badges">
                <span className="question-badge">{getMasteryLabel(feedback.masteryLevel)}</span>
                <span className="question-badge">{getDifficultyLabel(feedback.recommendedNextDifficulty)}</span>
              </div>
            </div>

            <div className="feedback-summary-grid">
              <div className="feedback-summary-card feedback-summary-card--highlight">
                <span>本题结果</span>
                <strong>
                  {feedback.correct
                    ? "这一轮已经完成"
                    : feedback.verdict === "confused"
                      ? "这题先记为没想通"
                      : "这题答错，需要变式纠正"}
                </strong>
                <p className="muted">
                  {feedback.correct
                    ? "本轮到这里收住，不会继续自动调用 AI。你可以回到上方换考点或再开一轮。"
                    : "点击下方按钮后，DeepSeek 会围绕同一考点和题型再生成 1 道变式题。"}
                </p>
              </div>
              <div className="feedback-summary-card">
                <span>你的作答</span>
                <strong>{currentSubmissionSummary}</strong>
              </div>
              <div className="feedback-summary-card">
                <span>参考答案 / 评分要点</span>
                <strong>{truncateText(formatAnswer(feedback.correctAnswer), 96)}</strong>
              </div>
              <div className="feedback-summary-card">
                <span>下一轮策略</span>
                <strong>{nextRoundSummary}</strong>
                <p className="muted">
                  {feedback.shouldChase
                    ? "下一题保持本题题型不变，只改条件、案例或干扰项。"
                    : "本题已经答对，本轮不再要求补题。"}
                </p>
              </div>
            </div>

            {feedback.aiReview ? (
              <div className="feedback-summary-grid">
                <div className="feedback-summary-card feedback-summary-card--highlight">
                  <span>AI 判卷结论</span>
                  <strong>{feedback.aiReview.feedback}</strong>
                  <p className="muted">
                    {feedback.gradingSource === "ai"
                      ? "这道主观题已经按参考要点完成了一轮 AI 判卷。"
                      : "当前仍按自评结果记录，本轮没有触发 AI 判卷。"}
                  </p>
                </div>
                <div className="feedback-summary-card">
                  <span>已经写到位</span>
                  <strong>
                    {feedback.aiReview.strengths.length > 0
                      ? feedback.aiReview.strengths.join("；")
                      : "这轮还没有明显写稳的关键点"}
                  </strong>
                </div>
                <div className="feedback-summary-card">
                  <span>下一步优先补</span>
                  <strong>
                    {feedback.aiReview.improvements.length > 0
                      ? feedback.aiReview.improvements.join("；")
                      : "继续按参考口径再补一轮表达和步骤"}
                  </strong>
                </div>
              </div>
            ) : null}

            <div className="feedback-metrics">
              <div className="config-summary__item">
                <span>掌握情况</span>
                <strong>{getMasteryLabel(feedback.masteryLevel)}</strong>
              </div>
              <div className="config-summary__item">
                <span>建议下一轮难度</span>
                <strong>{getDifficultyLabel(feedback.recommendedNextDifficulty)}</strong>
              </div>
              <div className="config-summary__item">
                <span>当前强化目标</span>
                <strong>{feedback.shouldChase ? "继续同题型变式" : "本轮完成"}</strong>
              </div>
            </div>

            {feedback.answerAnalysis?.length ? (
              <div className="answer-analysis-panel">
                <div className="eyebrow">answer breakdown</div>
                <h3>选项解析</h3>
                <div className="answer-analysis-grid">
                  {feedback.answerAnalysis.map((item) => (
                    <div
                      key={item.optionKey}
                      className={`answer-analysis-item ${
                        item.isCorrect
                          ? "answer-analysis-item--correct"
                          : item.isSelected
                            ? "answer-analysis-item--selected-wrong"
                            : ""
                      }`}
                    >
                      <div className="answer-analysis-item__title">
                        <strong>
                          {item.optionKey} {item.isCorrect ? "正确" : "错误"}
                        </strong>
                        {item.isSelected ? <span className="question-badge">你的选择</span> : null}
                      </div>
                      <p>{item.optionText}</p>
                      <span>{item.explanation}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="feedback-report-grid">
              <div className="feedback-note-card">
                <div className="eyebrow">ai analysis</div>
                <div className="feedback-analysis muted">{feedback.analysis}</div>
              </div>
              {studyPlanRecord && studyPlanProgress ? (
                <div className="feedback-note-card">
                  <div className="eyebrow">today plan sync</div>
                  <strong style={{ color: "var(--heading)", lineHeight: 1.65 }}>
                    {feedback.studyPlanTask
                      ? `这题已经计入今日第 ${feedback.studyPlanTask.index + 1} 项任务。`
                      : "这题没有计入今天计划，但做题记录已经保留下来。"}
                  </strong>
                  <div className="practice-plan-sync__meta">
                    <span className="muted">
                      已完成 {studyPlanProgress.completedQuestions} / {studyPlanProgress.totalQuestions} 题 ·{" "}
                      {studyPlanProgress.completedTasks} / {studyPlanProgress.totalTasks} 项任务达标
                    </span>
                    <span className="muted">
                      {feedback.nextStudyPlanTask
                        ? `下一项：${feedback.nextStudyPlanTask.subject} · ${feedback.nextStudyPlanTask.knowledgePoint}`
                        : "今天这份计划已经没有待完成任务了。"}
                    </span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-bar"
                      style={{ width: `${Math.round(getStudyPlanCompletionRatio(studyPlanProgress) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null}
              <div className="feedback-note-card">
                <div className="eyebrow">next round</div>
                <strong style={{ color: "var(--heading)", lineHeight: 1.65 }}>
                  {feedback.shouldChase
                    ? "继续用同一考点和题型做变式，把这类错误纠正掉。"
                    : "本轮已经完成。为了节省 token，系统不会自动再出确认题。"}
                </strong>
                <div className="question-badges">
                  <span className="question-badge">{feedback.shouldChase ? "继续同题型变式" : "本轮完成"}</span>
                  <span className="question-badge">{getMasteryLabel(feedback.masteryLevel)}</span>
                </div>
              </div>
            </div>
            <div className="feedback-actions">
              {feedback.shouldChase ? (
                <button
                  className="button button--danger"
                  onClick={handleGenerateVariantFromFeedback}
                  disabled={loading}
                >
                  生成同题型变式题 →
                </button>
              ) : (
                <button className="button button--danger" onClick={handleFinishRound} disabled={loading}>
                  本轮完成，回到下一题
                </button>
              )}
              {focusMode === "outline" ? (
                <button
                  className="button"
                  onClick={() => {
                    setFocusMode("smart");
                    setSmartKnowledgePoint(question?.knowledgePoint ?? activeKnowledgePoint);
                    void handleGenerate({
                      forcedFocusMode: "smart",
                      forcedKnowledgePoint: question?.knowledgePoint ?? activeKnowledgePoint
                    });
                  }}
                  disabled={loading}
                >
                  切到错题强化继续追
                </button>
              ) : null}
              {feedback.shouldChase ? null : (
                <button className="button" onClick={() => void handleGenerate()} disabled={loading}>
                  再生成 1 题
                </button>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
