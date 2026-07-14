"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SUBJECT_CATALOG } from "@/lib/knowledge-catalog";
import {
  buildPracticeHrefFromTask,
  getNextStudyPlanTask,
  getStudyPlanCompletionRatio
} from "@/lib/study-plan-utils";
import { cn } from "@/lib/utils";
import type {
  GenerateStudyPlanResponse,
  QuestionType,
  StudyPlanInput,
  StudyPlanTodayProgress,
  StudyStyle,
  UserKnowledgeSnapshot,
  UserStudyPlanRecord
} from "@/lib/types";

const STUDY_STYLE_OPTIONS: Array<{ value: StudyStyle; label: string; desc: string }> = [
  {
    value: "mistake-first",
    label: "错题优先",
    desc: "默认先追最不稳的知识点。"
  },
  {
    value: "short-bursts",
    label: "高频短练",
    desc: "更适合工作日碎片时间推进。"
  },
  {
    value: "weekend-intensive",
    label: "周末集中",
    desc: "把更多题量放在周末完成。"
  }
];

const TARGET_SCORE_OPTIONS = [70, 75, 80, 85, 90];
const DAILY_MINUTES_OPTIONS = [20, 30, 45, 60, 90];

function questionTypeLabel(type: QuestionType) {
  const mapping: Record<QuestionType, string> = {
    single: "单选题",
    multiple: "多选题",
    judge: "判断题",
    calculation: "计算分析",
    comprehensive: "综合题"
  };

  return mapping[type];
}

function difficultyLabel(value: string) {
  const mapping: Record<string, string> = {
    easy: "基础",
    medium: "进阶",
    hard: "冲刺"
  };

  return mapping[value] ?? value;
}

function practiceModeLabel(value: string) {
  const mapping: Record<string, string> = {
    daily: "日常练习",
    chase: "错题强化",
    review: "专项巩固",
    "mock-exam": "模拟考试"
  };

  return mapping[value] ?? value;
}

function styleLabel(style: StudyStyle) {
  return STUDY_STYLE_OPTIONS.find((item) => item.value === style)?.label ?? style;
}

function createEmptyTodayProgress(plan: UserStudyPlanRecord | null): StudyPlanTodayProgress | null {
  if (!plan) {
    return null;
  }

  const tasks = plan.plan_payload.todayTasks.map((task, index) => ({
    taskIndex: index,
    completedQuestions: 0,
    targetQuestions: task.count,
    completed: false,
    correctCount: 0,
    lastPracticedAt: null
  }));

  return {
    totalTasks: tasks.length,
    completedTasks: 0,
    startedTasks: 0,
    totalQuestions: tasks.reduce((sum, task) => sum + task.targetQuestions, 0),
    completedQuestions: 0,
    correctQuestions: 0,
    tasks
  };
}

