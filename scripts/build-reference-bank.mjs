import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const sourceRoot = process.env.SOURCE_MATERIALS_ROOT ?? "/Users/liudezhuang/Desktop/02_学习资料";
const outputRoot = path.join(projectRoot, "data", "reference-bank");
const PDF_MAX_PAGES = Number.parseInt(process.env.PDF_MAX_PAGES ?? "30", 10);
const PDF_MAX_BYTES = Number.parseInt(process.env.PDF_MAX_BYTES ?? String(20 * 1024 * 1024), 10);
const VERBOSE = process.env.VERBOSE === "1";

const QUESTION_START_RE =
  /(?:【|『)?(?:\d{2,4}[·.])?(?:例题\d*|真题|经典题|精选题)?[·.]?(单项选择题|单选题|多项选择题|多选题|判断题)(?:】|』)?/;
const SUBJECTIVE_START_RE =
  /^(?:【|『)?(?:\d{2,4}[·.]?)?(?:例题\d*[·.]?)?(?:真题[·.]?)?(计算题|计算分析题|简答题|综合题)(?:】|』)?/;
const KNOWLEDGE_POINT_RE = /知识点[:：]\s*(.+)$/;
const OPTION_RE = /^([A-D])[.．、]\s*(.+)$/;
const ANSWER_RE = /(?:『正确答案』|正确答案[:：]?|【答案】|答案[:：]?)/;
const ANALYSIS_RE = /(?:『答案解析』|答案解析[:：]?|【解析】|解析[:：]?)/;

function matchQuestionStart(line) {
  return line.match(SUBJECTIVE_START_RE) ?? line.match(QUESTION_START_RE);
}

function walkFiles(rootDir) {
  const files = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || !fs.existsSync(current)) {
      continue;
    }

    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

function sha(input) {
  return crypto.createHash("sha1").update(input).digest("hex");
}

function detectSubject(input) {
  if (input.includes("中级会计实务") || input.includes("会计实务") || input.includes("刘阳")) {
    return "中级会计实务";
  }

  if (input.includes("财务管理") || input.includes("财管") || input.includes("达江") || input.includes("张一琳")) {
    return "财务管理";
  }

  if (
    input.includes("经济法") ||
    input.includes("公司法律制度") ||
    input.includes("公司法") ||
    input.includes("合伙企业法律制度") ||
    input.includes("黄洁洵") ||
    input.includes("杨光") ||
    input.includes("海马体")
  ) {
    return "经济法";
  }

  return "未识别科目";
}

function normalizeLine(line) {
  return line
    .replace(/\u00a0/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/[\u2028\u2029]/g, "")
    .trim();
}

function normalizeText(text) {
  return text
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function readDocxText(filePath) {
  const script = `
import sys
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P

document = Document(sys.argv[1])
lines = []
for child in document.element.body.iterchildren():
    if isinstance(child, CT_P):
        text = Paragraph(child, document).text.strip()
        if text:
            lines.append(text)
    elif isinstance(child, CT_Tbl):
        table = Table(child, document)
        for row in table.rows:
            cells = [" ".join(cell.text.split()) for cell in row.cells]
            if any(cells):
                lines.append(" | ".join(cells))

sys.stdout.write("\\n".join(lines))
`;

  const output = execFileSync("python3", ["-c", script, filePath], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 96 * 1024 * 1024
  });

  return normalizeText(output);
}

function readPdfText(filePath) {
  const script = `
import sys
import pdfplumber
path = sys.argv[1]
max_pages = int(sys.argv[2])
parts = []
with pdfplumber.open(path) as pdf:
    for page in pdf.pages[:max_pages]:
        parts.append(page.extract_text() or "")
sys.stdout.write("\\n".join(parts))
`;

  const output = execFileSync("python3", ["-c", script, filePath, String(PDF_MAX_PAGES)], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 8000,
    maxBuffer: 96 * 1024 * 1024
  });

  return normalizeText(output);
}

