export type UserPlan = "free" | "pro";

export type PaymentChannel = "alipay" | "wechat" | "mock";
export type PaymentOrderStatus = "pending" | "paid" | "failed" | "closed";
export type PracticeSessionStatus = "generated" | "answered" | "expired";

export type QuestionPayload = {
  question: string;
  options: Record<"A" | "B" | "C" | "D", string>;
  answer: "A" | "B" | "C" | "D";
  analysis: string;
};

export type PracticeSession = {
  id: string;
  user_id: string;
  knowledge_point: string;
  question_payload: QuestionPayload;
  chase_mode: boolean;
  status: PracticeSessionStatus;
  selected_answer: "A" | "B" | "C" | "D" | null;
  is_correct: boolean | null;
  generated_at: string;
  answered_at: string | null;
};

export type PaymentOrder = {
  id: string;
  user_id: string;
  order_no: string;
  channel: PaymentChannel;
  plan_target: "pro";
  amount_fen: number;
  status: PaymentOrderStatus;
  provider_trade_no: string | null;
  provider_payload: Record<string, unknown> | null;
  created_at: string;
  paid_at: string | null;
};

export type GenerateQuestionRequest = {
  knowledgePoint: string;
  chaseMode?: boolean;
  lastWrongReason?: string;
};

export type SubmitAnswerRequest = {
  sessionId: string;
  selectedAnswer: "A" | "B" | "C" | "D";
};

export type GenerateQuestionResponse = {
  sessionId: string;
  question: QuestionPayload;
  remainingFreeQuota: number | null;
  plan: UserPlan;
  chaseMode: boolean;
};

export type SubmitAnswerResponse = {
  correct: boolean;
  correctAnswer: QuestionPayload["answer"];
  analysis: string;
  shouldChase: boolean;
  nextPromptHint: string;
};

export type CreateOrderResponse = {
  orderNo: string;
  channel: PaymentChannel;
  status: PaymentOrderStatus;
  payUrl: string | null;
  qrPayload: string | null;
  amountFen: number;
};
