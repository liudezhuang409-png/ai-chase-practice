# AI错题追杀器

一个基于 Next.js App Router + Supabase 的会计考试刷题 MVP。

## 当前能力

- 用户登录/注册
- 输入会计知识点后，AI 生成标准 JSON 单选题
- 答错后进入 chase 追杀模式，继续围绕同知识点生成变式题
- 免费用户每天 2 次出题机会
- Pro 用户无限练
- 支付已接入统一订单状态机，支持支付宝/微信支付双通道预留与 mock 联调

## 启动

1. 安装依赖
2. 复制 `.env.example` 为 `.env.local`
3. 在 Supabase SQL Editor 执行 `supabase/schema.sql`
4. 启动开发服务器

```bash
npm install
npm run dev
```

## 环境变量

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
APP_URL=http://localhost:3000
```

## 核心路由

- `/`
- `/practice`
- `/pay`
- `POST /api/generate-question`
- `POST /api/submit-answer`
- `POST /api/pay/create-order`
- `GET /api/pay/order-status`
- `POST /api/pay/notify/[channel]`

## 数据表

- `users`
- `user_knowledge`
- `practice_sessions`
- `practice_logs`
- `payment_orders`