function shouldParsePdf(relativePath) {
  if (/精选例题|只做好题|题目/.test(relativePath)) {
    return true;
  }

  return /(经济法|合伙|公司|海马体|黄洁洵)/.test(relativePath) && /PDF笔记版/.test(relativePath);
}

function pickChapter(title, text) {
  const source = `${title}\n${text.slice(0, 2000)}`;
  const match = source.match(/第[一二三四五六七八九十百0-9]+章[ 　]*([^\n]+)/);

  if (!match) {
    return null;
  }

  return normalizeLine(match[0]);
}

function mapQuestionType(label) {
  if (label.includes("单")) {
    return "single";
  }

  if (label.includes("多")) {
    return "multiple";
  }

  if (label.includes("判断")) {
    return "judge";
  }

  if (label.includes("综合")) {
    return "comprehensive";
  }

  return "calculation";
}

function inferDifficulty(type, blockTitle) {
  if (type === "multiple") {
    return "medium";
  }

  if (type === "judge") {
    return "easy";
  }

  if (type === "single") {
    return /25·|26·|真题/.test(blockTitle) ? "medium" : "easy";
  }

  return "hard";
}

function parseAnswer(type, raw) {
  const answerText = normalizeLine(raw);

  if (type === "judge") {
    if (answerText.includes("√") || answerText.includes("正确")) {
      return true;
    }

    if (answerText.includes("×") || answerText.includes("错误")) {
      return false;
    }

    return null;
  }

  if (type === "multiple") {
    const values = [...new Set(answerText.match(/[A-D]/g) ?? [])];
    return values.length > 0 ? values : null;
  }

  const value = answerText.match(/[A-D]/)?.[0] ?? null;
  return value;
}

function isSubjectiveQuestionType(type) {
  return type === "calculation" || type === "comprehensive";
}

function isNextSubjectivePrompt(line) {
  return (
    /^(?:资料|其他资料)[一二三四五六七八九十\d]*[:：]/.test(line) ||
    /^[（(]\d+[）)]\s*(?:计算|编制|判断|说明|确定|指出|回答|列示|分析)/.test(line)
  );
}

