# Exam OS｜中级会计章节掌握提分系统

本系统不是刷题工具，而是一个基于章节掌握度模型的考试提分决策系统。

目标：帮助用户从“盲目刷题”转向“路径化提分学习”。

## 核心闭环

1. Dashboard 根据章节掌握度找出最危险章节。
2. 今日学习路径只安排三件优先级最高的任务。
3. 默认先做本地资料原题；答错后匹配2026年公开发布、带原答案和原解析的同类练习题。
4. 答错自动进入错题本并降低章节掌握度；答对、复盘和标记掌握会提升掌握度。
5. 模考成绩用于验证三科学习结果和趋势。

## 技术栈

- Next.js 15 App Router
- React 19
- Tailwind CSS 4
- Supabase Auth + PostgreSQL
- DeepSeek OpenAI-compatible API
- Vercel

## 核心页面

- `/` Dashboard
- `/practice` 做题练习
- `/chapters` 章节掌握
- `/mistakes` 错题本
- `/study-logs` 学习记录
- `/mock-exams` 模考记录

## 数据库

全量初始化：`supabase/schema.sql`

已有项目升级：`supabase/migrations/20260624_exam_os_v1.sql`

核心表：`users`、`chapters`、`mistakes`、`study_logs`、`mock_exams`。旧做题会话表继续作为 DeepSeek 练习引擎的内部存储。

掌握度：`0.5 × correct_rate + 0.3 × review_rate + 0.2 × trend_score`。

今日优先级：`0.5 × wrong_count_score + 0.3 × last_review_gap_score + 0.2 × exam_weight`。

## 环境变量

复制 `.env.example` 为 `.env.local`，配置 Supabase、DeepSeek 与 Tavily：

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
TAVILY_API_KEY=
APP_URL=http://localhost:3000
```

首次使用2026公开题前运行：

```bash
npm run web-bank:sync
```

网页题库只保存在本机 `data/web-question-bank/`，不会提交到 Git。同步器只收录2026年发布、正文中同时包含题干、答案和解析且允许个人学习使用的页面；缺答案、年份不明、付费墙和禁止转载页面会被拒绝。

## 本地运行

```bash
npm install
npm run dev
```

后台常驻：

```bash
npm run build
npm run server:restart
```

## 部署

1. 在 Supabase SQL Editor 执行迁移文件。
2. 在 Vercel 配置环境变量。
3. 导入 Git 仓库并部署；无需本地文件系统持久化。
