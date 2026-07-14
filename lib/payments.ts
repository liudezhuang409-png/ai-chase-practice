import { supabaseAdmin } from "@/lib/supabase/admin";
import { createDemoOrder, getDemoOrder, markDemoOrderPaid } from "@/lib/demo";
import type {
  CreateOrderResponse,
  PaymentChannel,
  PaymentOrder,
  PaymentOrderStatus
} from "@/lib/types";
import { createOrderNo } from "@/lib/utils";
import { serverEnv } from "@/lib/env";

export const PRO_PRICE_FEN = 990;

function getMockPayUrl(orderNo: string) {
  return `${serverEnv.APP_URL}/pay?orderNo=${orderNo}&mockPay=1`;
}

export async function createOrder(
  userId: string,
  channel: PaymentChannel
): Promise<CreateOrderResponse> {
  if (userId === "demo-user") {
    return createDemoOrder(userId, channel);
  }

  const orderNo = createOrderNo();
  const planTarget = "pro";
  const amountFen = PRO_PRICE_FEN;
  const providerPayload =
    channel === "mock"
      ? { mode: "mock" }
      : { mode: "reserved", note: "Real provider keys are not configured in this MVP." };

  const { error } = await supabaseAdmin.from("payment_orders").insert({
    user_id: userId,
    order_no: orderNo,
    channel,
    plan_target: planTarget,
    amount_fen: amountFen,
    status: "pending",
    provider_payload: providerPayload
  });

  if (error) {
    throw new Error("FAILED_TO_CREATE_ORDER");
  }

  return {
    orderNo,
    channel,
    status: "pending",
    payUrl: getMockPayUrl(orderNo),
    qrPayload: `mock:${channel}:${orderNo}`,
    amountFen
  };
}

export async function getOrderForUser(orderNo: string, userId: string) {
  if (userId === "demo-user") {
    return getDemoOrder(orderNo, userId);
  }

  const { data, error } = await supabaseAdmin
    .from("payment_orders")
    .select("*")
    .eq("order_no", orderNo)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("FAILED_TO_READ_ORDER");
  }

  return (data as PaymentOrder | null) ?? null;
}

export async function markOrderPaid(params: {
  orderNo: string;
  channel: PaymentChannel;
  payload: Record<string, unknown>;
}) {
  if (typeof params.payload.userId === "string" && params.payload.userId === "demo-user") {
    const order = markDemoOrderPaid(params.orderNo, params.payload.userId);

    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }

    return order;
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from("payment_orders")
    .select("*")
    .eq("order_no", params.orderNo)
    .maybeSingle();

  if (orderError || !order) {
    throw new Error("ORDER_NOT_FOUND");
  }

  if (order.status === "paid") {
    return order as PaymentOrder;
  }

  if (order.status === "closed") {
    throw new Error("ORDER_NOT_PAYABLE");
  }

  const providerTradeNo =
    typeof params.payload.providerTradeNo === "string"
      ? params.payload.providerTradeNo
      : `mock_trade_${params.orderNo}`;

  const { data: updatedOrder, error: updateError } = await supabaseAdmin
    .from("payment_orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      channel: params.channel,
      provider_trade_no: providerTradeNo,
      provider_payload: params.payload
    })
    .eq("id", order.id)
    .neq("status", "paid")
    .select("*")
    .maybeSingle();

  if (updateError) {
    throw new Error("FAILED_TO_UPDATE_ORDER");
  }

  await supabaseAdmin
    .from("users")
    .update({
      plan: order.plan_target,
      is_paid: true,
      plan_expires_at: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", order.user_id);

  return ((updatedOrder as PaymentOrder | null) ?? order) as PaymentOrder;
}

export async function closeExpiredOrders() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL === "https://example.supabase.co") {
    return;
  }

  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { error } = await supabaseAdmin
    .from("payment_orders")
    .update({
      status: "closed"
    })
    .eq("status", "pending")
    .lt("created_at", cutoff);

  if (error) {
    throw new Error("FAILED_TO_CLOSE_EXPIRED_ORDERS");
  }
}

export function isKnownPaymentChannel(value: string): value is PaymentChannel {
  return value === "alipay" || value === "wechat" || value === "mock";
}

export function isPaidStatus(status: PaymentOrderStatus) {
  return status === "paid";
}
