import type { Route } from "next";
import type {
  StudyPlanTask,
  StudyPlanTaskContext,
  StudyPlanTodayProgress,
  UserStudyPlanRecord
} from "@/lib/types";

export function buildPracticeHrefFromTask(params: {
  knowledgePoint: string;
  questionType: string;
  difficulty: string;
  practiceMode: string;
  taskIndex?: number;
}) {
  return {
    pathname: "/practice" as Route,
    query: {
      focus: "outline",
      knowledge: params.knowledgePoint,
      type: params.questionType,
      difficulty: params.difficulty,
      mode: params.practiceMode,
      ...(typeof params.taskIndex === "number" ? { task: String(params.taskIndex) } : {})
    }
  };
}

export function getStudyPlanCompletionRatio(progress: StudyPlanTodayProgress | null) {
  if (!progress || progress.totalQuestions <= 0) {
    return 0;
  }

  return progress.completedQuestions / progress.totalQuestions;
}

export function getNextStudyPlanTask(
  plan: UserStudyPlanRecord | null,
  progress: StudyPlanTodayProgress | null
): { task: StudyPlanTask; index: number } | null {
  if (!plan || plan.plan_payload.todayTasks.length === 0) {
    return null;
  }

  if (!progress) {
    return {
      task: plan.plan_payload.todayTasks[0],
      index: 0
    };
  }

  const nextTaskIndex = progress.tasks.findIndex((task) => !task.completed);

  if (nextTaskIndex === -1) {
    return null;
  }

  return {
    task: plan.plan_payload.todayTasks[nextTaskIndex],
    index: nextTaskIndex
  };
}

export function getStudyPlanTaskContext(
  plan: UserStudyPlanRecord | null,
  progress: StudyPlanTodayProgress | null,
  index: number
): StudyPlanTaskContext | null {
  if (!plan || index < 0 || index >= plan.plan_payload.todayTasks.length) {
    return null;
  }

  const task = plan.plan_payload.todayTasks[index];
  const taskProgress = progress?.tasks[index];

  return {
    index,
    title: task.title,
    subject: task.subject,
    knowledgePoint: task.knowledgePoint,
    questionType: task.questionType,
    difficulty: task.difficulty,
    practiceMode: task.practiceMode,
    count: task.count,
    estimatedMinutes: task.estimatedMinutes,
    completed: taskProgress?.completed ?? false,
    completedQuestions: taskProgress?.completedQuestions ?? 0,
    targetQuestions: taskProgress?.targetQuestions ?? task.count,
    correctCount: taskProgress?.correctCount ?? 0
  };
}

export function getNextStudyPlanTaskContext(
  plan: UserStudyPlanRecord | null,
  progress: StudyPlanTodayProgress | null
) {
  const nextTask = getNextStudyPlanTask(plan, progress);

  if (!nextTask) {
    return null;
  }

  return getStudyPlanTaskContext(plan, progress, nextTask.index);
}

export function findStudyPlanTaskContext(
  plan: UserStudyPlanRecord | null,
  progress: StudyPlanTodayProgress | null,
  params: {
    taskIndex?: number | null;
    knowledgePoint?: string;
    questionType?: string;
    difficulty?: string;
    practiceMode?: string;
  }
) {
  if (!plan) {
    return null;
  }

  if (typeof params.taskIndex === "number") {
    return getStudyPlanTaskContext(plan, progress, params.taskIndex);
  }

  const taskIndex = plan.plan_payload.todayTasks.findIndex(
    (task) =>
      (!params.knowledgePoint || task.knowledgePoint === params.knowledgePoint) &&
      (!params.questionType || task.questionType === params.questionType) &&
      (!params.difficulty || task.difficulty === params.difficulty) &&
      (!params.practiceMode || task.practiceMode === params.practiceMode)
  );

  if (taskIndex === -1) {
    return null;
  }

  return getStudyPlanTaskContext(plan, progress, taskIndex);
}
