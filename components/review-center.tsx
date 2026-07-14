"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import type { DifficultyLevel, QuestionType, WrongReviewItem } from "@/lib/types";

const SORT_OPTIONS = [
  { value: "priority", label: "按优先级" },
  { value: "mistakes", label: "按错题次数" },
  { value: "recent", label: "按最近练习" }
] as const;

const TYPE_LABELS: Record<QuestionType, string> = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题",
  calculation: "计算分析",
  comprehensive: "综合题"
};

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy: "基础",
  medium: "进阶",
  hard: "冲刺"
};

function getPracticeHref(item: WrongReviewItem) {
  return `/practice?focus=outline&knowledge=${encodeURIComponent(item.knowledgePoint)}&type=${item.questionType}&difficulty=${item.difficulty}&mode=review` as Route;
}

function formatDate(value: string | null) {
  if (!value) {
    return "暂无";
  }

  return new Date(value).toLocaleDateString("zh-CN");
}

export function ReviewCenter({ items }: { items: WrongReviewItem[] }) {
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<QuestionType | "all">("all");
  const [sortBy, setSortBy] = useState<(typeof SORT_OPTIONS)[number]["value"]>("priority");

  const subjects = useMemo(() => [...new Set(items.map((item) => item.subject))], [items]);

  const filteredItems = useMemo(() => {
    const scoped = items.filter(
      (item) =>
        (subjectFilter === "all" || item.subject === subjectFilter) &&
        (typeFilter === "all" || item.questionType === typeFilter)
    );

    return [...scoped].sort((left, right) => {
      if (sortBy === "mistakes") {
        return right.wrongCount - left.wrongCount || right.priorityScore - left.priorityScore;
      }

      if (sortBy === "recent") {
        return (right.lastPracticedAt ?? "").localeCompare(left.lastPracticedAt ?? "");
      }

      return right.priorityScore - left.priorityScore || right.wrongCount - left.wrongCount;
    });
  }, [items, sortBy, subjectFilter, typeFilter]);

  const urgentCount = filteredItems.filter((item) => item.priorityLabel === "高优先").length;
  const primaryItem = filteredItems[0] ?? null;

  if (items.length === 0) {
    return (
      <section className="panel section-block">
        <div className="danger-box">当前还没有错题记录。先完成几题练习，系统就会在这里整理你的待巩固清单。</div>
      </section>
    );
  }

  return (
    <>
      <section className="panel section-block">
        <div className="split-row">
          <div style={{ display: "grid", gap: 8 }}>
            <div className="eyebrow">priority review</div>
            <h1 style={{ margin: 0, fontSize: "clamp(34px, 6vw, 56px)" }}>错题巩固清单</h1>
            <p className="helper-copy muted">
              优先从最近还在反复失分、或者累计错题次数更高的知识点开始。你可以按科目、题型和排序方式切换，但默认已经帮你排好了最急的一批。
            </p>
          </div>
          <div className="page-actions">
            {primaryItem ? (
              <Link className="button button--danger" href={getPracticeHref(primaryItem)}>
                从最急的开始
              </Link>
            ) : null}
            <Link className="button" href="/stats">
              查看学习数据
            </Link>
          </div>
        </div>

        <div className="review-summary-grid">
          <div className="metric-card">
            <div className="eyebrow">active items</div>
            <strong>{filteredItems.length}</strong>
            <span className="muted">当前筛选结果</span>
          </div>
          <div className="metric-card">
            <div className="eyebrow">high priority</div>
            <strong>{urgentCount}</strong>
            <span className="muted">建议优先处理</span>
          </div>
          <div className="metric-card">
            <div className="eyebrow">subjects</div>
            <strong>{new Set(filteredItems.map((item) => item.subject)).size}</strong>
            <span className="muted">涉及科目数量</span>
          </div>
        </div>

        <div className="review-toolbar">
          <div className="review-toolbar__group">
            <span className="eyebrow">subject</span>
            <div className="choice-grid">
              <button
                type="button"
                className={`choice-chip${subjectFilter === "all" ? " choice-chip--selected" : ""}`}
                onClick={() => setSubjectFilter("all")}
              >
                <span>全部科目</span>
                {subjectFilter === "all" ? <span className="choice-chip__check">✓</span> : null}
              </button>
              {subjects.map((subject) => (
                <button
                  key={subject}
                  type="button"
                  className={`choice-chip${subjectFilter === subject ? " choice-chip--selected" : ""}`}
                  onClick={() => setSubjectFilter(subject)}
                >
                  <span>{subject}</span>
                  {subjectFilter === subject ? <span className="choice-chip__check">✓</span> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="review-toolbar__group">
            <span className="eyebrow">question type</span>
            <div className="choice-grid">
              <button
                type="button"
                className={`choice-chip${typeFilter === "all" ? " choice-chip--selected" : ""}`}
                onClick={() => setTypeFilter("all")}
              >
                <span>全部题型</span>
                {typeFilter === "all" ? <span className="choice-chip__check">✓</span> : null}
              </button>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`choice-chip${typeFilter === value ? " choice-chip--selected" : ""}`}
                  onClick={() => setTypeFilter(value as QuestionType)}
                >
                  <span>{label}</span>
                  {typeFilter === value ? <span className="choice-chip__check">✓</span> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="review-toolbar__group">
            <span className="eyebrow">sort</span>
            <div className="choice-grid">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`choice-chip${sortBy === option.value ? " choice-chip--selected" : ""}`}
                  onClick={() => setSortBy(option.value)}
                >
                  <span>{option.label}</span>
                  {sortBy === option.value ? <span className="choice-chip__check">✓</span> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {filteredItems.length === 0 ? (
        <section className="panel section-block">
          <div className="status-box">当前筛选条件下还没有待巩固项。你可以放宽条件，或者先回去做一轮新题。</div>
        </section>
      ) : (
        <section className="review-list">
          {filteredItems.map((item, index) => (
            <article key={item.id} className="panel section-block focus-card">
              <div className="split-row">
                <div className="focus-card__intro">
                  <div className="eyebrow">
                    #{index + 1} · {item.subject}
                  </div>
                  <h2 style={{ margin: 0, fontSize: 26 }}>{item.knowledgePoint}</h2>
                </div>
                <span
                  className={`review-priority-badge${
                    item.priorityLabel === "高优先" ? " review-priority-badge--high" : ""
                  }`}
                >
                  {item.priorityLabel}
                </span>
              </div>

              <div className="question-badges">
                <span className="question-badge">{TYPE_LABELS[item.questionType]}</span>
                <span className="question-badge">{DIFFICULTY_LABELS[item.difficulty]}</span>
                <span className="question-badge">{item.wrongCount} 次错题</span>
              </div>

              <div className="metric-grid">
                <div className="metric-card">
                  <div className="eyebrow">mistakes</div>
                  <strong>{item.wrongCount}</strong>
                  <span className="muted">累计错题次数</span>
                </div>
                <div className="metric-card">
                  <div className="eyebrow">last practice</div>
                  <strong style={{ fontSize: 20 }}>{formatDate(item.lastPracticedAt)}</strong>
                  <span className="muted">最近练习时间</span>
                </div>
                <div className="metric-card">
                  <div className="eyebrow">review cue</div>
                  <strong style={{ fontSize: 20 }}>{item.priorityLabel}</strong>
                  <span className="muted">当前建议处理顺位</span>
                </div>
              </div>

              <div className="danger-box">{item.promptHint}</div>

              <div className="page-actions">
                <Link className="button button--danger" href={getPracticeHref(item)}>
                  直接强化这一项
                </Link>
                <Link className="button" href={`/practice?focus=outline&knowledge=${encodeURIComponent(item.knowledgePoint)}`}>
                  先锁定到这个考点
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
