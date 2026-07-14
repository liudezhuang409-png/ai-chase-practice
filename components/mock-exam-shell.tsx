"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { UrlObject } from "url";
import type {
  MockExamPaper,
  MockExamQuestionAnswer,
  MockExamReport,
  QuestionPayload,
  SubmissionVerdict,
  UserKnowledgeSnapshot
} from "@/lib/types";
import { toPercent } from "@/lib/utils";

type AnswerDraft = {
  selectedOption?: string;
  selectedOptions?: string[];
  draft?: string;
  selfAssessment?: SubmissionVerdict;
};

const QUESTION_TYPE_LABEL: Record<QuestionPayload["type"], string> = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题",
  calculation: "计算分析",
  comprehensive: "综合题"
};

const DIFFICULTY_LABEL: Record<QuestionPayload["difficulty"], string> = {
  easy: "基础",
  medium: "进阶",
  hard: "冲刺"
};

function formatCorrectAnswer(answer: QuestionPayload["answer"]) {
  if (typeof answer === "boolean") {
    return answer ? "正确" : "错误";
  }

  if (typeof answer === "string") {
    return answer;
  }

  if (Array.isArray(answer)) {
    return answer.join("、");
  }

  return answer.keyPoints.join("；");
}

function isSubjective(question: QuestionPayload | undefined) {
  return question?.type === "calculation" || question?.type === "comprehensive";
}

function buildPracticeHref(knowledgePoint: string): UrlObject {
  return {
    pathname: "/practice",
    query: {
      focus: "outline",
      mode: "review",
      knowledge: knowledgePoint
    }
  };
}

