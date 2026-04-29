"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  GenerateQuestionResponse,
  QuestionPayload,
  SubmitAnswerResponse
} from "@/lib/types";

export function PracticeShell({
  initialPlan,
  initialRemaining
}: {
  initialPlan: "free" | "pro";
  initialRemaining: number | null;
}) {
  const router = useRouter();
  const [knowledgePoint, setKnowledgePoint] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [question, setQuestion] = useState<QuestionPayload | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<"A" | "B" | "C" | "D" | "">("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<SubmitAnswerResponse | null>(null);
  const [remaining, setRemaining] = useState<number | null>(initialRemaining);
  const [plan] = useState(initialPlan);
  const [chaseMode, setChaseMode] = useState(false);
  const [lastWrongReason, setLastWrongReason] = useState("");
  const [error, setError] = useState("");

  async function handleGenerate(nextChaseMode = false) {
    if (!knowledgePoint.trim()) {
      setError("先输入一个会计知识点，再开始挨打。");
      return;
    }

    setLoading(true);
    setError("");
    setFeedback(null);
    setSelectedAnswer("");

    const response = await fetch("/api/generate-question", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        knowledgePoint,
        chaseMode: nextChaseMode,
        lastWrongReason
      })
    });

    setLoading(false);

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
    router.refresh();
  }

  async function handleSubmitAnswer() {
    if (!sessionId || !question || !selectedAnswer) {
      setError("先选答案，再提交。");
      return;
    }

    setLoading(true);
    setError("");

    const response = await fetch("/api/submit-answer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sessionId,
        selectedAnswer
      })
    });

    setLoading(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "提交失败。");
      return;
    }

    const data = (await response.json()) as SubmitAnswerResponse;
    setFeedback(data);
    setLastWrongReason(data.nextPromptHint);
    setChaseMode(data.shouldChase);
  }

  return (
    <div
      className="shell"
      style={{
        padding: "40px 0 80px",
        display: "grid",
        gap: 24
      }}
    >
      <section
        className="panel"
        style={{
          padding: 28,
          display: "grid",
          gap: 16
        }}
      >
        <div className="eyebrow">practice mode</div>
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <h1 style={{ margin: 0, fontSize: "clamp(28px, 5vw, 48px)" }}>
            错了，就继续追杀同一个知识点
          </h1>
          <div className="danger-box">
            当前套餐：{plan === "pro" ? "Pro 无限练" : `免费版 / 今日剩余 ${remaining ?? 0} 次出题`}
          </div>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          免费用户每天只有 2 次生成机会，追杀变式题同样计次。
        </p>
        <input
          className="input"
          placeholder="例如：存货跌价准备、收入确认五步法、固定资产折旧"
          value={knowledgePoint}
          onChange={(event) => setKnowledgePoint(event.target.value)}
        />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="button button--danger" onClick={() => handleGenerate(false)} disabled={loading}>
            {loading ? "AI 正在出题..." : "开始第一轮追杀"}
          </button>
          <button className="button" onClick={() => handleGenerate(true)} disabled={loading || !feedback?.shouldChase}>
            继续变式追杀
          </button>
        </div>
        {error ? <div className="danger-box">{error}</div> : null}
      </section>

      {question ? (
        <section className="panel" style={{ padding: 28, display: "grid", gap: 18 }}>
          <div className="eyebrow">{chaseMode ? "chase mode active" : "standard mode"}</div>
          <h2 style={{ margin: 0, fontSize: 28 }}>{question.question}</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {(["A", "B", "C", "D"] as const).map((optionKey) => (
              <button
                key={optionKey}
                className="button"
                onClick={() => setSelectedAnswer(optionKey)}
                style={{
                  textAlign: "left",
                  background:
                    selectedAnswer === optionKey ? "rgba(255,77,45,0.18)" : undefined,
                  borderColor:
                    selectedAnswer === optionKey ? "rgba(255,77,45,0.7)" : undefined
                }}
              >
                {optionKey}. {question.options[optionKey]}
              </button>
            ))}
          </div>
          <button className="button button--danger" onClick={handleSubmitAnswer} disabled={loading}>
            提交答案
          </button>
        </section>
      ) : null}

      {feedback ? (
        <section className="panel" style={{ padding: 28, display: "grid", gap: 12 }}>
          <div
            style={{
              color: feedback.correct ? "var(--success)" : "var(--danger)",
              fontWeight: 800,
              fontSize: 24
            }}
          >
            {feedback.correct ? "这次活下来了。" : "答错。追杀继续。"}
          </div>
          <div>正确答案：{feedback.correctAnswer}</div>
          <div className="muted">{feedback.analysis}</div>
          {!feedback.correct ? (
            <div className="danger-box">
              AI 下一轮会专门追打这个弱点：{feedback.nextPromptHint}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
