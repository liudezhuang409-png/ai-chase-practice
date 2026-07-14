import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "data", "web-question-bank");
const outputFile = path.join(outputDir, "web-question-bank.json");
const lockFile = path.join(outputDir, ".sync.lock");

const sourceDefinitions = [
  { domain: "zlketang.com", name: "之了课堂" },
  { domain: "hqwx.com", name: "环球网校" },
  { domain: "233.com", name: "233网校" },
  { domain: "chinaacc.com", name: "正保会计网校" },
  { domain: "sieredu.com", name: "斯尔教育" },
  { domain: "dongao.com", name: "东奥会计在线" },
  { domain: "gaodun.com", name: "高顿教育" },
  { domain: "kuaiji.com", name: "会计网" },
  { domain: "med66.com", name: "正保医学教育网校" }
];

const searchThemes = [
  "每日一练 答案解析",
  "章节练习 题目 答案 解析",
  "高频错题 题目 答案 解析",
  "月考 高频错题 答案解析",
  "单选题 多选题 判断题 答案解析",
  "计算分析题 综合题 参考答案"
];

const chapterOrder = {
  "中级会计实务": ["总论", "存货", "固定资产", "无形资产", "投资性房地产", "长期股权投资和合营安排", "资产减值", "金融资产和金融负债", "职工薪酬", "股份支付", "借款费用", "或有事项", "收入", "政府补助", "非货币性资产交换", "债务重组", "所得税费用", "外币折算", "租赁", "持有待售的非流动资产、处置组和终止经营", "企业合并与合并财务报表", "会计政策、会计估计变更和差错更正", "资产负债表日后事项", "政府会计", "民间非营利组织会计"],
  "财务管理": ["总论", "财务管理基础", "预算管理", "筹资管理", "投资管理", "营运资金管理", "成本管理", "收入与分配管理", "财务分析与评价"],
  "经济法": ["总论", "公司法律制度", "合伙企业法律制度", "物权法律制度", "合同法律制度", "金融法律制度", "财政法律制度"]
};

const typeLabels = {
  "单选题": "single",
  "单项选择题": "single",
  "多选题": "multiple",
  "多项选择题": "multiple",
  "判断题": "judge",
  "计算分析题": "calculation",
  "综合题": "comprehensive"
};