export function MockExamShell({
  initialSubjects,
  initialSuggestedSubject,
  initialWeakestKnowledge,
  initialPaper
}: {
  initialSubjects: string[];
  initialSuggestedSubject: string;
  initialWeakestKnowledge: UserKnowledgeSnapshot[];
  initialPaper: MockExamPaper | null;
}) {
  const router = useRouter();
  const examSectionRef = useRef<HTMLElement | null>(null);
  const reportSectionRef = useRef<HTMLElement | null>(null);
  const [selectedSubject, setSelectedSubject] = useState(initialSuggestedSubject);
  const [paper, setPaper] = useState<MockExamPaper | null>(initialPaper);
  const [report, setReport] = useState<MockExamReport | null>(initialPaper?.weakness_report ?? null);
  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>({});
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (paper && !report) {
      examSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [paper, report]);

  useEffect(() => {
    if (report) {
      reportSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [report]);

  const recommendedWeakness = useMemo(
    () =>
      initialWeakestKnowledge.find((item) => item.knowledgePoint.includes(" / ") && item.knowledgePoint.includes("/")) ??
      initialWeakestKnowledge[0] ??
      null,
    [initialWeakestKnowledge]
  );

  const answeredCount = useMemo(() => {
    if (!paper) {
      return 0;
    }

    if (report) {
      return paper.generated_questions.length;
    }

    return paper.generated_questions.filter((item) => {
      const current = answers[item.sessionId];
      if (!current) {
        return false;
      }

      if (item.question.type === "multiple") {
        return (current.selectedOptions?.length ?? 0) > 0;
      }

      if (isSubjective(item.question)) {
        return current.selfAssessment === "confused" || Boolean(current.draft?.trim());
      }

      return Boolean(current.selectedOption);
    }).length;
  }, [answers, paper, report]);

  async function handleGenerate() {
    setGenerating(true);
    setError("");

    const response = await fetch("/api/mock-exam/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        subject: selectedSubject
      })
    });

    setGenerating(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "迷你模考生成失败。");
      return;
    }

    const data = (await response.json()) as { paper: MockExamPaper };
    setPaper(data.paper);
    setReport(data.paper.weakness_report ?? null);
    setAnswers({});
    router.replace(`/exam?paper=${data.paper.id}`);
  }

  function updateAnswer(sessionId: string, updater: (current: AnswerDraft) => AnswerDraft) {
    setAnswers((current) => ({
      ...current,
      [sessionId]: updater(current[sessionId] ?? {})
    }));
  }

  function toggleMultipleOption(sessionId: string, optionKey: string) {
    updateAnswer(sessionId, (current) => {
      const selectedOptions = current.selectedOptions ?? [];
      const nextOptions = selectedOptions.includes(optionKey)
        ? selectedOptions.filter((item) => item !== optionKey)
        : [...selectedOptions, optionKey].sort();

      return {
        ...current,
        selectedOptions: nextOptions
      };
    });
  }

  async function handleSubmit() {
    if (!paper) {
      return;
    }

    setSubmitting(true);
    setError("");

    const payload: MockExamQuestionAnswer[] = paper.generated_questions.map((item) => {
      const current = answers[item.sessionId] ?? {};
      const selectedAnswer =
        item.question.type === "multiple"
          ? current.selectedOptions?.join(",")
          : isSubjective(item.question)
            ? current.draft?.trim()
            : current.selectedOption;

        return {
          sessionId: item.sessionId,
          selectedAnswer,
          selfAssessment:
            isSubjective(item.question) && current.selfAssessment === "confused"
              ? current.selfAssessment
              : undefined,
          markedConfused: current.selfAssessment === "confused"
        };
    });

    const response = await fetch("/api/mock-exam/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        paperId: paper.id,
        answers: payload
      })
    });

    setSubmitting(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "交卷失败。");
      return;
    }

    const data = (await response.json()) as {
      paperId: string;
      report: MockExamReport;
    };
    setReport(data.report);
    router.replace(`/exam?paper=${data.paperId}`);
    router.refresh();
  }

  return (
    <>
      <section className="panel section-block exam-hero">
        <div className="eyebrow">premium mock exam</div>
        <div className="split-row" style={{ alignItems: "start" }}>
          <div style={{ display: "grid", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: "clamp(36px, 7vw, 64px)" }}>迷你模考</h1>
            <p className="helper-copy muted">
              不再只是一题一题地练。这里会围绕单科关键考点生成一套 6 题迷你卷，交卷后直接告诉你分数、最该补的点和下一步强化方向。
            </p>
          </div>
          <div className="selection-preview selection-preview--compact exam-hero__summary">
            <div className="eyebrow">recommended subject</div>
            <strong>{selectedSubject}</strong>
            <span className="muted">
              {recommendedWeakness
                ? `最近更建议先照顾「${recommendedWeakness.knowledgePoint}」这一类弱点。`
                : "还没有明显的历史弱点，就先从当前科目做一套热身。"}
            </span>
          </div>
        </div>

        <div className="metric-grid">
          <div className="metric-card">
            <div className="eyebrow">paper mode</div>
            <strong>6 题迷你卷</strong>
            <span className="muted">客观 + 主观混合</span>
          </div>
          <div className="metric-card">
            <div className="eyebrow">time target</div>
            <strong>45 分钟</strong>
            <span className="muted">更接近考前冲刺节奏</span>
          </div>
          <div className="metric-card">
            <div className="eyebrow">delivery</div>
            <strong>交卷即出报告</strong>
            <span className="muted">得分、错点、下一步建议一起给</span>
          </div>
        </div>

        <div className="segment-row">
          {initialSubjects.map((subject) => (
            <button
              key={subject}
              type="button"
              className="button"
              onClick={() => setSelectedSubject(subject)}
              style={{
                background: selectedSubject === subject ? "rgba(111,143,174,0.12)" : undefined,
                borderColor: selectedSubject === subject ? "rgba(111,143,174,0.3)" : undefined
              }}
            >
              {subject}
            </button>
          ))}
        </div>

        <div className="status-box">
          当前会优先生成这套科目的常见得分点与易错点混合题组。主观题现在会优先交给 AI 判卷，交卷后会统一给出整套卷子的弱点报告。
        </div>

        <div className="page-actions">
          <button className="button button--danger" type="button" onClick={handleGenerate} disabled={generating}>
            {generating ? "AI 正在生成试卷，通常约 20-35 秒..." : "生成一套迷你模考 →"}
          </button>
          {paper ? (
            <button className="button" type="button" onClick={handleGenerate} disabled={generating}>
              再生成一套
            </button>
          ) : null}
          <Link className="button" href="/practice">
            先回练习中心
          </Link>
        </div>

        {error ? <div className="danger-box">{error}</div> : null}
      </section>

      {paper ? (
        <section ref={examSectionRef} className="panel section-block exam-paper">
          <div className="split-row" style={{ alignItems: "start" }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div className="eyebrow">live paper</div>
              <h2 style={{ margin: 0, fontSize: "clamp(30px, 5vw, 46px)" }}>{paper.exam_name}</h2>
              <p className="helper-copy muted">
                当前已作答 {answeredCount} / {paper.generated_questions.length} 题。
                {report ? " 这套卷子已经交卷，下面可以直接复盘。" : " 做完后交卷，系统会自动给你生成弱点报告。"}
              </p>
            </div>
            <div className="selection-preview selection-preview--compact exam-progress-card">
              <div className="eyebrow">paper progress</div>
              <strong>
                {answeredCount} / {paper.generated_questions.length} 题
              </strong>
              <span className="muted">
                {report ? `最终得分 ${report.earnedScore} / ${report.totalScore}` : "建议按顺序完成，再统一交卷。"}
              </span>
            </div>
          </div>

          <div className="exam-question-list">
            {paper.generated_questions.map((item, index) => {
              const current = answers[item.sessionId] ?? {};
              const question = item.question;
              const options = question.options ? Object.entries(question.options) : [];
              const subjective = isSubjective(question);

              return (
                <article key={item.sessionId} className="exam-question-card">
                  <div className="split-row exam-question-card__head">
                    <div style={{ display: "grid", gap: 8 }}>
                      <div className="eyebrow">question {String(index + 1).padStart(2, "0")}</div>
                      <strong>{question.question}</strong>
                    </div>
                    <div className="exam-question-card__meta">
                      <span>{QUESTION_TYPE_LABEL[question.type]}</span>
                      <span>{DIFFICULTY_LABEL[question.difficulty]}</span>
                      <span>{item.score} 分</span>
                    </div>
                  </div>

                  <div className="selection-preview selection-preview--compact">
                    <div className="eyebrow">knowledge point</div>
                    <strong>{item.knowledgePoint}</strong>
                    <span className="muted">这题会计入整套模考的单科结果，不再单独追题。</span>
                  </div>

                  {question.options ? (
                    <div className="exam-option-grid">
                      {options.map(([key, value]) => {
                        const selected =
                          question.type === "multiple"
                            ? current.selectedOptions?.includes(key)
                            : current.selectedOption === key;

                        return (
                          <button
                            key={key}
                            type="button"
                            className="exam-option"
                            data-selected={selected ? "true" : "false"}
                            disabled={Boolean(report)}
                            onClick={() =>
                              question.type === "multiple"
                                ? toggleMultipleOption(item.sessionId, key)
                                : updateAnswer(item.sessionId, (draft) => ({
                                    ...draft,
                                    selectedOption: key
                                  }))
                            }
                          >
                            <span className="exam-option__key">{key}</span>
                            <span>{value}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  {subjective ? (
                    <div className="exam-subjective-block">
                      <textarea
                        className="input exam-textarea"
                        placeholder="先把你的步骤、分录、关键判断写下来。交卷后，AI 会结合参考要点给出判定与改进建议。"
                        value={current.draft ?? ""}
                        disabled={Boolean(report)}
                        onChange={(event) =>
                          updateAnswer(item.sessionId, (draft) => ({
                            ...draft,
                            draft: event.target.value
                          }))
                        }
                      />
                      <div className="status-box">
                        主观题会优先交给 AI 判卷。如果你完全卡住，可以直接标记“我完全卡住”。
                      </div>
                      <div className="segment-row">
                        {[
                          { value: "correct", label: "需要手动判定时，按这个结果" },
                          { value: "wrong", label: "我感觉还差一点" },
                          { value: "confused", label: "我完全卡住" }
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className="button"
                            disabled={Boolean(report)}
                            onClick={() =>
                              updateAnswer(item.sessionId, (draft) => ({
                                ...draft,
                                selfAssessment: option.value as SubmissionVerdict
                              }))
                            }
                            style={{
                              background:
                                current.selfAssessment === option.value ? "rgba(111,143,174,0.12)" : undefined,
                              borderColor:
                                current.selfAssessment === option.value ? "rgba(111,143,174,0.3)" : undefined
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {report ? (
                    <div className="status-box">
                      <strong>
                        {report.results[index]?.correct ? "本题得分" : "本题失分"}：
                        {report.results[index]?.scoreEarned ?? 0} / {report.results[index]?.scorePossible ?? item.score}
                      </strong>
                      <div>参考答案：{formatCorrectAnswer(question.answer)}</div>
                      <div className="muted">{report.results[index]?.analysis ?? question.analysis}</div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          {!report ? (
            <div className="page-actions">
              <button className="button button--danger" type="button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "正在交卷并生成报告..." : "交卷并生成弱点报告 →"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {report ? (
        <section ref={reportSectionRef} className="panel section-block exam-report">
          <div className="eyebrow">weakness report</div>
          <div className="split-row" style={{ alignItems: "start" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: "clamp(30px, 5vw, 46px)" }}>这套模考已经出分了</h2>
              <p className="helper-copy muted">{report.masterySummary}</p>
            </div>
            <div className="page-actions">
              {report.weakestPoints[0] ? (
                <Link className="button button--danger" href={buildPracticeHref(report.weakestPoints[0].knowledgePoint)}>
                  先补最弱考点 →
                </Link>
              ) : null}
              <button className="button" type="button" onClick={handleGenerate} disabled={generating}>
                再来一套模考
              </button>
            </div>
          </div>

          <div className="metric-grid">
            <div className="metric-card">
              <div className="eyebrow">score</div>
              <strong>
                {report.earnedScore} / {report.totalScore}
              </strong>
              <span className="muted">本次得分</span>
            </div>
            <div className="metric-card">
              <div className="eyebrow">accuracy</div>
              <strong>{toPercent(report.accuracyRate)}</strong>
              <span className="muted">整卷正确率</span>
            </div>
            <div className="metric-card">
              <div className="eyebrow">correct count</div>
              <strong>
                {report.correctCount} / {report.totalQuestions}
              </strong>
              <span className="muted">题目答对数</span>
            </div>
          </div>

          <div className="exam-report-grid">
            <div className="panel" style={{ padding: 20, display: "grid", gap: 12 }}>
              <div className="eyebrow">priority weaknesses</div>
              {report.weakestPoints.length > 0 ? (
                report.weakestPoints.map((item) => (
                  <div key={item.knowledgePoint} className="selection-preview selection-preview--compact">
                    <strong>
                      {item.subject} · {item.knowledgePoint}
                    </strong>
                    <span className="muted">
                      失分 {item.wrongCount} 次 · {item.questionTypes.map((type) => QUESTION_TYPE_LABEL[type]).join(" / ")}
                    </span>
                    <span>{item.recommendation}</span>
                  </div>
                ))
              ) : (
                <div className="status-box">这套卷子没有形成明显弱点，可以直接切到下一套更综合的模考。</div>
              )}
            </div>

            <div className="panel" style={{ padding: 20, display: "grid", gap: 12 }}>
              <div className="eyebrow">question review</div>
              {report.results.map((item, index) => (
                <div key={item.sessionId} className="selection-preview selection-preview--compact">
                  <strong>
                    第 {index + 1} 题 · {QUESTION_TYPE_LABEL[item.questionType]}
                  </strong>
                  <span className="muted">
                    {item.correct ? "答对" : "失分"} · {item.scoreEarned} / {item.scorePossible} 分
                  </span>
                  {item.aiReview ? (
                    <div className="feedback-summary-grid">
                      <div className="feedback-summary-card">
                        <span>AI 判卷结论</span>
                        <strong>{item.aiReview.feedback}</strong>
                      </div>
                      <div className="feedback-summary-card">
                        <span>已经写到位</span>
                        <strong>
                          {item.aiReview.strengths.length > 0 ? item.aiReview.strengths.join("；") : "主线方向基本对上了。"}
                        </strong>
                      </div>
                      <div className="feedback-summary-card">
                        <span>下一步优先补</span>
                        <strong>
                          {item.aiReview.improvements.length > 0
                            ? item.aiReview.improvements.join("；")
                            : "继续按参考口径把关键步骤写完整。"}
                        </strong>
                      </div>
                    </div>
                  ) : null}
                  <span>{item.analysis}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