export function StudyPlanShell({
  initialPlan,
  initialTodayProgress,
  initialSuggestedSubjects,
  initialSuggestedTopics,
  initialWeakestKnowledge
}: {
  initialPlan: UserStudyPlanRecord | null;
  initialTodayProgress: StudyPlanTodayProgress | null;
  initialSuggestedSubjects: string[];
  initialSuggestedTopics: string[];
  initialWeakestKnowledge: UserKnowledgeSnapshot[];
}) {
  const defaultSubjects = initialPlan?.selected_subjects?.length
    ? initialPlan.selected_subjects
    : initialSuggestedSubjects.length > 0
      ? initialSuggestedSubjects
      : [SUBJECT_CATALOG[0]?.subject ?? "中级会计实务"];
  const defaultTopics = initialPlan?.selected_topics?.length
    ? initialPlan.selected_topics
    : initialSuggestedTopics.slice(0, 3);
  const [targetScore, setTargetScore] = useState(initialPlan?.target_score ?? 85);
  const [daysToExam, setDaysToExam] = useState(initialPlan?.days_to_exam ?? 68);
  const [dailyMinutes, setDailyMinutes] = useState(initialPlan?.daily_minutes ?? 45);
  const [studyStyle, setStudyStyle] = useState<StudyStyle>(initialPlan?.study_style ?? "mistake-first");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(defaultSubjects.slice(0, 3));
  const [selectedTopics, setSelectedTopics] = useState<string[]>(defaultTopics.slice(0, 6));
  const [planRecord, setPlanRecord] = useState<UserStudyPlanRecord | null>(initialPlan);
  const [todayProgress, setTodayProgress] = useState<StudyPlanTodayProgress | null>(initialTodayProgress);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const topicCandidates = useMemo(() => {
    const subjectTopics = selectedSubjects.flatMap((subject) => SUBJECT_CATALOG.find((item) => item.subject === subject)?.topics ?? []);
    const priorityTopics = [
      ...initialSuggestedTopics,
      ...initialWeakestKnowledge.map((item) => item.knowledgePoint),
      ...subjectTopics
    ];

    return [...new Set(priorityTopics.filter(Boolean))].slice(0, 18);
  }, [initialSuggestedTopics, initialWeakestKnowledge, selectedSubjects]);

  const currentPlan = planRecord?.plan_payload ?? null;

  function toggleSubject(subject: string) {
    setError("");
    setSelectedSubjects((current) => {
      if (current.includes(subject)) {
        return current.filter((item) => item !== subject);
      }

      if (current.length >= 3) {
        return [...current.slice(1), subject];
      }

      return [...current, subject];
    });
  }

  function toggleTopic(topic: string) {
    setError("");
    setSelectedTopics((current) => {
      if (current.includes(topic)) {
        return current.filter((item) => item !== topic);
      }

      if (current.length >= 6) {
        return [...current.slice(1), topic];
      }

      return [...current, topic];
    });
  }

  async function handleGeneratePlan() {
    setLoading(true);
    setError("");

    const payload: StudyPlanInput = {
      targetExam: "中级会计师",
      targetScore,
      daysToExam,
      dailyMinutes,
      studyStyle,
      selectedSubjects,
      selectedTopics
    };

    try {
      const response = await fetch("/api/study-plan/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = (await response.json()) as GenerateStudyPlanResponse & { error?: string };

      if (!response.ok || !data.plan) {
        throw new Error(data.error ?? "生成练题计划失败，请稍后重试。");
      }

      setPlanRecord(data.plan);
      setTodayProgress(createEmptyTodayProgress(data.plan));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "生成练题计划失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  const currentProgress =
    todayProgress && currentPlan ? todayProgress : createEmptyTodayProgress(planRecord);
  const completionRatio = getStudyPlanCompletionRatio(currentProgress);
  const nextTask = getNextStudyPlanTask(planRecord, currentProgress);
  const planTaskItems = currentPlan
    ? currentPlan.todayTasks
        .map((task, index) => {
          const taskProgress = currentProgress?.tasks[index];
          const taskStatus = taskProgress?.completed
            ? "已完成"
            : (taskProgress?.completedQuestions ?? 0) > 0
              ? "进行中"
              : "待开始";
          const isNextTask = nextTask?.index === index;
          const priority = taskProgress?.completed ? 3 : isNextTask ? 0 : taskProgress?.completedQuestions ? 1 : 2;

          return {
            index,
            task,
            taskProgress,
            taskStatus,
            isNextTask,
            priority
          };
        })
        .sort((left, right) => left.priority - right.priority || left.index - right.index)
    : [];
  const completedTaskCount = currentProgress?.completedTasks ?? 0;
  const startedTaskCount = currentProgress?.startedTasks ?? 0;
  const inProgressTaskCount = Math.max(startedTaskCount - completedTaskCount, 0);
  const pendingTaskCount = Math.max((currentProgress?.totalTasks ?? 0) - startedTaskCount, 0);

  return (
    <main className="shell" style={{ padding: "40px 0 96px", display: "grid", gap: 24 }}>
      <section className="plan-hero-grid">
        <div className="panel section-block">
          <div className="eyebrow">ai custom study plan</div>
          <div className="plan-hero-copy">
            <h1 style={{ margin: 0, fontSize: "clamp(34px, 6vw, 56px)" }}>你的 AI 定制练题计划</h1>
            <p className="helper-copy muted">
              告诉系统你的目标分数、剩余天数、每天能投入多久，以及当前最想优先补的科目或考点，AI 会帮你自动排一份可执行的练题路线。
            </p>
          </div>

          <div className="metric-grid">
            <div className="metric-card">
              <div className="eyebrow">days left</div>
              <strong>{daysToExam}</strong>
              <span className="muted">距考试还有天数</span>
            </div>
            <div className="metric-card">
              <div className="eyebrow">daily time</div>
              <strong>{dailyMinutes} 分钟</strong>
              <span className="muted">每日计划时长</span>
            </div>
            <div className="metric-card">
              <div className="eyebrow">study style</div>
              <strong>{styleLabel(studyStyle)}</strong>
              <span className="muted">当前练习节奏偏好</span>
            </div>
          </div>

          <div className="plan-builder-grid">
            <div className="plan-form-stack">
              <div className="practice-config-group">
                <div className="practice-config-group__label">目标分数</div>
                <div className="choice-grid">
                  {TARGET_SCORE_OPTIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={cn("choice-chip", targetScore === item && "choice-chip--selected")}
                      onClick={() => setTargetScore(item)}
                    >
                      <span>{item}+</span>
                      <span className="choice-chip__check">{targetScore === item ? "✓" : ""}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="practice-selection-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                <label className="outline-panel__field">
                  <span className="practice-config-group__label">距离考试</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={365}
                    value={daysToExam}
                    onChange={(event) => setDaysToExam(Math.max(1, Number(event.target.value) || 1))}
                  />
                </label>
                <div className="outline-panel__field">
                  <span className="practice-config-group__label">每天练习时长</span>
                  <div className="choice-grid">
                    {DAILY_MINUTES_OPTIONS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={cn("choice-chip", dailyMinutes === item && "choice-chip--selected")}
                        onClick={() => setDailyMinutes(item)}
                      >
                        <span>{item} 分钟</span>
                        <span className="choice-chip__check">{dailyMinutes === item ? "✓" : ""}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="practice-config-group">
                <div className="practice-config-group__label">学习风格</div>
                <div className="choice-grid">
                  {STUDY_STYLE_OPTIONS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={cn("choice-chip", studyStyle === item.value && "choice-chip--selected")}
                      onClick={() => setStudyStyle(item.value)}
                    >
                      <span style={{ display: "grid", gap: 4, textAlign: "left" }}>
                        <strong>{item.label}</strong>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {item.desc}
                        </span>
                      </span>
                      <span className="choice-chip__check">{studyStyle === item.value ? "✓" : ""}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="practice-config-group">
                <div className="practice-config-group__label">优先科目</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  最多选择 3 个，也可以全部清空，让 AI 只根据你的错题和表现自动排计划。
                </div>
                <div className="choice-grid">
                  {SUBJECT_CATALOG.map((item) => (
                    <button
                      key={item.subject}
                      type="button"
                      className={cn("choice-chip", selectedSubjects.includes(item.subject) && "choice-chip--selected")}
                      onClick={() => toggleSubject(item.subject)}
                    >
                      <span>{item.subject}</span>
                      <span className="choice-chip__check">
                        {selectedSubjects.includes(item.subject) ? "✓" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="practice-config-group">
                <div className="practice-config-group__label">想优先补的考点</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  最多选择 6 个。没有特别想先补的，也可以留空，让系统优先围绕当前薄弱点排任务。
                </div>
                <div className="quick-picks quick-picks--matrix quick-picks--light">
                  {topicCandidates.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      className={cn(
                        "button button--ghost quick-pick-button",
                        selectedTopics.includes(topic) && "quick-pick-button--active"
                      )}
                      onClick={() => toggleTopic(topic)}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>

              <div className="page-actions">
                <button className="button button--danger" onClick={handleGeneratePlan} disabled={loading}>
                  {loading ? "AI 正在生成计划..." : "生成我的专属计划 →"}
                </button>
                <Link className="button" href="/practice">
                  先直接去练题
                </Link>
              </div>

              {loading ? (
                <div className="status-box">
                  AI 正在根据你新的目标分数、练习节奏和当前薄弱点重排计划，通常约 10-15 秒。
                </div>
              ) : null}
              {error ? <div className="danger-box">{error}</div> : null}
            </div>

            <div className="plan-preview-stack">
              {currentPlan ? (
                <div className="panel selection-preview">
                  <div className="eyebrow">today progress</div>
                  <strong>
                    已完成 {currentProgress?.completedQuestions ?? 0} / {currentProgress?.totalQuestions ?? 0} 题 ·{" "}
                    {currentProgress?.completedTasks ?? 0} / {currentProgress?.totalTasks ?? 0} 个任务达标
                  </strong>
                  <span className="muted">
                    {nextTask
                      ? `下一项：${nextTask.task.subject} · ${nextTask.task.knowledgePoint}`
                      : "今天这份计划已经全部完成，可以继续错题强化，或者按新的节奏重排下一版计划。"}
                  </span>
                  <div className="plan-progress-block">
                    <div className="progress-track">
                      <div className="progress-bar" style={{ width: `${Math.round(completionRatio * 100)}%` }} />
                    </div>
                    <div className="plan-progress-caption muted">
                      {nextTask
                        ? `${questionTypeLabel(nextTask.task.questionType)} · ${difficultyLabel(nextTask.task.difficulty)} · ${nextTask.task.estimatedMinutes} 分钟`
                        : "今天的任务已经收口，回到练习页可以继续自由强化或按大纲补点。"}
                    </div>
                  </div>
                  {nextTask ? (
                    <Link
                      className="button button--danger"
                      href={buildPracticeHrefFromTask({
                        knowledgePoint: nextTask.task.knowledgePoint,
                        questionType: nextTask.task.questionType,
                        difficulty: nextTask.task.difficulty,
                        practiceMode: nextTask.task.practiceMode,
                        taskIndex: nextTask.index
                      })}
                    >
                      继续今天任务 →
                    </Link>
                  ) : null}
                </div>
              ) : null}

              <div className="panel selection-preview">
                <div className="eyebrow">current setup</div>
                <strong>中级会计师 · 目标 {targetScore}+ 分</strong>
                <span className="muted">剩余 {daysToExam} 天 · 每天 {dailyMinutes} 分钟 · {styleLabel(studyStyle)}</span>
                <span className="muted">
                  重点科目：{selectedSubjects.join("、") || "AI 自动推荐"}；重点考点：{selectedTopics.slice(0, 3).join("、") || "先生成后确定"}
                </span>
              </div>

              <div className="panel selection-preview">
                <div className="eyebrow">ai 推荐原因</div>
                <strong>{initialWeakestKnowledge[0]?.knowledgePoint ?? "先建立你的首版练题计划"}</strong>
                <span className="muted">
                  {initialWeakestKnowledge.length > 0
                    ? `系统检测到你最近最不稳的是「${initialWeakestKnowledge[0].knowledgePoint}」，所以计划会优先围绕弱点和题型表现来排。`
                    : "你还没有太多做题记录，所以 AI 会先结合你的考试目标和时间分配出第一版节奏。"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="panel section-block plan-result-panel">
          <div className="eyebrow">latest plan</div>
          {currentPlan ? (
            <div style={{ display: "grid", gap: 18 }}>
              <div style={{ display: "grid", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 30 }}>{currentPlan.planName}</h2>
                <p className="helper-copy muted">{currentPlan.summary}</p>
              </div>
              <div className="danger-box">{currentPlan.strategy}</div>
              <div className="plan-phase-list">
                {currentPlan.phases.map((phase) => (
                  <article key={`${phase.name}-${phase.weeks}`} className="plan-phase-card">
                    <div className="split-row">
                      <strong>{phase.name}</strong>
                      <span className="muted">{phase.weeks}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 14 }}>
                      重点：{phase.focus.join("、")}
                    </div>
                    <div className="muted" style={{ fontSize: 14 }}>
                      题型：{phase.recommendedQuestionTypes.map(questionTypeLabel).join("、")} · 难度：{difficultyLabel(phase.recommendedDifficulty)}
                    </div>
                    <div>{phase.goal}</div>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="danger-box">生成后，这里会出现你的阶段计划、今日任务和每周练习节奏。</div>
          )}
        </div>
      </section>

      {currentPlan ? (
        <>
          <section className="plan-task-grid">
            <div className="panel section-block">
              <div className="eyebrow">today tasks</div>
              <div className="plan-task-header">
                <div style={{ display: "grid", gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 30 }}>今天先这样练</h2>
                  <p className="helper-copy muted" style={{ margin: 0 }}>
                    {currentProgress
                      ? `已完成 ${currentProgress.completedQuestions} / ${currentProgress.totalQuestions} 题，${currentProgress.completedTasks} / ${currentProgress.totalTasks} 个任务已达标。`
                      : "今天的任务会在你开始练习后自动更新完成进度。"}
                  </p>
                </div>
                {currentProgress ? (
                  <div className="plan-progress-summary">
                    <strong>{Math.round(completionRatio * 100)}%</strong>
                    <span className="muted">今日进度</span>
                  </div>
                ) : null}
              </div>
              {currentProgress ? (
                <div className="plan-progress-block">
                  <div className="progress-track">
                    <div className="progress-bar" style={{ width: `${Math.round(completionRatio * 100)}%` }} />
                  </div>
                  <div className="plan-progress-caption muted">
                    {currentProgress.startedTasks > 0
                      ? `今天已经启动了 ${currentProgress.startedTasks} 个任务，继续把当前节奏打满就好。`
                      : "今天还没开始第一轮练习，先点进第一项任务就能自动开始累计进度。"}
                  </div>
                </div>
              ) : null}
              {currentProgress ? (
                <div className="plan-task-overview">
                  <div className="plan-task-overview__item">
                    <strong>{completedTaskCount}</strong>
                    <span className="muted">已完成</span>
                  </div>
                  <div className="plan-task-overview__item">
                    <strong>{inProgressTaskCount}</strong>
                    <span className="muted">进行中</span>
                  </div>
                  <div className="plan-task-overview__item">
                    <strong>{pendingTaskCount}</strong>
                    <span className="muted">待开始</span>
                  </div>
                </div>
              ) : null}
              <div className="plan-task-list">
                {planTaskItems.map(({ index, task, taskProgress, taskStatus, isNextTask }) => {
                  return (
                  <article
                    key={`${task.title}-${task.knowledgePoint}`}
                    className={cn("plan-task-card", isNextTask && "plan-task-card--next")}
                  >
                    <div className="plan-task-card__header">
                      <div className="plan-task-card__marker" aria-hidden="true">
                        {taskProgress?.completed ? "✓" : index + 1}
                      </div>
                      <div className="plan-task-card__body">
                        <div className="split-row">
                          <strong>{task.title}</strong>
                          <div className="plan-task-meta">
                            {isNextTask ? <span className="site-status-badge site-status-badge--success">下一项</span> : null}
                            <span className={cn("site-status-badge", taskProgress?.completed && "site-status-badge--success")}>
                              {taskStatus}
                            </span>
                            <span className="site-status-badge">{task.estimatedMinutes} 分钟</span>
                          </div>
                        </div>
                        <div className="muted">
                          {task.subject} · {task.knowledgePoint}
                        </div>
                        <div className="muted">
                          {questionTypeLabel(task.questionType)} · {difficultyLabel(task.difficulty)} · {practiceModeLabel(task.practiceMode)} · {task.count} 题
                        </div>
                      </div>
                    </div>
                    {taskProgress ? (
                      <div className="plan-task-progress">
                        <div className="split-row" style={{ gap: 10 }}>
                          <span className="muted">
                            今日已做 {taskProgress.completedQuestions} / {taskProgress.targetQuestions} 题
                          </span>
                          <span className="muted">答对 {taskProgress.correctCount} 题</span>
                        </div>
                        <div className="progress-track">
                          <div
                            className="progress-bar"
                            style={{
                              width: `${Math.round(
                                (taskProgress.completedQuestions / Math.max(taskProgress.targetQuestions, 1)) * 100
                              )}%`
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                    {taskProgress?.completed ? (
                      <div className="status-box">这项今天已经达标了。如果你还想再巩固一轮，也可以继续补做变式题。</div>
                    ) : null}
                    <p style={{ margin: 0 }}>{task.reason}</p>
                    <Link
                      className={cn("button", isNextTask ? "button--danger" : "")}
                      href={buildPracticeHrefFromTask({
                        knowledgePoint: task.knowledgePoint,
                        questionType: task.questionType,
                        difficulty: task.difficulty,
                        practiceMode: task.practiceMode,
                        taskIndex: index
                      })}
                    >
                      {taskProgress?.completed ? "再练一轮巩固 →" : isNextTask ? "继续这一项 →" : "按这个任务开始练 →"}
                    </Link>
                  </article>
                  );
                })}
              </div>
            </div>

            <div className="panel section-block">
              <div className="eyebrow">ai adjustment hints</div>
              <h2 style={{ margin: 0, fontSize: 30 }}>AI 调整建议</h2>
              <div className="plan-adjustment-list">
                {currentPlan.adjustments.map((item) => (
                  <div key={item} className="danger-box">
                    {item}
                  </div>
                ))}
              </div>
              <div className="selection-preview selection-preview--compact">
                <div className="eyebrow">自由调整</div>
                <strong>如果你想保留 DIY 自由度，可以直接重生一版计划</strong>
                <span className="muted">调整节奏、减少题量或切换科目后，再点一次“生成我的专属计划”，AI 会按你的新偏好重排。</span>
              </div>
            </div>
          </section>

          <section className="panel section-block">
            <div className="eyebrow">weekly route</div>
            <h2 style={{ margin: 0, fontSize: "clamp(28px, 5vw, 42px)" }}>计划详情</h2>
            <p className="helper-copy muted">
              这不是死板课表，而是给你一个本周最值得执行的刷题节奏。你每做完一轮题，后续计划都可以继续重排。
            </p>
            <div className="plan-week-grid">
              {currentPlan.weeklySchedule.map((day) => (
                <article key={day.dayLabel} className="plan-week-card">
                  <div className="eyebrow">{day.dayLabel}</div>
                  <strong>{day.focus}</strong>
                  <div className="plan-week-list">
                    {day.tasks.map((task) => (
                      <span key={`${day.dayLabel}-${task}`} className="plan-week-pill">
                        {task}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
