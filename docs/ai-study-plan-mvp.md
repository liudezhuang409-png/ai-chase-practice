# AI 定制练题计划 MVP

## 目标

在现有“错题强化”主流程外，增加一个真正可执行的 AI 定制练题计划功能。它不是独立学习系统，而是服务于：

- 帮用户决定今天先练什么
- 把薄弱考点和题型表现串成连续训练路线
- 保留用户的 DIY 自由度，但减少手动排计划负担

## 用户流程

1. 用户进入 `/plan`
2. 填写：
   - 目标分数
   - 距考试天数
   - 每天可投入时长
   - 学习风格
   - 想优先补的科目
   - 想优先补的考点
3. 前端调用 `POST /api/study-plan/generate`
4. 后端结合：
   - 用户错题数据
   - 知识点掌握情况
   - 题型正确率
   - 用户输入偏好
5. AI 输出结构化 JSON 计划
6. 计划保存到 `user_study_plans`
7. 前端展示：
   - 阶段计划
   - 今日任务
   - 每周节奏
   - AI 调整建议
8. 用户从今日任务一键跳去 `/practice` 开练

## 页面结构

### `/plan`

- 顶部介绍卡
- 左侧：计划输入
- 右侧：当前设置与 AI 推荐原因
- 右栏：最近一次计划概览
- 下方：今日任务 / AI 调整建议 / 每周路线

### 首页

- 增加 `AI 定制练题计划` 入口卡
- 已有计划时显示：
  - 计划摘要
  - 目标分数
  - 剩余天数
  - 今天的前 1-2 个任务
- 无计划时显示：
  - 生成专属计划 CTA

## 数据表

`public.user_study_plans`

- `id`
- `user_id`
- `plan_name`
- `target_exam`
- `target_score`
- `days_to_exam`
- `daily_minutes`
- `study_style`
- `selected_subjects`
- `selected_topics`
- `plan_payload`
- `status`
- `created_at`
- `updated_at`

## AI 输入

- 用户输入偏好
- `weakestKnowledge`
- `typeAccuracy`

## AI 输出 JSON

```json
{
  "planName": "68天稳步提分计划",
  "strategy": "先补高频错题，再逐步提高计算分析和综合题占比。",
  "summary": "未来三周优先围绕收入、存货与长期股权投资回补基础，再进入错题强化和模考节奏。",
  "targetExam": "中级会计师",
  "targetScore": 85,
  "daysToExam": 68,
  "dailyMinutes": 45,
  "studyStyle": "mistake-first",
  "selectedSubjects": ["中级会计实务"],
  "selectedTopics": ["收入 / 收入的确认和计量的步骤"],
  "phases": [],
  "todayTasks": [],
  "weeklySchedule": [],
  "adjustments": []
}
```

## MVP 边界

本期先做：

- AI 生成计划
- 计划保存
- 首页入口
- `/plan` 页面
- 从计划任务跳转到练题页

本期不做：

- 多计划管理
- 自动版本比对
- 计划完成度打卡系统
- 真正的日历排程器
- 主观题计划单独评分模型

## 后续升级方向

1. 根据最新练习结果自动微调下一轮计划
2. 把今日任务同步到首页主卡
3. 增加计划完成率与阶段进度
4. 让模考任务自动插入计划
5. 允许用户保存多个备选计划版本