function isSubjectiveBlockEnd(line) {
  return (
    /^第\d+讲/.test(line) ||
    /^第[一二三四五六七八九十百\d]+节/.test(line) ||
    /^[一二三四五六七八九十]+、[^（(]/.test(line) ||
    /^\d+[.．、](?!\d)[^=]/.test(line) ||
    /^[（(]\d+[）)][^=＝]{1,18}[。.]?$/.test(line)
  );
}

function isSubjectiveAnalysisStart(line) {
  return /^(?:【(?:解题思路|常见错误|试题拓展)】|涨分技巧|应试摘要)/.test(line);
}

function extractSubjectiveQuestion(block, meta, currentKnowledgePoint, questionType) {
  const headerRemainder = normalizeLine(block[0].replace(SUBJECTIVE_START_RE, ""));
  const questionLines = headerRemainder ? [headerRemainder] : [];
  const answerLines = [];
  const analysisLines = [];
  let readingAnswer = false;
  let readingAnalysis = false;

  for (let index = 1; index < block.length; index += 1) {
    const line = normalizeLine(block[index]);
    if (!line) {
      continue;
    }

    if (ANSWER_RE.test(line)) {
      readingAnswer = true;
      readingAnalysis = false;
      const remainder = normalizeLine(line.replace(ANSWER_RE, ""));
      if (remainder) {
        answerLines.push(remainder);
      }
      continue;
    }

    if (readingAnswer && isNextSubjectivePrompt(line)) {
      readingAnswer = false;
      readingAnalysis = false;
    }

    if ((readingAnswer || readingAnalysis) && isSubjectiveBlockEnd(line)) {
      break;
    }

    if (readingAnswer && isSubjectiveAnalysisStart(line)) {
      readingAnswer = false;
      readingAnalysis = true;
    }

    if (readingAnswer) {
      answerLines.push(line);
    } else if (readingAnalysis) {
      analysisLines.push(line);
    } else {
      questionLines.push(line);
    }
  }

  const question = questionLines.join("\n").trim();
  const sampleSolution = answerLines.join("\n").trim();
  if (question.length < 40 || sampleSolution.length < 20) {
    return null;
  }

  const requirementHeaderIndex = questionLines.findIndex((line) => /^要求[:：]\s*$/.test(line));
  const requirementLines = questionLines
    .filter((line, index) => {
      if (/^要求[:：]\s*\S/.test(line)) {
        return true;
      }

      if (!/^[（(]\d+[）)]/.test(line)) {
        return false;
      }

      return (
        (requirementHeaderIndex >= 0 && index > requirementHeaderIndex) ||
        /^[（(]\d+[）)]\s*(?:根据|分别|计算|编制|判断|说明|确定|指出|回答|列示|分析)/.test(line)
      );
    })
    .map((line) => line.replace(/^要求[:：]\s*/, "").trim());
  if (requirementLines.length === 0) {
    return null;
  }
  if (questionType === "comprehensive" && requirementLines.length < 2) {
    return null;
  }
  const fallbackKeyPoints = sampleSolution
    .split(/(?<=[。；])/)
    .map((line) => normalizeLine(line))
    .filter(Boolean)
    .slice(0, 4);
  const keyPoints = [...new Set(requirementLines.length >= 2 ? requirementLines : fallbackKeyPoints)].slice(0, 8);

  if (keyPoints.length < 2) {
    return null;
  }

  const normalizedKnowledge =
    currentKnowledgePoint && currentKnowledgePoint !== meta.chapter
      ? currentKnowledgePoint
      : meta.chapter ?? meta.subject;

  return {
    id: sha(`${meta.relativePath}:${normalizedKnowledge}:${question}`),
    subject: meta.subject,
    chapter: meta.chapter,
    knowledgePoint: normalizedKnowledge,
    type: questionType,
    difficulty: "hard",
    question,
    options: null,
    answer: {
      keyPoints,
      sampleSolution
    },
    analysis: analysisLines.length > 0 ? `${sampleSolution}\n${analysisLines.join("\n")}` : sampleSolution,
    source: "official",
    score: questionType === "comprehensive" ? 15 : 10,
    examTips: [],
    sourceFile: meta.relativePath,
    sourceTitle: meta.title
  };
}

function compactSnippet(text, maxLength = 280) {
  const value = normalizeLine(text).replace(/[ ]{2,}/g, " ");

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function extractKnowledgeSnippets(lines, meta) {
  const snippets = [];
  let current = null;

  function flush() {
    if (!current) {
      return;
    }

    const content = current.buffer.join(" ").trim();
    if (content) {
      snippets.push({
        id: sha(`${meta.relativePath}:${current.knowledgePoint}:${content.slice(0, 120)}`),
        subject: meta.subject,
        chapter: meta.chapter,
        knowledgePoint: current.knowledgePoint,
        sourceFile: meta.relativePath,
        sourceTitle: meta.title,
        content: compactSnippet(content, 420)
      });
    }

    current = null;
  }

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);

    if (!line) {
      continue;
    }

    const knowledgeMatch = line.match(KNOWLEDGE_POINT_RE);
    if (knowledgeMatch) {
      flush();
      current = {
        knowledgePoint: knowledgeMatch[1].replace(/[▲★]+/g, "").trim(),
        buffer: []
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (matchQuestionStart(line)) {
      flush();
      continue;
    }

    if (/^(第[一二三四五六七八九十百0-9]+节|考情分析|历年试题分析|关键考点|知识框架|课前思考)/.test(line)) {
      continue;
    }

    current.buffer.push(line);

    if (current.buffer.length >= 10) {
      flush();
    }
  }

  flush();
  return snippets;
}

function extractQuestions(lines, meta) {
  const questions = [];
  let currentKnowledgePoint = meta.chapter ?? meta.subject;

  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeLine(lines[index]);
    if (!line) {
      continue;
    }

    const knowledgeMatch = line.match(KNOWLEDGE_POINT_RE);
    if (knowledgeMatch) {
      currentKnowledgePoint = knowledgeMatch[1].replace(/[▲★]+/g, "").trim();
      continue;
    }

    const startMatch = matchQuestionStart(line);
    if (!startMatch) {
      continue;
    }

    const questionLabel = startMatch[1];
    const questionType = mapQuestionType(questionLabel);

    const block = [line];
    let cursor = index + 1;

    while (cursor < lines.length) {
      const nextLine = normalizeLine(lines[cursor]);
      if (matchQuestionStart(nextLine)) {
        break;
      }

      block.push(nextLine);
      cursor += 1;
    }

    index = cursor - 1;

    if (isSubjectiveQuestionType(questionType)) {
      const subjectiveQuestion = extractSubjectiveQuestion(
        block,
        meta,
        currentKnowledgePoint,
        questionType
      );

      if (subjectiveQuestion) {
        questions.push(subjectiveQuestion);
      }
      continue;
    }

    const answerLineIndex = block.findIndex((item) => ANSWER_RE.test(item));
    const analysisLineIndex = block.findIndex((item) => ANALYSIS_RE.test(item));

    if (answerLineIndex === -1) {
      continue;
    }

    const headerRemainder = normalizeLine(block[0].replace(startMatch[0], ""));
    const questionLines = [];
    const options = {};
    let currentOption = null;

    for (let i = 0; i < answerLineIndex; i += 1) {
      const currentLine = normalizeLine(i === 0 ? headerRemainder : block[i]);

      if (!currentLine) {
        continue;
      }

      const optionMatch = currentLine.match(OPTION_RE);
      if (optionMatch) {
        currentOption = optionMatch[1];
        options[currentOption] = optionMatch[2].trim();
        continue;
      }

      if (currentOption && !/^[『【]/.test(currentLine)) {
        options[currentOption] = `${options[currentOption]} ${currentLine}`.trim();
        continue;
      }

      currentOption = null;
      questionLines.push(currentLine);
    }

    const answerRaw = block
      .slice(answerLineIndex, analysisLineIndex === -1 ? undefined : analysisLineIndex)
      .join(" ")
      .replace(ANSWER_RE, "")
      .trim();

    const parsedAnswer = parseAnswer(questionType, answerRaw);
    if (!parsedAnswer) {
      continue;
    }

    const analysisRaw =
      analysisLineIndex === -1
        ? ""
        : block
            .slice(analysisLineIndex)
            .join(" ")
            .replace(ANALYSIS_RE, "")
            .trim();

    const question = questionLines.join(" ").trim();
    if (
      !question ||
      question.length < 12 ||
      /^(A|B|C|D)[.．、]/.test(question) ||
      /^例题\d*[·.]?\d{4}年(?:（[^）]*）)?$/.test(question) ||
      /^例题\d*[·.]?\d{4}年\s*不考虑其他因素.*(甲公司|乙公司|该|2×)/.test(question)
    ) {
      continue;
    }

    if ((questionType === "single" || questionType === "multiple") && Object.keys(options).length < 2) {
      continue;
    }

    if (!analysisRaw || analysisRaw.length < 6) {
      continue;
    }

    const normalizedKnowledge =
      currentKnowledgePoint && currentKnowledgePoint !== meta.chapter ? currentKnowledgePoint : meta.chapter ?? meta.subject;

    questions.push({
      id: sha(`${meta.relativePath}:${normalizedKnowledge}:${question}`),
      subject: meta.subject,
      chapter: meta.chapter,
      knowledgePoint: normalizedKnowledge,
      type: questionType,
      difficulty: inferDifficulty(questionType, block[0]),
      question,
      options:
        questionType === "judge"
          ? {
              A: "正确",
              B: "错误"
            }
          : options,
      answer: parsedAnswer,
      analysis: analysisRaw,
      source: "official",
      score: questionType === "multiple" ? 2 : 1,
      examTips: [],
      sourceFile: meta.relativePath,
      sourceTitle: meta.title
    });
  }

  return questions;
}

function buildMaterialMetadata(filePath) {
  const relativePath = path.relative(sourceRoot, filePath);
  const extension = path.extname(filePath).toLowerCase();
  const title = path.basename(filePath, extension);
  return {
    id: sha(relativePath),
    relativePath,
    title,
    extension: extension.replace(".", ""),
    subject: detectSubject(relativePath),
    chapter: null
  };
}

function buildSummary(materials, snippets, questions) {
  const bySubject = new Map();
  const byType = new Map();

  for (const item of questions) {
    bySubject.set(item.subject, (bySubject.get(item.subject) ?? 0) + 1);
    byType.set(item.type, (byType.get(item.type) ?? 0) + 1);
  }

  return {
    builtAt: new Date().toISOString(),
    sourceRoot,
    totalMaterials: materials.length,
    docxMaterials: materials.filter((item) => item.extension === "docx").length,
    pdfMaterials: materials.filter((item) => item.extension === "pdf").length,
    pdfMaxPages: PDF_MAX_PAGES,
    pdfMaxBytes: PDF_MAX_BYTES,
    skippedMaterials: materials.filter((item) => item.skippedReason || item.error).length,
    snippetCount: snippets.length,
    questionCount: questions.length,
    questionCountBySubject: Object.fromEntries([...bySubject.entries()].sort((a, b) => b[1] - a[1])),
    questionCountByType: Object.fromEntries([...byType.entries()].sort((a, b) => b[1] - a[1]))
  };
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function main() {
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`source materials folder not found: ${sourceRoot}`);
  }

  const files = walkFiles(sourceRoot);
  const materials = [];
  const snippets = [];
  const questions = [];
  const dedupedQuestions = new Set();

  for (const filePath of files) {
    const extension = path.extname(filePath).toLowerCase();
    if (![".docx", ".pdf"].includes(extension)) {
      continue;
    }

    const meta = buildMaterialMetadata(filePath);
    if (VERBOSE) {
      console.error(`[reference:build] ${materials.length + 1}/${files.length} ${meta.relativePath}`);
    }

    if (extension === ".pdf" && !shouldParsePdf(meta.relativePath)) {
      meta.skippedReason = "PDF 非优先题源，先登记来源但不解析";
      materials.push(meta);
      continue;
    }

    if (extension === ".pdf" && fs.statSync(filePath).size > PDF_MAX_BYTES) {
      meta.skippedReason = `PDF 超过 ${Math.round(PDF_MAX_BYTES / 1024 / 1024)}MB，先登记来源但不全量解析`;
      materials.push(meta);
      continue;
    }

    try {
      const text = extension === ".docx" ? readDocxText(filePath) : readPdfText(filePath);
      const lines = text.split("\n");
      if (meta.subject === "未识别科目") {
        meta.subject = detectSubject(`${meta.title}\n${text.slice(0, 12000)}`);
      }
      meta.chapter = pickChapter(meta.title, text);

      const extractedSnippets = extractKnowledgeSnippets(lines, meta);
      const extractedQuestions = extractQuestions(lines, meta);

      snippets.push(...extractedSnippets);

      for (const item of extractedQuestions) {
        if (dedupedQuestions.has(item.id)) {
          continue;
        }

        dedupedQuestions.add(item.id);
        questions.push(item);
      }
    } catch (error) {
      meta.error = error instanceof Error ? error.message : String(error);
    }

    materials.push(meta);
  }

  const summary = buildSummary(materials, snippets, questions);
  fs.mkdirSync(outputRoot, { recursive: true });

  writeJson(path.join(outputRoot, "reference-bank.json"), {
    builtAt: summary.builtAt,
    sourceRoot: summary.sourceRoot,
    materials,
    snippets,
    questions,
    summary
  });

  writeJson(path.join(outputRoot, "summary.json"), summary);

  console.log(
    JSON.stringify(
      {
        outputRoot,
        summary
      },
      null,
      2
    )
  );
}

main();
