"use client";

import { useEffect, useRef, useState } from "react";
import type { ExamChapter, ExamSubject } from "@/lib/exam-os-types";
import type { GenerateQuestionResponse, QuestionPayload, QuestionType, SubmitAnswerResponse } from "@/lib/types";

const typeOptions: Array<{ value: QuestionType; label: string }> = [{ value: "single", label: "单选题" }, { value: "multiple", label: "多选题" }, { value: "judge", label: "判断题" }, { value: "calculation", label: "计算分析" }, { value: "comprehensive", label: "综合题" }];

function answerText(answer: QuestionPayload["answer"]) { if (typeof answer === "boolean") return answer ? "正确" : "错误"; if (Array.isArray(answer)) return answer.join("、"); if (typeof answer === "string") return answer; return answer.sampleSolution; }
function timeText(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
type SubjectiveRequirement = { id: string; label: string; prompt: string };

function parseSubjectiveQuestion(question: string) {
  const materials: string[] = [];
  const requirements: SubjectiveRequirement[] = [];
  let requirementMode = false;

  for (const rawLine of question.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const requirementHeader = line.match(/^要求[:：]\s*(.*)$/);
    if (requirementHeader) {
      requirementMode = true;
      if (requirementHeader[1]) {
        requirements.push({ id: `requirement-${requirements.length + 1}`, label: "要求", prompt: requirementHeader[1] });
      }
      continue;
    }

    const numbered = line.match(/^[（(](\d+)[）)]\s*(.+)$/);
    if (numbered && (requirementMode || /^(?:根据|分别|计算|编制|判断|说明|确定|指出|回答|列示|分析)/.test(numbered[2]))) {
      requirements.push({ id: `requirement-${numbered[1]}`, label: `要求（${numbered[1]}）`, prompt: numbered[2] });
      continue;
    }

    materials.push(line);
  }

  if (requirements.length === 0) {
    requirements.push({ id: "requirement-1", label: "作答", prompt: "请根据题目要求写出完整过程与结论。" });
  }

  return { materials: materials.join("\n"), requirements };
}

function serializeSubjectiveAnswers(requirements: SubjectiveRequirement[], answers: Record<string, string>) {
  return requirements
    .map((item) => `${item.label} ${item.prompt}\n${answers[item.id]?.trim() || "未作答"}`)
    .join("\n\n");
}

function SubjectiveAnswerWorkspace({ question, answers, activeIndex, onActiveIndexChange, onAnswerChange }: { question: QuestionPayload; answers: Record<string, string>; activeIndex: number; onActiveIndexChange: (index: number) => void; onAnswerChange: (id: string, value: string) => void }) {
  const layout = parseSubjectiveQuestion(question.question);
  const active = layout.requirements[activeIndex] ?? layout.requirements[0];
  const value = answers[active.id] ?? "";
  const symbols = ["×", "÷", "%", "=", "（ ）", "借：\n贷："];

  function insertSymbol(symbol: string) {
    onAnswerChange(active.id, `${value}${value && !value.endsWith("\n") ? " " : ""}${symbol}`);
  }

  return <div className="mt-5 space-y-4">
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">题目资料</p><p className="mt-1 text-xs text-slate-500">资料区可独立滚动，作答时不用来回翻页</p></div><span className="rounded-full bg-white px-3 py-1 text-[11px] text-slate-500">共 {layout.requirements.length} 问</span></div>
      <div className="mt-3 max-h-[360px] resize-y overflow-auto whitespace-pre-wrap rounded-xl bg-white p-4 text-sm leading-7 text-slate-800">{layout.materials}</div>
    </section>
    <section className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
      <div className="flex gap-2 overflow-x-auto pb-2">{layout.requirements.map((item, index) => <button type="button" key={item.id} onClick={() => onActiveIndexChange(index)} className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold ${index === activeIndex ? "border-blue-600 bg-blue-600 text-white" : answers[item.id]?.trim() ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"}`}>{item.label}{answers[item.id]?.trim() ? " ✓" : ""}</button>)}</div>
      <div className="mt-3 rounded-xl bg-white p-4"><p className="text-xs font-semibold text-blue-600">{active.label}</p><p className="mt-2 text-sm font-semibold leading-7 text-slate-900">{active.prompt}</p></div>
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2"><span className="px-2 text-xs font-semibold text-slate-400">常用符号</span>{symbols.map((symbol) => <button type="button" key={symbol} onClick={() => insertSymbol(symbol)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50">{symbol.includes("借") ? "借/贷分录" : symbol}</button>)}</div>
      <textarea value={value} onChange={(event) => onAnswerChange(active.id, event.target.value)} rows={11} placeholder={question.type === "calculation" ? "建议按“公式 → 代入 → 结果”书写，金额单位按题干要求。" : "按本小问写依据、计算过程、会计分录或最终结论。"} className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400"><span>草稿自动保存在本机</span><span>{value.length} 字</span></div>
    </section>
  </div>;
}

function SubjectiveReviewCard({ question, feedback, userAnswer }: { question: QuestionPayload; feedback: SubmitAnswerResponse; userAnswer: string }) {
  const referenceAnswer = typeof question.answer === "object" && !Array.isArray(question.answer) ? question.answer.sampleSolution : answerText(question.answer);
  const extraAnalysis = question.analysis.trim() !== referenceAnswer.trim() ? question.analysis : "";
  const review = feedback.aiReview;
  const sourceDescription = question.source === "web" ? "来源网页原文" : "本地资料原文";

  return <div className="mt-4 space-y-4">
    {review ? <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-500">AI 判卷意见</p><span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${review.verdict === "correct" ? "bg-emerald-50 text-emerald-700" : review.verdict === "confused" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{review.verdict === "correct" ? "基本掌握" : review.verdict === "confused" ? "作答不完整" : "需要巩固"}</span></div><p className="mt-3 text-sm font-semibold leading-7 text-slate-900">{review.feedback}</p>{review.strengths.length ? <div className="mt-3 rounded-xl bg-white p-3"><p className="text-xs font-semibold text-emerald-600">已经写对</p><ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">{review.strengths.map((item) => <li key={item}>· {item}</li>)}</ul></div> : null}{review.improvements.length ? <div className="mt-3 rounded-xl bg-white p-3"><p className="text-xs font-semibold text-red-500">优先补齐</p><ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">{review.improvements.map((item) => <li key={item}>· {item}</li>)}</ul></div> : null}</section> : <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-800">AI 判卷暂未返回，请先按下方原题答案逐问核对。原答案不会被 AI 改写。</section>}
    <details className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">查看我的完整作答</summary><p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">{userAnswer}</p></details>
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">原题参考答案</p><p className="mt-1 text-xs text-slate-500">以下内容来自{sourceDescription}，未经过 AI 改写</p></div><span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-emerald-700">原文</span></div><p className="mt-4 whitespace-pre-wrap rounded-xl bg-white p-4 text-sm leading-7 text-slate-800">{referenceAnswer}</p></section>
    {extraAnalysis ? <details className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">查看原题完整解析</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{extraAnalysis}</p></details> : null}
  </div>;
}
const chapterInsights: Record<string, { focus: string; method: string; trap: string }> = {
  "财务分析与评价": { focus: "看清指标含义、计算口径和评价方向，先判断题目考的是偿债、营运、盈利、发展还是综合评价。", method: "遇到比率题先写公式，再看分子分母是否同口径；遇到评价题先判断指标升降代表好还是坏。", trap: "常见失分点是把指标方向记反、把时点数和时期数混用，或忽略题目要求的评价角度。" },
  "长期股权投资": { focus: "先判断控制、共同控制、重大影响或金融资产，再确定初始计量和后续核算方法。", method: "先定关系，再定方法；成本法看分红与减值，权益法看净损益、其他综合收益和资本公积。", trap: "常见失分点是把合并成本、初始投资成本和入账价值混在一起。" },
  "存货": { focus: "重点掌握存货确认、初始计量、可变现净值和跌价准备处理。", method: "先判断是否归属于存货成本，再看是否需要按成本与可变现净值孰低计量。", trap: "常见失分点是合理损耗、运输费、非正常损耗和跌价准备转回口径混淆。" },
  "合伙企业法律制度": { focus: "重点区分普通合伙人、有限合伙人资格和责任承担规则。", method: "先看主体能不能当普通合伙人，再看责任是无限连带还是以出资额为限。", trap: "常见失分点是上市公司、公益性单位等禁止成为普通合伙人的主体判断。" }
};
const metricInsights: Array<{ keyword: string; title: string; coreLabel: string; core: string; examPoint: string; steps: string[]; trap: string; memory: string; aliases?: string[] }> = [
  { keyword: "流动比率", title: "流动比率", coreLabel: "公式/口径", core: "流动比率 = 流动资产 / 流动负债；属于相关比率，也用于判断短期偿债能力。", examPoint: "本题考“比率类型归类”：流动资产和流动负债是两个不同但相互关联的项目，所以选相关比率。", steps: ["看到“属于哪类比率”，先看分子分母关系。", "流动资产和流动负债不是同一总体内部构成，也不是不同时期对比。", "锁定“相关比率”，排除构成比率、动态比率、效率比率。"], trap: "别只记流动比率是偿债指标；题目问“比率类型”时，答案看分子分母关系。", memory: "流动资产 ÷ 流动负债：不同项目有关联，所以是相关比率。" },
  { keyword: "速动比率", title: "速动比率", coreLabel: "公式/口径", core: "速动比率 = 速动资产 / 流动负债；速动资产通常剔除存货、预付账款等。", examPoint: "常考“某项业务是否影响速动资产”：现金、交易性金融资产、应收款项通常算速动资产。", steps: ["先剔除存货、预付账款等非速动项目。", "判断业务影响分子、分母还是都影响。", "分子分母等额减少且原比率大于 1 时，速动比率提高。"], trap: "预付账款是资产，但通常不是速动资产；别把它放进分子。", memory: "速动比流动更严格：先把慢变现资产拿掉。" },
  { keyword: "现金比率", title: "现金比率", coreLabel: "公式/口径", core: "现金比率 = 现金资产 / 流动负债 =（货币资金 + 交易性金融资产）/ 流动负债", examPoint: "常考“最能反映即时偿债能力”的指标，答案通常指向现金比率。", steps: ["看到“即时偿付、直接偿付”先锁定现金比率。", "分子只看现金类资产。", "与流动比率、速动比率区分保守程度。"], trap: "应收账款、存货都不进现金比率分子。", memory: "即时还债，只认现金。" },
  { keyword: "应收账款周转率", title: "应收账款周转率", coreLabel: "公式/口径", core: "应收账款周转率 = 营业收入 / 应收账款平均余额", examPoint: "常考回款速度和营运效率，周转率越高、周转天数越短通常越好。", steps: ["分子锁定营业收入。", "分母用期初期末平均余额。", "再判断周转率或周转天数方向。"], trap: "不要直接用期末应收账款；题目给平均数就用平均数。", memory: "周转率看速度，分母多用平均余额。" },
  { keyword: "存货周转率", title: "存货周转率", coreLabel: "公式/口径", core: "存货周转率 = 营业成本 / 存货平均余额", examPoint: "常考存货变现和销售速度，注意分子常用营业成本。", steps: ["分子找营业成本。", "分母找存货平均余额。", "判断周转率升降和周转天数反向变化。"], trap: "存货周转率的分子不是营业收入。", memory: "存货跟成本走，不跟收入走。" },
  { keyword: "总资产周转率", title: "总资产周转率", coreLabel: "公式/口径", core: "总资产周转率 = 营业收入 / 平均资产总额", examPoint: "常考资产使用效率，也常进入杜邦分析。", steps: ["分子用营业收入。", "分母用平均资产总额。", "结合净利率判断资产获利能力变化。"], trap: "资产类指标通常注意平均口径。", memory: "资产周转看收入带动资产。" },
  { keyword: "销售净利率", title: "销售净利率", coreLabel: "公式/口径", core: "销售净利率 = 净利润 / 营业收入", examPoint: "常考每 1 元收入能留下多少净利润。", steps: ["分子看净利润。", "分母看营业收入。", "和毛利率、营业利润率区分口径。"], trap: "题目给营业利润、利润总额、净利润时要选对分子。", memory: "净利率一定用净利润。" },
  { keyword: "营业净利率", title: "营业净利率", coreLabel: "公式/口径", core: "营业净利率 = 净利润 / 营业收入", examPoint: "常和总资产周转率、权益乘数组成杜邦分析链。", steps: ["先算净利润/营业收入。", "再看是否与周转率、权益乘数连乘。", "按题目要求判断某因素影响。"], trap: "不要把营业利润率当成营业净利率。", memory: "杜邦第一环：收入变成利润。" },
  { keyword: "净资产收益率", title: "净资产收益率", coreLabel: "公式/口径", core: "净资产收益率 = 净利润 / 平均所有者权益", examPoint: "常考股东权益获利能力，是杜邦分析核心结果。", steps: ["先确认净利润。", "分母用平均所有者权益。", "杜邦题按销售净利率 x 总资产周转率 x 权益乘数拆开。"], trap: "因素分析法必须按题目顺序替代。", memory: "ROE 看股东的钱赚了多少。" },
  { keyword: "资产负债率", title: "资产负债率", coreLabel: "公式/口径", core: "资产负债率 = 负债总额 / 资产总额", examPoint: "常考长期偿债能力和财务风险。", steps: ["分子锁定负债总额。", "分母锁定资产总额。", "结合债权人视角判断风险。"], trap: "它不是短期偿债指标。", memory: "负债占资产，越高风险越高。" },
  { keyword: "权益乘数", title: "权益乘数", coreLabel: "公式/口径", core: "权益乘数 = 资产总额 / 所有者权益总额 = 1 /（1 - 资产负债率）", examPoint: "常考财务杠杆，权益乘数越大，负债程度通常越高。", steps: ["先找资产和权益。", "若给资产负债率，用 1 /（1 - 资产负债率）。", "放入杜邦体系判断 ROE。"], trap: "不要和产权比率混淆。", memory: "权益乘数越大，杠杆越大。" },
  { keyword: "资本保值增值率", title: "资本保值增值率", coreLabel: "公式/口径", core: "资本保值增值率 = 期末所有者权益 / 期初所有者权益 x 100%", examPoint: "常考所有者投入资本是否保全和增值。", steps: ["找到期初、期末所有者权益。", "期末除以期初。", "大于 100% 通常表示增值。"], trap: "题干强调所有者/投资人时，不要误判成单纯发展能力。", memory: "资本有没有长大，看所有者权益前后比。" },
  { keyword: "因素分析法", title: "因素分析法", coreLabel: "计算口径", core: "按题目指定顺序逐项替代：每次只变动一个因素，其他因素保持上一步数值。", examPoint: "常考各因素对综合指标的影响额。", steps: ["写出基期指标。", "按顺序每次替换一个因素。", "本次结果减上一步结果，就是该因素影响额。"], trap: "替代顺序会影响影响额，不能自己换顺序。", memory: "一步一换，一换一差。" },
  { keyword: "偿债能力指标", title: "偿债能力指标", coreLabel: "典型指标", core: "短期：流动比率、速动比率、现金比率；长期：资产负债率、产权比率、利息保障倍数。", examPoint: "题干出现债权人、偿还债务、还本付息，优先考虑偿债能力。", steps: ["先判断短期还是长期。", "短期找流动/速动/现金比率。", "长期找资产负债率、产权比率、利息保障倍数。"], trap: "企业盈利强不代表马上有现金还债。", memory: "债权人关心能不能还。" },
  { keyword: "营运能力指标", title: "营运能力指标", coreLabel: "典型指标", core: "应收账款周转率、存货周转率、流动资产周转率、总资产周转率。", examPoint: "题干出现周转、效率、资产使用，优先考虑营运能力。", steps: ["看到“周转率/周转天数”先归类营运能力。", "周转率通常越高越好。", "周转天数通常越短越好。"], trap: "别把周转速度题做成盈利能力题。", memory: "营运能力看转得快不快。" },
  { keyword: "盈利能力指标", title: "盈利能力指标", coreLabel: "典型指标", core: "销售净利率、总资产净利率、净资产收益率、每股收益、资本保值增值率。", examPoint: "题干出现投资人、所有者、资本保值增值、获利能力，优先考虑盈利能力。", steps: ["先看题干主体是不是所有者/投资人。", "再看是否强调利润或资本增值。", "排除偿债、营运、发展等干扰项。"], trap: "资本保值增值容易被误选为发展能力；题干强调所有者收益时更偏盈利能力评价。", memory: "投资人关心赚不赚钱。" },
  { keyword: "发展能力指标", title: "发展能力指标", coreLabel: "典型指标", core: "营业收入增长率、总资产增长率、资本积累率、营业利润增长率。", examPoint: "题干出现增长率、未来发展、规模扩张，优先考虑发展能力。", steps: ["先找增长类表述。", "再判断增长对象是收入、资产还是资本。", "不要只看某一期利润高低。"], trap: "发展能力强调趋势，不是某一期盈利水平。", memory: "发展能力看增长。" },
  { keyword: "实质重于形式", title: "实质重于形式", coreLabel: "判定口径", core: "会计确认、计量和报告看经济实质，不能只看合同名称、发票形式或法律外壳。", examPoint: "常考“形式上不是，实质上是”或“法律形式成立，但经济实质不同”的判断。", steps: ["先读题干交易安排的真实经济后果。", "再看风险、报酬、控制或经济利益是否实质转移。", "最后排除只按合同名称/法律形式判断的选项。"], trap: "看到合同、协议、法律形式，不要马上按字面选；题库喜欢用“形式合法但经济实质不同”设陷阱。", memory: "看实质，不看外壳。", aliases: ["经济实质", "法律形式"] }
];

function cleanKnowledgePoint(value: string | undefined, fallback: string) {
  const text = (value ?? "").trim();

  if (!text || text.length > 36 || /用户在|重点追打|请围绕|题上/.test(text)) {
    return fallback;
  }

  const cleaned = text.replace(/^第[一二三四五六七八九十百\d]+章\s*/, "").replace(/[（）()]+$/g, "");

  return cleaned === fallback || fallback.includes(cleaned) || cleaned.includes(fallback) ? fallback : cleaned;
}

function getQuestionTypeMethod(type: QuestionType) {
  switch (type) {
    case "multiple":
      return "多选题不要只找正确项，还要逐项排除错误项；少选、多选都容易丢分。";
    case "judge":
      return "判断题优先找绝对化表述、适用条件和例外规定，别只凭印象判断。";
    case "calculation":
      return "计算分析题先列公式和口径，再代入数据，最后检查单位和正负方向。";
    case "comprehensive":
      return "综合题先拆成小问和考点，再按步骤写依据、计算或分录。";
    default:
      return "单选题先锁定唯一判断口径，再排除与公式、条件或规定不匹配的干扰项。";
  }
}

function getChapterInsight(chapter: string, questionType: QuestionType) {
  const matched = Object.entries(chapterInsights).find(([key]) => chapter.includes(key));

  if (matched) {
    return matched[1];
  }

  return {
    focus: `围绕「${chapter}」把核心定义、适用条件和计算口径掌握清楚。`,
    method: getQuestionTypeMethod(questionType),
    trap: "常见失分点是只记结论、不看题干限定条件，或没有把考点口径落实到选项。"
  };
}

function getCorrectAnswerText(question: QuestionPayload) {
  if (!question.options) return "";
  const answer = question.answer;

  if (Array.isArray(answer)) {
    return answer.map((key) => question.options?.[key]).filter(Boolean).join(" ");
  }

  if (typeof answer === "string") {
    return question.options[answer] ?? answer;
  }

  if (typeof answer === "boolean") {
    return answer ? "正确" : "错误";
  }

  return answer.sampleSolution;
}

function getMetricInsight(question: QuestionPayload) {
  const correctAnswerText = getCorrectAnswerText(question);
  const primaryText = `${question.question} ${correctAnswerText}`;
  const analysisLead = question.analysis.slice(0, 180);
  const matches = (text: string, item: (typeof metricInsights)[number]) => text.includes(item.keyword) || Boolean(item.aliases?.some((alias) => text.includes(alias)));

  return metricInsights.find((item) => matches(primaryText, item)) ?? metricInsights.find((item) => matches(analysisLead, item)) ?? null;
}

function getAnalysisLead(analysis: string) {
  return analysis.split(/[。！？]/).map((item) => item.trim()).find(Boolean) ?? analysis.slice(0, 80);
}

function getQuestionTakeaway(question: QuestionPayload) {
  return getMetricInsight(question)?.memory ?? getAnalysisLead(question.analysis);
}

function SourceBadge({ question }: { question: QuestionPayload }) {
  if (question.source === "web") {
    return <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">2026公开练习题</span>;
  }

  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${question.source === "official" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{question.source === "official" ? "本地原题" : "AI 题"}</span>;
}

function OriginalSourceNote({ question }: { question: QuestionPayload }) {
  if (question.source === "web") {
    return <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-700"><span>来源：{question.sourceName || question.sourceTitle || "公开网页"}</span>{question.publishedAt ? <span>· 发布于 {question.publishedAt}</span> : null}{question.sourceUrl ? <a href={question.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">查看原网页</a> : null}<span className="w-full text-blue-500">题目、答案和解析均来自来源原文，未经过 AI 改写。</span></div>;
  }

  if (question.source !== "official") return null;

  return <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-700">原题来源：{question.sourceTitle || question.sourceFile || "本地题库"}</p>;
}

function AnswerAnalysisList({ feedback }: { feedback: SubmitAnswerResponse }) {
  if (!feedback.answerAnalysis?.length) return null;

  return <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">选项解析</p><div className="mt-3 space-y-3">{feedback.answerAnalysis.map((item) => <div key={item.optionKey} className={`rounded-xl border p-4 ${item.isCorrect ? "border-emerald-200 bg-emerald-50" : item.isSelected ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}><div className="flex flex-wrap items-center gap-2"><strong className={item.isCorrect ? "text-emerald-700" : "text-slate-700"}>{item.optionKey} {item.isCorrect ? "正确" : "错误"}</strong>{item.isSelected ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">你的选择</span> : null}</div><p className="mt-2 text-sm leading-6 text-slate-700">{item.optionText}</p><p className="mt-2 text-sm leading-7 text-slate-600">{item.explanation}</p></div>)}</div></div>;
}