async function fetchWithRetry(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500 || attempt === attempts) return response;
      lastError = new Error(`HTTP_${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 800));
  }
  throw lastError;
}

const chapterKeywords = {
  "中级会计实务": [
    ["总论", /会计信息质量要求|会计要素|会计计量属性/],
    ["资产减值", /资产减值|减值准备|可收回金额/],
    ["存货", /存货|可变现净值/],
    ["固定资产", /固定资产/],
    ["无形资产", /无形资产|研究阶段|开发阶段|研发支出/],
    ["长期股权投资和合营安排", /长期股权投资|合营安排/],
    ["金融资产和金融负债", /金融资产|金融负债|摊余成本/],
    ["收入", /收入确认|履约义务|合同资产/],
    ["租赁", /使用权资产|租赁负债|租赁收款额|经营租赁|融资租赁/]
  ],
  "财务管理": [
    ["财务管理基础", /资金时间价值|风险与收益|资本资产定价|成本性态/],
    ["预算管理", /预算|零基预算法|增量预算法/],
    ["投资管理", /净现值|内含收益率|投资项目|投资生产线|动态回收期|现金净流量|证券投资/],
    ["筹资管理", /筹资|资本成本|资本结构|杠杆系数|可转换债券|回售条款/],
    ["营运资金管理", /营运资金|现金管理|应收账款|存货管理|经济订货批量|变动储存成本/],
    ["成本管理", /本量利|标准成本|作业成本|责任成本/],
    ["收入与分配管理", /销售预测|产品定价|股利分配/],
    ["财务分析与评价", /财务分析|杜邦|流动比率|资产收益率|周转率/]
  ],
  "经济法": [
    ["总论", /民事法律行为|代理制度|仲裁|诉讼时效/],
    ["金融法律制度", /证券法律制度|权益变动报告书|票据|保险|信托/],
    ["合同法律制度", /合同法律制度|合同成立|要约|承诺|违约责任/],
    ["公司法律制度", /公司法律制度|股东|董事会|监事会|公司章程|股东会/],
    ["合伙企业法律制度", /合伙企业|普通合伙人|有限合伙人/],
    ["物权法律制度", /物权|所有权|抵押权|质权|留置权|地役权|居住权/],
    ["财政法律制度", /预算法律|政府采购/]
  ]
};

function canonicalizeSourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname === "wap.zlketang.com" || url.hostname === "m.zlketang.com") url.hostname = "www.zlketang.com";
    return url.toString();
  } catch {
    return value;
  }
}

function detectSubject(title, content) {
  if (/经济法/.test(title)) return "经济法";
  if (/财务管理|财管/.test(title)) return "财务管理";
  if (/中级会计实务|《实务》|'实务'/.test(title)) return "中级会计实务";
  const heading = content.slice(0, 1200);
  if (/经济法/.test(heading)) return "经济法";
  if (/财务管理|财管/.test(heading)) return "财务管理";
  if (/中级会计实务|《实务》/.test(heading)) return "中级会计实务";
  return null;
}

async function tavilyExtract(apiKey, urls) {
  const extracted = [];
  for (let offset = 0; offset < urls.length; offset += 20) {
    const batch = urls.slice(offset, offset + 20);
    const response = await fetchWithRetry("https://api.tavily.com/extract", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ urls: batch, extract_depth: "advanced", format: "markdown", include_images: false }),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) continue;
    const payload = await response.json();
    extracted.push(...(Array.isArray(payload.results) ? payload.results : []));
  }
  return extracted;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

function decodeEntities(value) {
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#\d+|#x[\da-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (_, token) => {
    if (token.startsWith("#x")) return String.fromCodePoint(Number.parseInt(token.slice(2), 16));
    if (token.startsWith("#")) return String.fromCodePoint(Number.parseInt(token.slice(1), 10));
    return entities[token.toLowerCase()] ?? _;
  });
}

function cleanSourceText(value) {
  return decodeEntities(String(value ?? ""))
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "")
    .replace(/[\t\u00a0]+/g, " ")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\n[ ]+/g, "\n")
    .replace(/[ ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanBlock(value) {
  return cleanSourceText(value)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeForHash(value) {
  return value.replace(/\s+/g, "").replace(/[，。；：、,.!?！？；]/g, "").toLowerCase();
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseDateParts(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractPublishedAt(title, content, explicitDate) {
  const values = [
    explicitDate,
    title,
    ...content.slice(0, 8000).split("\n").filter((line) => /^(?:更新(?:时间)?|发布(?:时间)?|来源|作者)?\s*[：:]?\s*2026[-年./]\d{1,2}[-月./]\d{1,2}/.test(line.trim()))
  ].filter(Boolean);

  for (const value of values) {
    const match = String(value).match(/(2026)[-年/.](\d{1,2})[-月/.](\d{1,2})日?/);
    if (match) {
      const parsed = parseDateParts(match[1], match[2], match[3]);
      if (parsed) return parsed;
    }
  }

  return null;
}

function getSourceDefinition(url) {
  let hostname;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    hostname = parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }

  return sourceDefinitions.find((item) => hostname === item.domain || hostname.endsWith(`.${item.domain}`)) ?? null;
}

function hasForbiddenReuseNotice(content) {
  return /禁止任何形式的?转载|严禁(?:任何形式)?转载|未经(?:本网站|本站|作者)?许可[^\n]{0,30}(?:转载|复制)|不得转载/.test(content);
}

function truncateFooter(value) {
  const markers = ["相关文章", "相关推荐", "想了解中级会计", "网站地图", "返回顶部", "登录下载", "点击下载资料", "注：以上习题内容"];
  let end = value.length;
  for (const marker of markers) {
    const index = value.indexOf(marker);
    if (index >= 0) end = Math.min(end, index);
  }
  return value.slice(0, end).trim();
}

function parseChapter(subject, text) {
  const number = text.match(/第\s*(\d{1,2})\s*章/)?.[1];
  if (number) return chapterOrder[subject]?.[Number(number) - 1] ?? "";
  const keywordMatch = chapterKeywords[subject]?.find(([, pattern]) => pattern.test(text))?.[0];
  if (keywordMatch) return keywordMatch;
  return chapterOrder[subject]?.find((chapter) => text.includes(chapter)) ?? "";
}

function parseDifficulty(text) {
  if (/难度[：:]?\s*(?:难|高)|冲刺/.test(text)) return "hard";
  if (/难度[：:]?\s*(?:中)|进阶/.test(text)) return "medium";
  return "easy";
}

function splitQuestionAndOptions(questionText, type) {
  const cleaned = cleanBlock(questionText).replace(/^\d+[.、．]\s*/, "");
  if (type === "judge" || type === "calculation" || type === "comprehensive") {
    return { question: cleaned, options: null };
  }

  const withOptionLines = cleaned.replace(/\s+(?=[A-D][.．、]\s*)/g, "\n");
  const optionPattern = /(?:^|\n)\s*([A-D])[.．、]\s*([\s\S]*?)(?=\n\s*[A-D][.．、]\s*|$)/g;
  const options = {};
  let firstOptionIndex = -1;
  let match;

  while ((match = optionPattern.exec(withOptionLines)) !== null) {
    if (firstOptionIndex < 0) firstOptionIndex = match.index;
    options[match[1]] = cleanBlock(match[2]);
  }

  if (Object.keys(options).length !== 4 || firstOptionIndex < 0) return null;
  return { question: cleanBlock(withOptionLines.slice(0, firstOptionIndex)), options };
}

function parseAnswer(type, answerText) {
  const value = cleanBlock(answerText).replace(/^[：:]/, "").trim();
  if (!value) return null;

  if (type === "judge") {
    if (/^(?:正确|对|√)/.test(value)) return true;
    if (/^(?:错误|错|×)/.test(value)) return false;
    return null;
  }

  if (type === "single") return value.match(/[A-D]/)?.[0] ?? null;
  if (type === "multiple") {
    const letters = [...new Set(value.match(/[A-D]/g) ?? [])];
    return letters.length >= 2 ? letters : null;
  }

  return { keyPoints: [], sampleSolution: value };
}

function parseQuestionSegments({ subject, sourceTitle, sourceUrl, sourceName, publishedAt, fetchedAt, content }) {
  const markerPattern = /(?:^|\n)\s*(?:\d+[.、．]\s*)?[〖【]?(单项选择题|单选题|多项选择题|多选题|判断题|计算分析题|综合题)[】〗]?\s*/gm;
  const markers = [...content.matchAll(markerPattern)];
  const questions = [];

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const type = typeLabels[marker[1]];
    const start = (marker.index ?? 0) + marker[0].length;
    const end = markers[index + 1]?.index ?? content.length;
    const segment = truncateFooter(content.slice(start, end));
    const answerMarker = segment.match(/[〖【]?(?:正确答案|参考答案|答案)[】〗]?\s*[：:]?/);
    const analysisMarker = segment.match(/[〖【]?(?:答案解析|解析)[】〗]?\s*[：:]?/);

    if (!answerMarker || !analysisMarker || (analysisMarker.index ?? -1) <= (answerMarker.index ?? -1)) continue;
    const questionPart = segment.slice(0, answerMarker.index).trim();
    const answerPart = segment.slice((answerMarker.index ?? 0) + answerMarker[0].length, analysisMarker.index).trim();
    const analysis = cleanBlock(segment.slice((analysisMarker.index ?? 0) + analysisMarker[0].length));
    const parsedQuestion = splitQuestionAndOptions(questionPart, type);
    const answer = parseAnswer(type, answerPart);

    if (!parsedQuestion?.question || parsedQuestion.question.length < 12 || !answer || analysis.length < 8) continue;
    const chapter = parseChapter(subject, `${sourceTitle}\n${segment}`);
    if (!chapter) continue;
    const contentHash = hash(normalizeForHash(`${parsedQuestion.question}\n${JSON.stringify(parsedQuestion.options)}\n${JSON.stringify(answer)}`));
    questions.push({
      id: `web-${contentHash.slice(0, 20)}`,
      subject,
      chapter,
      knowledgePoint: chapter,
      type,
      difficulty: parseDifficulty(segment),
      question: parsedQuestion.question,
      options: parsedQuestion.options,
      answer,
      analysis,
      source: "web",
      score: type === "calculation" ? 10 : type === "comprehensive" ? 15 : 2,
      examTips: [],
      sourceTitle,
      sourceName,
      sourceUrl,
      publishedAt,
      fetchedAt,
      contentHash
    });
  }

  return questions;
}

function inferQuestionType(questionPart, answerPart) {
  const letters = [...new Set(cleanBlock(answerPart).match(/[A-D]/g) ?? [])];
  if (/\bA[.．、]/.test(questionPart) && /\bD[.．、]/.test(questionPart)) {
    return letters.length >= 2 ? "multiple" : letters.length === 1 ? "single" : null;
  }
  if (/^(?:正确|错误|对|错|√|×)/.test(cleanBlock(answerPart))) return "judge";
  if (/要求[：:]?/.test(questionPart)) return /（\s*2\s*）|\(\s*2\s*\)/.test(questionPart) ? "comprehensive" : "calculation";
  return null;
}

function parseLooseQuestionSegments({ subject, sourceTitle, sourceUrl, sourceName, publishedAt, fetchedAt, content }) {
  const answerPattern = /(?:^|\n)\s*[〖【](?:正确答案|参考答案|答案)[】〗]\s*[：:]?/gm;
  const answers = [...content.matchAll(answerPattern)];
  const questions = [];

  for (const answerMarker of answers) {
    const answerIndex = answerMarker.index ?? 0;
    const prefix = content.slice(0, answerIndex);
    const questionStarts = [...prefix.matchAll(/(?:^|\n)\s*\d+[.、．]\s*/gm)];
    const questionStart = questionStarts.at(-1)?.index;
    if (questionStart === undefined) continue;

    const afterAnswer = content.slice(answerIndex + answerMarker[0].length);
    const analysisMarker = afterAnswer.match(/(?:^|\n)\s*[〖【](?:答案解析|解析)[】〗]\s*[：:]?/m);
    if (!analysisMarker) continue;
    const answerPart = afterAnswer.slice(0, analysisMarker.index).trim();
    const analysisStart = (analysisMarker.index ?? 0) + analysisMarker[0].length;
    const afterAnalysis = afterAnswer.slice(analysisStart);
    const nextQuestion = afterAnalysis.match(/\n\s*\d+[.、．]\s*/);
    const footer = afterAnalysis.search(/\n(?:……|以上是|限于篇幅|微博|微信)/);
    const possibleEnds = [nextQuestion?.index, footer].filter((value) => typeof value === "number" && value >= 0);
    const analysisEnd = possibleEnds.length ? Math.min(...possibleEnds) : afterAnalysis.length;
    const questionPart = content.slice(questionStart, answerIndex).trim();
    const type = inferQuestionType(questionPart, answerPart);
    if (!type) continue;

    const parsedQuestion = splitQuestionAndOptions(questionPart, type);
    const answer = parseAnswer(type, answerPart);
    const analysis = cleanBlock(afterAnalysis.slice(0, analysisEnd));
    if (!parsedQuestion?.question || parsedQuestion.question.length < 12 || !answer || analysis.length < 8) continue;
    const chapter = parseChapter(subject, `${sourceTitle}\n${parsedQuestion.question}\n${analysis}`);
    if (!chapter) continue;
    const contentHash = hash(normalizeForHash(`${parsedQuestion.question}\n${JSON.stringify(parsedQuestion.options)}\n${JSON.stringify(answer)}`));
    questions.push({
      id: `web-${contentHash.slice(0, 20)}`,
      subject,
      chapter,
      knowledgePoint: chapter,
      type,
      difficulty: parseDifficulty(questionPart),
      question: parsedQuestion.question,
      options: parsedQuestion.options,
      answer,
      analysis,
      source: "web",
      score: type === "calculation" ? 10 : type === "comprehensive" ? 15 : 2,
      examTips: [],
      sourceTitle,
      sourceName,
      sourceUrl,
      publishedAt,
      fetchedAt,
      contentHash
    });
  }

  return questions;
}

export function parseSourcePage({ expectedSubject, title, url, rawContent, publishedDate }) {
  const source = getSourceDefinition(url);
  const content = cleanSourceText(rawContent);
  if (!source) return { accepted: false, reason: "SOURCE_NOT_ALLOWED", questions: [] };
  if (hasForbiddenReuseNotice(content)) return { accepted: false, reason: "REUSE_FORBIDDEN", questions: [] };
  if (/20(?:1\d|2[0-5])年/.test(title) && !/2026/.test(title)) {
    return { accepted: false, reason: "NOT_PUBLISHED_IN_2026", questions: [] };
  }

  const publishedAt = extractPublishedAt(title, content, publishedDate);
  if (!publishedAt?.startsWith("2026-")) return { accepted: false, reason: "NOT_PUBLISHED_IN_2026", questions: [] };
  if (/登录后|会员专享|付费后|购买后/.test(content) && !/(?:正确答案|参考答案|答案)[】〗]?\s*[：:]?\s*[A-D正确错误对错√×]/.test(content)) {
    return { accepted: false, reason: "ANSWER_BEHIND_LOGIN", questions: [] };
  }

  const fetchedAt = new Date().toISOString();
  const shared = {
    subject: expectedSubject,
    sourceTitle: cleanBlock(title),
    sourceUrl: url,
    sourceName: source.name,
    publishedAt,
    fetchedAt,
    content
  };
  const questions = [...parseQuestionSegments(shared), ...parseLooseQuestionSegments(shared)];
  const uniqueQuestions = [...new Map(questions.map((question) => [question.contentHash, question])).values()];

  return uniqueQuestions.length > 0
    ? { accepted: true, reason: "ACCEPTED", questions: uniqueQuestions }
    : { accepted: false, reason: "NO_COMPLETE_QUESTION", questions: [] };
}

async function tavilySearch(apiKey, subject) {
  const queries = searchThemes.map((theme) => `2026 中级会计 ${subject} ${theme}`);
  const byUrl = new Map();

  for (let offset = 0; offset < queries.length; offset += 3) {
    const batch = queries.slice(offset, offset + 3);
    const payloads = await Promise.all(batch.map(async (query) => {
      const response = await fetchWithRetry("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query,
        search_depth: "advanced",
        max_results: 20,
        include_answer: false,
        include_raw_content: "markdown",
        include_domains: sourceDefinitions.map((item) => item.domain),
        start_date: "2026-01-01",
        end_date: "2026-12-31"
      }),
      signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) throw new Error(`TAVILY_SEARCH_FAILED_${response.status}`);
      return response.json();
    }));

    for (const payload of payloads) {
      for (const result of Array.isArray(payload.results) ? payload.results : []) {
        const url = canonicalizeSourceUrl(result.url);
        byUrl.set(url, { ...result, url });
      }
    }
    console.log(`[web-bank] ${subject}: searched ${Math.min(offset + batch.length, queries.length)}/${queries.length}, candidates ${byUrl.size}`);
  }

  const results = [...byUrl.values()];
  const extractUrls = results
    .map((result) => result.url)
    .filter((url) => /https:\/\/www\.zlketang\.com\/zjkj\/(?:month_detail|practice_detail)_\d+\.html/.test(url));

  for (const extracted of await tavilyExtract(apiKey, extractUrls)) {
    const url = canonicalizeSourceUrl(extracted.url);
    const current = byUrl.get(url);
    if (current && extracted.raw_content) byUrl.set(url, { ...current, url, raw_content: extracted.raw_content });
  }

  const relatedUrls = new Set();
  for (const result of byUrl.values()) {
    const content = result.raw_content ?? "";
    for (const match of content.matchAll(/https:\/\/[^\s)\]>'"]+/g)) {
      const context = content.slice(Math.max(0, (match.index ?? 0) - 220), (match.index ?? 0) + match[0].length + 120);
      const url = canonicalizeSourceUrl(match[0].replace(/[，。；;,]+$/, ""));
      if (getSourceDefinition(url) && /2026|每日一练|章节练习|高频错题|月考|习题/.test(context) && !byUrl.has(url)) {
        relatedUrls.add(url);
      }
    }
  }

  for (const extracted of await tavilyExtract(apiKey, [...relatedUrls].slice(0, 120))) {
    if (!extracted.raw_content) continue;
    const url = canonicalizeSourceUrl(extracted.url);
    const title = extracted.raw_content.match(/^#\s+(.+)$/m)?.[1] ?? url;
    byUrl.set(url, { title, url, raw_content: extracted.raw_content });
  }

  return [...byUrl.values()];
}

function readExistingBank() {
  if (!fs.existsSync(outputFile)) return { builtAt: "", version: 1, questions: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(outputFile, "utf8"));
    return { builtAt: parsed.builtAt ?? "", version: 1, questions: Array.isArray(parsed.questions) ? parsed.questions : [] };
  } catch {
    return { builtAt: "", version: 1, questions: [] };
  }
}

function acquireLock() {
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    fs.writeFileSync(lockFile, `${process.pid}\n${new Date().toISOString()}`, { flag: "wx" });
    return true;
  } catch {
    const age = fs.existsSync(lockFile) ? Date.now() - fs.statSync(lockFile).mtimeMs : 0;
    if (age > 10 * 60 * 1000) {
      fs.rmSync(lockFile, { force: true });
      return acquireLock();
    }
    return false;
  }
}

function releaseLock() {
  fs.rmSync(lockFile, { force: true });
}

function buildFixturePage({ date = "2026-06-30", forbidden = false, includeAnswers = true } = {}) {
  const answerBlocks = includeAnswers ? `
【正确答案】B
【答案解析】流动比率属于短期偿债能力指标。
【多项选择题】第4章 筹资管理中，属于债务筹资特点的有（ ）。
A.需要还本 B.需要付息 C.不会分散控制权 D.没有财务风险
【正确答案】A、B、C
【答案解析】债务筹资需要还本付息，通常不会分散控制权，但会增加财务风险。
【判断题】第5章 投资管理中，净现值大于零的独立项目通常具有财务可行性。
【正确答案】正确
【答案解析】净现值大于零表示项目收益超过必要报酬要求。
【计算分析题】第6章 营运资金管理。某企业流动资产为300万元，流动负债为150万元。\n要求：（1）计算流动比率。
【参考答案】流动比率=300÷150=2。
【答案解析】计算时流动资产作为分子，流动负债作为分母。
【综合题】第9章 财务分析与评价。某公司营业收入1000万元，平均资产500万元，净利润100万元。\n要求：（1）计算总资产周转率；（2）计算销售净利率。
【参考答案】（1）总资产周转率=1000÷500=2；（2）销售净利率=100÷1000=10%。
【答案解析】分别按照营业收入除以平均资产、净利润除以营业收入计算。` : "";
  return `${date} 2026年中级会计财务管理练习题
【单项选择题】第9章 财务分析与评价中，流动资产为200万元，流动负债为100万元，流动比率为（ ）。
A.0.5 B.2 C.100 D.300${answerBlocks}${forbidden ? "\n本文禁止任何形式转载。" : ""}`;
}

function runSelfTest() {
  const valid = parseSourcePage({
    expectedSubject: "财务管理",
    title: "2026年中级会计财务管理练习题",
    url: "https://www.hqwx.com/example/2026-test.html",
    rawContent: buildFixturePage()
  });
  const old = parseSourcePage({ expectedSubject: "财务管理", title: "2025练习", url: "https://www.hqwx.com/example/old.html", rawContent: buildFixturePage({ date: "2025-06-30" }) });
  const oldWithCurrentSidebar = parseSourcePage({
    expectedSubject: "财务管理",
    title: "2025练习",
    url: "https://www.hqwx.com/example/old-sidebar.html",
    rawContent: `${buildFixturePage({ date: "2025-06-30" })}\n相关推荐：2026年新题 2026-07-10`
  });
  const missingAnswer = parseSourcePage({ expectedSubject: "财务管理", title: "2026练习", url: "https://www.hqwx.com/example/missing.html", rawContent: buildFixturePage({ includeAnswers: false }) });
  const forbidden = parseSourcePage({ expectedSubject: "财务管理", title: "2026练习", url: "https://www.hqwx.com/example/forbidden.html", rawContent: buildFixturePage({ forbidden: true }) });
  const loose = parseSourcePage({
    expectedSubject: "中级会计实务",
    title: "2026年中级会计实务高频错题",
    url: "https://www.zlketang.com/zjkj/example.html",
    rawContent: `2026-06-24 09:53:15
1.下列关于会计信息质量要求的表述中，正确的有（ ）。
A.实质重于形式 B.重要性 C.谨慎性 D.可比性
【答案】ABCD
【解析】四个选项均属于会计信息质量要求。`
  });
  const types = new Set(valid.questions.map((item) => item.type));
  const expectedTypes = ["single", "multiple", "judge", "calculation", "comprehensive"];

  if (!valid.accepted || expectedTypes.some((type) => !types.has(type))) throw new Error("VALID_FIXTURE_FAILED");
  if (old.accepted || old.reason !== "NOT_PUBLISHED_IN_2026") throw new Error("OLD_YEAR_REJECTION_FAILED");
  if (oldWithCurrentSidebar.accepted || oldWithCurrentSidebar.reason !== "NOT_PUBLISHED_IN_2026") throw new Error("SIDEBAR_DATE_REJECTION_FAILED");
  if (missingAnswer.accepted) throw new Error("MISSING_ANSWER_REJECTION_FAILED");
  if (forbidden.accepted || forbidden.reason !== "REUSE_FORBIDDEN") throw new Error("FORBIDDEN_REUSE_REJECTION_FAILED");
  if (!loose.accepted || loose.questions[0]?.type !== "multiple") throw new Error("LOOSE_FORMAT_FAILED");

  console.log(JSON.stringify({ ok: true, acceptedTypes: expectedTypes, looseFormat: loose.questions.length, rejected: [old.reason, missingAnswer.reason, forbidden.reason] }, null, 2));
}

async function sync() {
  loadEnvFile(path.join(projectRoot, ".env"));
  loadEnvFile(path.join(projectRoot, ".env.local"));
  const apiKey = process.env.TAVILY_API_KEY ?? "";
  if (!apiKey || apiKey.startsWith("placeholder") || apiKey === "your-tavily-api-key") throw new Error("TAVILY_API_KEY_REQUIRED");
  if (!acquireLock()) {
    console.log("web question bank sync already running");
    return;
  }

  try {
    const existing = process.argv.includes("--rebuild")
      ? { builtAt: "", version: 1, questions: [] }
      : readExistingBank();
    const found = [];
    const rejected = {};
    const rejectedExamples = {};

    for (const subject of Object.keys(chapterOrder)) {
      const results = await tavilySearch(apiKey, subject);
      for (const result of results) {
        const rawContent = result.raw_content ?? result.content ?? "";
        const parsed = parseSourcePage({
          expectedSubject: detectSubject(result.title, rawContent) ?? subject,
          title: result.title,
          url: result.url,
          rawContent,
          publishedDate: result.published_date
        });
        if (parsed.accepted) found.push(...parsed.questions);
        else {
          rejected[parsed.reason] = (rejected[parsed.reason] ?? 0) + 1;
          rejectedExamples[parsed.reason] ??= [];
          if (rejectedExamples[parsed.reason].length < 5) rejectedExamples[parsed.reason].push({ title: result.title, url: result.url });
        }
      }
    }

    const byHash = new Map();
    for (const question of [...existing.questions, ...found]) {
      if (question.publishedAt?.startsWith("2026-") && question.contentHash) byHash.set(question.contentHash, question);
    }
    const questions = [...byHash.values()].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
    const payload = { builtAt: new Date().toISOString(), version: 1, questions };
    const temporaryFile = `${outputFile}.tmp`;
    fs.writeFileSync(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`);
    fs.renameSync(temporaryFile, outputFile);
    console.log(JSON.stringify({ ok: true, added: found.length, total: questions.length, rejected, rejectedExamples, outputFile }, null, 2));
  } finally {
    releaseLock();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
  } else {
    await sync();
  }
}
