import type { AnswerAnalysisItem, ObjectiveAnswer, QuestionPayload } from "@/lib/types";

const OPTION_KEYS: ObjectiveAnswer[] = ["A", "B", "C", "D"];

function getOptions(question: QuestionPayload) {
  if (question.options) {
    return question.options;
  }

  if (question.type === "judge") {
    return { A: "正确", B: "错误" };
  }

  return null;
}

function getCorrectOptionKeys(answer: QuestionPayload["answer"]) {
  if (typeof answer === "boolean") {
    return [answer ? "A" : "B"];
  }

  if (typeof answer === "string") {
    return OPTION_KEYS.includes(answer as ObjectiveAnswer) ? [answer] : [];
  }

  if (Array.isArray(answer)) {
    return answer.filter((item) => OPTION_KEYS.includes(item));
  }

  return [];
}

function getSelectedOptionKeys(selectedAnswer?: string | null) {
  return (selectedAnswer ?? "")
    .split(/[,，、\s]+/)
    .map((item) => item.trim().toUpperCase())
    .filter((item) => OPTION_KEYS.includes(item as ObjectiveAnswer));
}

function compactAnalysis(analysis: string) {
  const normalized = analysis.replace(/\s+/g, " ").trim();

  if (
    !normalized ||
    /重点追打|用户在|下一题必须|薄弱点提示|请围绕/.test(normalized)
  ) {
    return "请回到题干条件和对应考点口径，判断该选项是否满足题意。";
  }

  return normalized.length > 220 ? `${normalized.slice(0, 220).trimEnd()}...` : normalized;
}

export function buildAnswerAnalysis(params: {
  question: QuestionPayload;
  selectedAnswer?: string | null;
  analysis: string;
}): AnswerAnalysisItem[] {
  const options = getOptions(params.question);

  if (!options) {
    return [];
  }

  const correctKeys = new Set(getCorrectOptionKeys(params.question.answer));
  const selectedKeys = new Set(getSelectedOptionKeys(params.selectedAnswer));
  const reason = compactAnalysis(params.analysis);

  return Object.entries(options)
    .filter(([key, value]) => OPTION_KEYS.includes(key as ObjectiveAnswer) && Boolean(value))
    .map(([optionKey, optionText]) => {
      const isCorrect = correctKeys.has(optionKey);
      const isSelected = selectedKeys.has(optionKey);

      return {
        optionKey,
        optionText: optionText ?? "",
        isCorrect,
        isSelected,
        explanation: isCorrect
          ? `该选项符合题干条件和考点口径。原因：${reason}`
          : isSelected
            ? `该选项不是正确答案，你本次选择了它。需要对照正确选项的判断口径：${reason}`
            : "该选项不符合本题要求，排除时重点回到题干条件、准则口径或计算步骤。"
      };
    });
}