function splitOriginalAnalysis(analysis: string) {
  return analysis
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？；])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanExtractedSentence(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeAnalysisForCompare(value: string) {
  return value.replace(/\s+/g, "").replace(/[，。！？；：、（）()【】\-[\]—=＝×÷\s]/g, "");
}

function isSimilarAnalysisSnippet(left: string, right: string) {
  const normalizedLeft = normalizeAnalysisForCompare(left);
  const normalizedRight = normalizeAnalysisForCompare(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

function isWeakAnalysisSnippet(value: string) {
  return (
    !value ||
    /^（?\d+[）)]/.test(value) ||
    /目录|第\d+讲|第[一二三四五六七八九十]+节|注意的问题/.test(value) ||
    value.length > 220
  );
}

function extractAnswerConclusion(sentence: string, correctAnswer: string) {
  const direct = sentence.match(new RegExp(`(?:由[^。！？；]{0,40})?选项${correctAnswer}(?:的说法)?(?:正确|不正确|错误)[^。！？；]*`));

  return cleanExtractedSentence(direct?.[0] ?? sentence);
}

function isFinalResultSnippet(value: string) {
  return /综上|因此|期末|列报|金额\s*[=＝]|合计|应计提|账面价值|可变现净值/.test(value);
}

function pickOriginalAnalysisParts(analysis: string, correctAnswer: string) {
  const sentences = splitOriginalAnalysis(analysis);
  const conclusionSource = sentences.find((item) => item.includes(`选项${correctAnswer}`)) ?? sentences.find((item) => /正确|不正确|错误/.test(item)) ?? sentences[0] ?? analysis;
  const conclusion = extractAnswerConclusion(conclusionSource, correctAnswer);
  const conclusionIndex = sentences.indexOf(conclusionSource);
  const afterConclusion = conclusionIndex >= 0 ? sentences.slice(conclusionIndex + 1) : [];
  const beforeConclusion = conclusionIndex >= 0 ? sentences.slice(0, conclusionIndex).reverse() : [];
  const result =
    [...afterConclusion, ...beforeConclusion].find((item) => !isWeakAnalysisSnippet(item) && isFinalResultSnippet(item) && !isSimilarAnalysisSnippet(item, conclusion)) ?? "";
  const basis: string[] = [];

  for (const item of [...beforeConclusion, ...afterConclusion]) {
    if (basis.length >= 2) {
      break;
    }

    if (
      isWeakAnalysisSnippet(item) ||
      isSimilarAnalysisSnippet(item, conclusion) ||
      (result && isSimilarAnalysisSnippet(item, result)) ||
      basis.some((existing) => isSimilarAnalysisSnippet(existing, item))
    ) {
      continue;
    }

    basis.push(item);
  }

  const references = sentences
    .filter((item) => !isWeakAnalysisSnippet(item))
    .filter((item, index, list) => list.findIndex((candidate) => isSimilarAnalysisSnippet(candidate, item)) === index)
    .slice(0, 4);

  return { conclusion, basis, result, references };
}

function OfficialAnalysisCard({ analysis, selectedAnswerText, correctAnswerText, chapter }: { analysis: string; selectedAnswerText: string; correctAnswerText: string; chapter: string }) {
  const parts = pickOriginalAnalysisParts(analysis, correctAnswerText);
  const isCorrect = selectedAnswerText === correctAnswerText;

  return <div className="mt-4 space-y-4">
    <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-500">本题复盘</p><p className="mt-1 text-xs text-slate-500">{chapter}</p></div><span className={`rounded-full px-3 py-1 text-[11px] font-medium ${isCorrect ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{isCorrect ? "回答正确" : "回答错误"}</span></div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-white p-3"><p className="text-xs font-semibold text-slate-400">答案定位</p><p className="mt-2 text-sm font-semibold leading-6 text-slate-800">你选 {selectedAnswerText || "未作答"} / 原题答案 {correctAnswerText}</p></div>
        <div className="rounded-xl bg-white p-3 md:col-span-2"><p className="text-xs font-semibold text-slate-400">一句话结论</p><p className="mt-2 text-sm font-semibold leading-7 text-slate-900">{parts.conclusion}</p></div>
        {parts.basis.length ? <div className="rounded-xl bg-white p-3 md:col-span-3"><p className="text-xs font-semibold text-slate-400">关键依据（原文摘录）</p><div className="mt-2 space-y-2">{parts.basis.map((item) => <p key={item} className="text-sm leading-7 text-slate-700">{item}</p>)}</div></div> : null}
        {parts.result ? <div className="rounded-xl bg-white p-3 md:col-span-3"><p className="text-xs font-semibold text-slate-400">最终结果</p><p className="mt-2 text-sm font-semibold leading-7 text-slate-900">{parts.result}</p></div> : null}
      </div>
    </section>
    <details className="rounded-2xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">查看原题完整依据</summary>
      {parts.references.length ? <div className="mt-3 space-y-2">{parts.references.map((item) => <p key={item} className="rounded-xl bg-slate-50 px-3 py-2 text-sm leading-7 text-slate-700">{item}</p>)}</div> : null}
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">{analysis}</p>
    </details>
  </div>;
}

function KnowledgePointInsight({ subject, chapter, question }: { subject: ExamSubject; chapter: string; question: QuestionPayload }) {
  const topic = cleanKnowledgePoint(question.knowledgePoint, chapter);
  const insight = getChapterInsight(chapter, question.type);
  const metricInsight = getMetricInsight(question);
  const displayTopic = metricInsight?.title ?? topic;

  return <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-500">知识点解读</p><p className="mt-1 text-lg font-bold text-slate-900">本题考点：{displayTopic}</p></div><span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-blue-700">{subject}</span></div>{metricInsight ? <div className="mt-4 space-y-3"><div className="rounded-2xl border border-blue-100 bg-white p-4"><p className="text-xs font-semibold text-blue-500">{metricInsight.coreLabel}</p><p className="mt-2 text-base font-bold leading-7 text-slate-900">{metricInsight.core}</p><p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold leading-6 text-amber-800">记忆句：{metricInsight.memory}</p></div><div className="grid gap-3 md:grid-cols-[1fr_1fr]"><div className="rounded-2xl bg-white/90 p-4"><p className="text-xs font-semibold text-slate-400">本题切口</p><p className="mt-2 text-sm leading-7 text-slate-700">{metricInsight.examPoint}</p></div><div className="rounded-2xl bg-white/90 p-4"><p className="text-xs font-semibold text-slate-400">易错陷阱</p><p className="mt-2 text-sm leading-7 text-slate-700">{metricInsight.trap}</p></div></div><div className="rounded-2xl bg-white/90 p-4"><p className="text-xs font-semibold text-slate-400">三步解题</p><ol className="mt-3 space-y-2">{metricInsight.steps.map((step, index) => <li key={step} className="flex gap-3 text-sm leading-6 text-slate-700"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white">{index + 1}</span><span>{step}</span></li>)}</ol></div></div> : <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-white/80 p-3"><p className="text-xs font-semibold text-slate-400">重点掌握</p><p className="mt-1 text-sm leading-7 text-slate-700">{insight.focus}</p></div><div className="rounded-xl bg-white/80 p-3"><p className="text-xs font-semibold text-slate-400">做题抓手</p><p className="mt-1 text-sm leading-7 text-slate-700">{insight.method}</p></div><div className="rounded-xl bg-white/80 p-3 sm:col-span-2"><p className="text-xs font-semibold text-slate-400">易错提醒</p><p className="mt-1 text-sm leading-7 text-slate-700">{insight.trap}</p></div></div>}</div>;
}

function formatSourceTitle(value: string | undefined) {
  return value?.replace(/^\d+\s*/, "").trim() ?? "";
}

function formatPracticeScope(point: string, question: QuestionPayload | null) {
  const sourceTitle = question?.source === "official" ? formatSourceTitle(question.sourceTitle) : "";

  if (sourceTitle && !sourceTitle.includes(point)) {
    return `${sourceTitle} / ${point}`;
  }

  return point;
}

export function PracticeWorkspace({ chapters, initialSubject, initialChapter, initialCount }: { chapters: ExamChapter[]; initialSubject?: string; initialChapter?: string; initialCount?: number }) {
  const subjects = [...new Set(chapters.map((item) => item.subject))] as ExamSubject[];
  const [subject, setSubject] = useState<ExamSubject>((initialSubject as ExamSubject) || subjects[0] || "中级会计实务");
  const subjectChapters = chapters.filter((item) => item.subject === subject);
  const [chapter, setChapter] = useState(initialChapter || subjectChapters[0]?.chapter_name || "");
  const [questionType, setQuestionType] = useState<QuestionType>("single");
  const [targetCount, setTargetCount] = useState(Math.min(Math.max(initialCount || 20, 1), 20));
  const questionAreaRef = useRef<HTMLElement | null>(null);
  const [question, setQuestion] = useState<QuestionPayload | null>(null); const [sessionId, setSessionId] = useState(""); const [selected, setSelected] = useState<string[]>([]); const [subjectiveAnswers, setSubjectiveAnswers] = useState<Record<string, string>>({}); const [activeRequirement, setActiveRequirement] = useState(0); const [feedback, setFeedback] = useState<SubmitAnswerResponse | null>(null); const [history, setHistory] = useState<Array<{ correct: boolean }>>([]); const [seenReferenceIds, setSeenReferenceIds] = useState<string[]>([]); const [prefetchedVariant, setPrefetchedVariant] = useState<GenerateQuestionResponse | null>(null); const [prefetchingVariant, setPrefetchingVariant] = useState(false); const [variantUnavailable, setVariantUnavailable] = useState(""); const [elapsed, setElapsed] = useState(0); const [running, setRunning] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [lastHint, setLastHint] = useState("");
  const currentIndex = Math.min(history.length + 1, targetCount); const completed = history.length >= targetCount;

  useEffect(() => { if (!running) return; const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000); return () => window.clearInterval(timer); }, [running]);
  useEffect(() => { setSeenReferenceIds([]); setPrefetchedVariant(null); setPrefetchingVariant(false); setVariantUnavailable(""); setQuestion(null); setFeedback(null); setSelected([]); setSubjectiveAnswers({}); setActiveRequirement(0); }, [chapter, questionType]);
  useEffect(() => { if (question && !feedback) scrollToQuestionArea("auto"); }, [question, feedback]);
  useEffect(() => {
    if (!question || !["calculation", "comprehensive"].includes(question.type)) return;
    const storageKey = `exam-os-draft:${question.referenceId || sessionId}`;
    try {
      const saved = window.localStorage.getItem(storageKey);
      setSubjectiveAnswers(saved ? JSON.parse(saved) as Record<string, string> : {});
    } catch {
      setSubjectiveAnswers({});
    }
    setActiveRequirement(0);
  }, [question, sessionId]);
  useEffect(() => {
    if (!question || !["calculation", "comprehensive"].includes(question.type)) return;
    if (Object.keys(subjectiveAnswers).length === 0) return;
    window.localStorage.setItem(`exam-os-draft:${question.referenceId || sessionId}`, JSON.stringify(subjectiveAnswers));
  }, [question, sessionId, subjectiveAnswers]);
  function scrollToQuestionArea(behavior: ScrollBehavior = "smooth") {
    window.requestAnimationFrame(() => {
      questionAreaRef.current?.scrollIntoView({ behavior, block: "start" });
      window.setTimeout(() => questionAreaRef.current?.scrollIntoView({ behavior, block: "start" }), 120);
    });
  }

  async function requestQuestion(chase = false, hint = lastHint) {
    const response = await fetch("/api/generate-question", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject, knowledgePoint: chapter, questionType, difficulty: chase ? "medium" : "easy", practiceMode: chase ? "chase" : "daily", chaseMode: chase, sourceMode: chase ? "web-2026" : "local-first", lastWrongReason: hint, excludeQuestionIds: seenReferenceIds }) });
    const data = await response.json(); if (!response.ok) { if (chase && data.code === "WEB_QUESTION_NOT_FOUND") setVariantUnavailable(data.error ?? "暂无已核验的2026同类题。"); else setError(data.error ?? "出题失败"); setLoading(false); return; }
    return data as GenerateQuestionResponse;
  }

  function applyQuestion(result: GenerateQuestionResponse) {
    setQuestion(result.question); if (result.question.referenceId) setSeenReferenceIds((current) => [...new Set([...current, result.question.referenceId as string])]); setSessionId(result.sessionId); setRunning(true); setLoading(false); scrollToQuestionArea();
  }

  async function generate(chase = false) {
    if (!chapter) return; setLoading(true); setError(""); setVariantUnavailable(""); setFeedback(null); setSelected([]); setSubjectiveAnswers({}); setActiveRequirement(0); setPrefetchedVariant(null); setPrefetchingVariant(false);
    const result = await requestQuestion(chase);
    if (result) applyQuestion(result);
  }

  async function prefetchVariant(hint: string) {
    if (!chapter || prefetchingVariant) return; setPrefetchingVariant(true); setPrefetchedVariant(null); setVariantUnavailable("");
    const result = await requestQuestion(true, hint);
    if (result) setPrefetchedVariant(result);
    setPrefetchingVariant(false);
  }

  function toggle(key: string) { if (error) setError(""); if (question?.type === "multiple") setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key].sort()); else setSelected([key]); }

  async function submit() {
    if (!question || !sessionId) return; const objective = ["single", "multiple", "judge"].includes(question.type); const subjectiveLayout = objective ? null : parseSubjectiveQuestion(question.question); const subjectiveText = subjectiveLayout ? serializeSubjectiveAnswers(subjectiveLayout.requirements, subjectiveAnswers) : ""; if (objective && !selected.length) { setError("请先选择答案。"); return; } if (question.type === "multiple" && selected.length < 2) { setError("多选题请至少选择 2 个选项。"); return; } if (!objective && !Object.values(subjectiveAnswers).some((value) => value.trim())) { setError("请至少完成一个小问后再提交。"); return; }
    setLoading(true); setError(""); const response = await fetch("/api/submit-answer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, selectedAnswer: objective ? selected.join(",") : subjectiveText }) }); const data = await response.json(); if (!response.ok) { setError(data.error ?? "提交失败"); setLoading(false); return; } setFeedback(data); setLastHint(data.nextPromptHint); setHistory((current) => [...current, { correct: data.correct }]); setLoading(false); if (data.shouldChase) void prefetchVariant(data.nextPromptHint); if (history.length + 1 >= targetCount) setRunning(false);
  }

  function next(chase = false) {
    scrollToQuestionArea("auto"); setQuestion(null); setFeedback(null);
    if (chase && prefetchedVariant) { const readyVariant = prefetchedVariant; setPrefetchedVariant(null); setPrefetchingVariant(false); setSelected([]); setSubjectiveAnswers({}); setActiveRequirement(0); applyQuestion(readyVariant); return; }
    void generate(chase);
  }

  const options = question?.options ?? (question?.type === "judge" ? { A: "正确", B: "错误" } : {});
  const subjectiveLayout = question && ["calculation", "comprehensive"].includes(question.type) ? parseSubjectiveQuestion(question.question) : null;
  const submittedAnswerText = question && ["single", "multiple", "judge"].includes(question.type) ? selected.join("、") : subjectiveLayout ? serializeSubjectiveAnswers(subjectiveLayout.requirements, subjectiveAnswers) : "";
  const isOfficialQuestion = question?.source === "official";
  const isReferenceQuestion = question?.source === "official" || question?.source === "web";
  const sourceLabel = question?.source === "web" ? "2026公开练习题" : isOfficialQuestion ? "本地原题" : "AI题";
  const takeaway = question ? getQuestionTakeaway(question) : "";
  const accuracy = history.length ? Math.round((history.filter((item) => item.correct).length / history.length) * 100) : 0;
  const chapterInOutline = subjectChapters.some((item) => item.chapter_name === chapter);
  const practiceScope = formatPracticeScope(chapter, question);

  return <div className="min-h-screen bg-[#f4f7fb]">
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Practice Workspace</p><h1 className="mt-1 text-2xl font-bold text-slate-950">做题练习</h1></div><div className="flex items-center gap-4 text-sm"><span>题目进度 <strong className="text-2xl text-slate-950">{history.length}</strong> / {targetCount}</span><span>用时 <strong className="font-mono text-lg text-slate-950">{timeText(elapsed)}</strong></span></div></div></header>
    <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-8"><div className="mx-auto grid max-w-7xl gap-3 md:grid-cols-4"><label className="text-xs font-semibold text-slate-500">科目<select value={subject} onChange={(e) => { const next = e.target.value as ExamSubject; setSubject(next); setChapter(chapters.find((item) => item.subject === next)?.chapter_name ?? ""); }} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800">{subjects.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-semibold text-slate-500">练习范围<select value={chapter} onChange={(e) => setChapter(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800">{chapterInOutline ? null : <option value={chapter}>细考点：{chapter}</option>}{subjectChapters.map((item) => <option key={item.id}>{item.chapter_name}</option>)}</select></label><label className="text-xs font-semibold text-slate-500">题型<select value={questionType} onChange={(e) => setQuestionType(e.target.value as QuestionType)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800">{typeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="text-xs font-semibold text-slate-500">题目数量<select value={targetCount} onChange={(e) => setTargetCount(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800"><option value="5">5 题小测</option><option value="10">10 题训练</option><option value="20">20 题练习</option></select></label></div></div>
    <div className="mx-auto grid max-w-7xl gap-5 p-4 sm:p-8 xl:grid-cols-[1fr_320px]">
      <main ref={questionAreaRef} className="min-w-0 scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        {!question && !completed ? <div className="grid min-h-[480px] place-items-center text-center"><div><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-2xl text-blue-600">✎</span><h2 className="mt-5 text-2xl font-bold text-slate-950">准备开始「{chapter}」</h2><p className="mt-2 text-sm font-medium text-slate-700">当前练习：{subject} · {practiceScope}</p><p className="mt-2 text-sm text-slate-500">先做本地学习资料原题；答错后匹配同考点、同题型的2026公开练习题，题目与答案不由 AI 改写。</p><button onClick={() => generate(false)} disabled={loading} className="mt-6 rounded-xl bg-blue-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200">{loading ? "正在抽取本地题..." : "开始做本地原题 →"}</button></div></div> : null}
        {completed ? <div className="grid min-h-[480px] place-items-center text-center"><div><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</span><h2 className="mt-5 text-3xl font-bold text-slate-950">本轮训练完成</h2><p className="mt-2 text-slate-500">完成 {history.length} 题，正确率 {accuracy}%。错题已自动进入错题本。</p><button onClick={() => { setHistory([]); setSeenReferenceIds([]); setElapsed(0); setQuestion(null); setFeedback(null); }} className="mt-6 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white">开始新一轮</button></div></div> : null}
        {question && !completed ? <div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">{subject}</span><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">{practiceScope}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{typeOptions.find((item) => item.value === question.type)?.label}</span><SourceBadge question={question} /></div><OriginalSourceNote question={question} />
          {["single", "multiple", "judge"].includes(question.type) ? <><h2 className="mt-5 text-lg font-semibold leading-8 text-slate-950 sm:text-xl">{question.question}</h2><div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">{question.type === "multiple" ? "多选题：请至少选择 2 项；少选、多选、错选都会影响得分。" : question.type === "judge" ? "判断题：请选择“正确”或“错误”。" : "单选题：请选择唯一正确答案。"}</div><div className={`mt-4 gap-3 ${question.type === "judge" ? "grid sm:grid-cols-2" : "space-y-3"}`}>{Object.entries(options).map(([key, value]) => { const active = selected.includes(key); const isCorrect = feedback && ((typeof feedback.correctAnswer === "string" && feedback.correctAnswer === key) || (Array.isArray(feedback.correctAnswer) && feedback.correctAnswer.includes(key as never)) || (typeof feedback.correctAnswer === "boolean" && key === (feedback.correctAnswer ? "A" : "B"))); const isWrong = feedback && active && !isCorrect; return <button key={key} disabled={Boolean(feedback)} onClick={() => toggle(key)} className={`flex w-full items-center gap-4 rounded-xl border px-4 py-4 text-left text-sm transition ${isCorrect ? "border-emerald-400 bg-emerald-50" : isWrong ? "border-red-400 bg-red-50" : active ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-300"}`}><span className={`grid h-7 w-7 shrink-0 place-items-center border text-xs font-bold ${question.type === "multiple" ? "rounded-md" : "rounded-full"} ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"}`}>{key}</span><span>{value}</span></button>; })}</div></> : <SubjectiveAnswerWorkspace question={question} answers={subjectiveAnswers} activeIndex={activeRequirement} onActiveIndexChange={setActiveRequirement} onAnswerChange={(id, value) => { if (error) setError(""); setSubjectiveAnswers((current) => ({ ...current, [id]: value })); }} />}
          {error ? <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {!feedback ? <div className="mt-6 flex flex-wrap gap-3"><button onClick={submit} disabled={loading} className="rounded-xl bg-blue-600 px-7 py-3 text-sm font-semibold text-white">{loading ? (["calculation", "comprehensive"].includes(question.type) ? "AI 正在判卷..." : "正在判定...") : "提交答案"}</button><button onClick={() => { setSelected([]); setSubjectiveAnswers({}); setError(""); }} className="rounded-xl border border-slate-200 px-5 py-3 text-sm">清空答案</button></div> : <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className={`rounded-2xl border p-4 ${feedback.correct ? "border-emerald-200 bg-emerald-50" : feedback.verdict === "confused" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}><div className="flex flex-wrap items-center justify-between gap-3"><strong className={feedback.correct ? "text-emerald-700" : feedback.verdict === "confused" ? "text-amber-700" : "text-red-700"}>{["calculation", "comprehensive"].includes(question.type) ? feedback.correct ? "AI 判定：核心步骤基本掌握" : feedback.verdict === "confused" ? "作答已提交，请对照原答案" : "AI 判定：这道题还需要巩固" : feedback.correct ? "回答正确，本题掌握" : "回答错误，已加入错题本"}</strong><span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">{sourceLabel} · {typeOptions.find((item) => item.value === question.type)?.label}</span></div>{!["calculation", "comprehensive"].includes(question.type) ? <div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-xl bg-white/80 px-3 py-2 text-sm"><span className="text-slate-400">你的答案：</span><strong className="text-slate-800">{submittedAnswerText || "未作答"}</strong></div><div className="rounded-xl bg-white/80 px-3 py-2 text-sm"><span className="text-slate-400">{isReferenceQuestion ? "原题答案：" : "正确答案："}</span><strong className="text-slate-800">{answerText(feedback.correctAnswer)}</strong></div></div> : null}{!isReferenceQuestion ? <div className="mt-3 rounded-xl bg-white/90 px-3 py-3 text-sm leading-6 text-slate-700"><span className="font-semibold text-blue-700">先记这句：</span>{takeaway}<span className="ml-2 text-slate-400">下一步：{feedback.shouldChase ? "做一道同类变式，把这个错点压下去。" : "进入下一题，保持节奏。"}</span></div> : null}</div>{["calculation", "comprehensive"].includes(question.type) ? <SubjectiveReviewCard question={question} feedback={feedback} userAnswer={submittedAnswerText} /> : <>{!isReferenceQuestion ? <AnswerAnalysisList feedback={feedback} /> : null}{isReferenceQuestion ? <OfficialAnalysisCard analysis={feedback.analysis} selectedAnswerText={submittedAnswerText} correctAnswerText={answerText(feedback.correctAnswer)} chapter={practiceScope} /> : <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">完整解析</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{feedback.analysis}</p></div>}{!isReferenceQuestion ? <KnowledgePointInsight subject={subject} chapter={chapter} question={question} /> : null}</>}{variantUnavailable ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">{variantUnavailable}</p> : null}<div className="sticky bottom-3 z-10 mt-5 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-lg shadow-slate-200/70 backdrop-blur">{feedback.shouldChase && !variantUnavailable ? <button onClick={() => next(true)} disabled={prefetchingVariant && !prefetchedVariant} className={`rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-md ${prefetchingVariant && !prefetchedVariant ? "bg-slate-400 shadow-slate-200" : "bg-blue-600 shadow-blue-200"}`}>{prefetchingVariant && !prefetchedVariant ? "正在匹配2026公开题..." : prefetchedVariant ? "直接做2026同类原题 →" : "匹配2026同类原题"}</button> : null}<button onClick={() => next(false)} className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold">{variantUnavailable ? "继续下一道本地原题 →" : "下一题 →"}</button></div></div>}
        </div> : null}
      </main>
      <aside className="space-y-5"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">题目导航</h2><div className="mt-4 grid grid-cols-5 gap-2">{Array.from({ length: targetCount }, (_, index) => { const result = history[index]; const active = index + 1 === currentIndex && !completed; return <span key={index} className={`grid aspect-square place-items-center rounded-lg border text-xs font-semibold ${result ? result.correct ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-red-300 bg-red-50 text-red-600" : active ? "border-blue-500 bg-blue-600 text-white" : "border-slate-200 text-slate-400"}`}>{index + 1}</span>; })}</div><div className="mt-4 flex flex-wrap gap-3 text-[11px] text-slate-500"><span>● 当前</span><span className="text-emerald-600">● 已掌握</span><span className="text-red-500">● 错题</span></div></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">学习统计</h2><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><strong className="text-2xl text-slate-950">{accuracy}%</strong><span className="block text-xs text-slate-400">正确率</span></div><div className="rounded-xl bg-slate-50 p-3"><strong className="text-2xl text-slate-950">{history.filter((item) => !item.correct).length}</strong><span className="block text-xs text-slate-400">已识别错题</span></div></div><p className="mt-4 text-xs leading-5 text-slate-500">答错后自动进入错题本，章节掌握度同步更新，并提前匹配2026公开同类题。</p></section></aside>
    </div>
  </div>;
}
