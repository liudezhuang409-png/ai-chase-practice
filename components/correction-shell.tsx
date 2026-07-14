"use client";

import { useState } from "react";
import type {
  AnalyzeMistakeResponse,
  QuestionPayload,
  QuestionType,
  SubmitAnswerResponse,
  UserKnowledgeSnapshot,
  UserPlan
} from "@/lib/types";

const QUESTION_TYPE_OPTIONS: Array<{ value: QuestionType; label: string }> = [
  { value: "single", label: "单选" },
  { value: "multiple", label: "多选" },
  { value: "judge", label: "判断" },
  { value: "calculation", label: "计算分析" },
  { value: "comprehensive", label: "综合题" }
];

const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题",
  calculation: "计算分析",
  comprehensive: "综合题"
};

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

function isObjective(question: QuestionPayload | null) {
  return question?.type === "single" || question?.type === "multiple" || question?.type === "judge";
}

export function CorrectionShell({
  initialPlan,
  initialRemaining,
  initialWeakestKnowledge
}: {
  initialPlan: UserPlan;
  initialRemaining: number | null;
  initialWeakestKnowledge: UserKnowledgeSnapshot[];
}) {
  const suggestedPoint = initialWeakestKnowledge[0]?.knowledgePoint ?? "";
  const [wrongQuestion, setWrongQuestion] = useState("");
  const [userAnswer, setUserAnswer] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [userNote, setUserNote] = useState("");
  const [knowledgePoint, setKnowledgePoint] = useState(suggestedPoint);
  const [questionType, setQuestionType] = useState<QuestionType>("single");
  const [result, setResult] = useState<AnalyzeMistakeResponse | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string[]>([]);
  const [subjectiveDraft, setSubjectiveDraft] = useState("");
  const [feedback, setFeedback] = useState<SubmitAnswerResponse | null>(null);
  const [loading, setLoading] = useState<"analyze" | "submit" | null>(null);
  const [error, setError] = useState("");

  const planText =
    initialPlan === "free"
      ? `免费版今日还可纠正 ${initialRemaining ?? 0} 道错题`
      : "9.9 会员：错题纠正不限次";
  const activeQuestion = result?.question ?? null;
  const objective = isObjective(activeQuestion);

  async function handleAnalyze() {
    if (!wrongQuestion.trim()) {
      setError("请先粘贴错题题干。");
      return;
    }

    setLoading("analyze");
    setError("");
    setFeedback(null);
    setSelectedAnswer([]);
    setSubjectiveDraft("");

    const response = await fetch("/api/analyze-mistake", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        wrongQuestion,
        userAnswer,
        correctAnswer,
        userNote,
        knowledgePoint,
        questionType
      })
    });

    setLoading(null);

    const data = (await response.json().catch(() => null)) as (AnalyzeMistakeResponse & { error?: string }) | null;

    if (!response.ok || !data?.analysis) {
      setError(data?.error ?? "错题分析失败，请稍后重试。");
      return;
    }

    setResult(data);
    setKnowledgePoint(data.analysis.knowledgePoint);
    setQuestionType(data.analysis.questionType);
  }

  function toggleOption(optionKey: string) {
    if (!activeQuestion) {
      return;
    }

    if (activeQuestion.type === "multiple") {
      setSelectedAnswer((current) =>
        current.includes(optionKey)
          ? current.filter((item) => item !== optionKey)
          : [...current, optionKey].sort()
      );
      return;
    }

    setSelectedAnswer([optionKey]);
  }

  async function handleSubmit(markConfused = false) {
    if (!result || !activeQuestion) {
      return;
    }

    const answerText = objective ? selectedAnswer.join(",") : subjectiveDraft.trim();
    if (!markConfused && !answerText) {
      setError("请先完成这道变式题，再提交结果。");
      return;
    }

    setLoading("submit");
    setError("");

    const response = await fetch("/api/submit-answer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sessionId: result.sessionId,
        selectedAnswer: answerText,
        markedConfused: markConfused,
        selfAssessment: markConfused ? "confused" : undefined
      })
    });

    setLoading(null);

    const data = (await response.json().catch(() => null)) as (SubmitAnswerResponse & { error?: string }) | null;

    if (!response.ok || !data?.analysis) {
      setError(data?.error ?? "提交失败，请稍后重试。");
      return;
    }

    setFeedback(data);
  }

  function resetAll() {
    setWrongQuestion("");
    setUserAnswer("");
    setCorrectAnswer("");
    setUserNote("");
    setResult(null);
    setFeedback(null);
    setSelectedAnswer([]);
    setSubjectiveDraft("");
    setError("");
  }

  return (
    <main className="shell correction-page">
      <section className="correction-hero">
        <div className="correction-hero__copy">
          <div className="hero-kicker">AI 错题纠正器</div>
          <h1 className="correction-title">把错题改到不再错</h1>
          <p className="helper-copy muted">
            粘贴一道错题和你的错误答案，系统先判断错误类型，再给纠正口径，最后生成一题专门修正这个错误的变式题。
          </p>
        </div>
        <div className="correction-status">
          <span>{planText}</span>
          <strong>核心功能：错因识别 + 纠正讲解 + 变式训练</strong>
        </div>
      </section>

      <section className="correction-layout">
        <div className="correction-input-panel">
          <div className="section-heading">
            <span className="eyebrow">wrong question</span>
            <h2>录入错题</h2>
          </div>

          <label className="field-stack">
            <span>错题题干</span>
            <textarea
              className="input textarea correction-textarea"
              value={wrongQuestion}
              onChange={(event) => setWrongQuestion(event.target.value)}
              placeholder="粘贴你做错的题干、选项或主观题材料。"
            />
          </label>

          <div className="correction-two-col">
            <label className="field-stack">
              <span>我的错误答案</span>
              <textarea
                className="input textarea"
                value={userAnswer}
                onChange={(event) => setUserAnswer(event.target.value)}
                placeholder="例如：选了 B，或者写下你的计算/分录。"
              />
            </label>
            <label className="field-stack">
              <span>正确答案</span>
              <textarea
                className="input textarea"
                value={correctAnswer}
                onChange={(event) => setCorrectAnswer(event.target.value)}
                placeholder="可填标准答案、老师解析，留空也能分析。"
              />
            </label>
          </div>

          <div className="correction-two-col">
            <label className="field-stack">
              <span>考点</span>
              <input
                className="input"
                value={knowledgePoint}
                onChange={(event) => setKnowledgePoint(event.target.value)}
                placeholder="可选，例如：收入 / 收入确认五步法"
              />
            </label>
            <label className="field-stack">
              <span>题型</span>
              <select
                className="input"
                value={questionType}
                onChange={(event) => setQuestionType(event.target.value as QuestionType)}
              >
                {QUESTION_TYPE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field-stack">
            <span>我觉得自己错在</span>
            <input
              className="input"
              value={userNote}
              onChange={(event) => setUserNote(event.target.value)}
              placeholder="可选，例如：总把收入确认时点和收款时点混在一起。"
            />
          </label>

          <div className="page-actions">
            <button className="button button--danger" onClick={handleAnalyze} disabled={loading !== null}>
              {loading === "analyze" ? "正在分析错因..." : "分析错题并生成纠正题"}
            </button>
            <button className="button button--ghost" onClick={resetAll} disabled={loading !== null}>
              清空
            </button>
          </div>
          {error ? <div className="danger-box">{error}</div> : null}
        </div>

        <aside className="correction-side-panel">
          <div className="section-heading">
            <span className="eyebrow">mistake type</span>
            <h2>{result ? result.analysis.errorTypeLabel : "等待分析"}</h2>
          </div>
          {result ? (
            <div className="correction-result-stack">
              <div className="correction-chip-row">
                <span>{result.analysis.knowledgePoint}</span>
                <span>{QUESTION_TYPE_LABEL[result.analysis.questionType]}</span>
                <span>{result.plan === "free" ? `剩余 ${result.remainingFreeQuota ?? 0} 次` : "不限次"}</span>
              </div>
              <div>
                <strong>为什么错</strong>
                <p>{result.analysis.diagnosis}</p>
              </div>
              <div>
                <strong>怎么改</strong>
                <p>{result.analysis.correction}</p>
              </div>
              <ol className="correction-steps">
                {result.analysis.correctionSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <div className="status-box">{result.analysis.variantStrategy}</div>
            </div>
          ) : (
            <div className="status-box">
              系统会把错题归类成概念、审题、计算、法条/准则、分录、题型方法、表达不完整或粗心失误，再按错误类型出纠正题。
            </div>
          )}
        </aside>
      </section>

      {activeQuestion ? (
        <section className="correction-drill">
          <div className="section-heading">
            <span className="eyebrow">correction drill</span>
            <h2>纠正变式题</h2>
          </div>
          <div className="question-card">
            <div className="correction-chip-row">
              <span>{QUESTION_TYPE_LABEL[activeQuestion.type]}</span>
              <span>{activeQuestion.knowledgePoint}</span>
              <span>专门纠正：{result?.analysis.errorTypeLabel}</span>
            </div>
            <h3>{activeQuestion.question}</h3>

            {activeQuestion.options ? (
              <div className="option-grid">
                {Object.entries(activeQuestion.options).map(([key, value]) => (
                  <button
                    key={key}
                    className="button option-button"
                    onClick={() => toggleOption(key)}
                    style={{
                      textAlign: "left",
                      background: selectedAnswer.includes(key) ? "rgba(111,143,174,0.12)" : undefined,
                      borderColor: selectedAnswer.includes(key) ? "rgba(111,143,174,0.28)" : undefined
                    }}
                  >
                    <span className="option-button__key">{key}</span>
                    <span>{value}</span>
                  </button>
                ))}
              </div>
            ) : (
              <textarea
                className="input textarea correction-textarea"
                value={subjectiveDraft}
                onChange={(event) => setSubjectiveDraft(event.target.value)}
                placeholder="把这道变式题的步骤写完整，系统会继续用 AI 判卷。"
              />
            )}

            <div className="page-actions">
              <button className="button button--danger" onClick={() => handleSubmit(false)} disabled={loading !== null}>
                {loading === "submit" ? "正在提交..." : "提交纠正题"}
              </button>
              <button className="button" onClick={() => handleSubmit(true)} disabled={loading !== null}>
                这题还是没想通
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {feedback && activeQuestion ? (
        <section className="correction-feedback">
          <div className="section-heading">
            <span className="eyebrow">result</span>
            <h2>{feedback.correct ? "这类错误正在被纠正" : "这个错误类型还要继续压"}</h2>
          </div>
          <div className="correction-feedback-grid">
            <div>
              <strong>你的结果</strong>
              <p>{feedback.verdict === "confused" ? "暂时没想通" : feedback.correct ? "答对" : "答错"}</p>
            </div>
            <div>
              <strong>参考答案</strong>
              <p>{formatAnswer(activeQuestion.answer)}</p>
            </div>
            <div>
              <strong>下一步</strong>
              <p>{feedback.shouldChase ? "继续围绕同一错误类型生成变式题。" : "再做一题确认稳定后，可以换下一道错题。"}</p>
            </div>
          </div>
          <div className="status-box">{feedback.analysis}</div>
        </section>
      ) : null}
    </main>
  );
}
