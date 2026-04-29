import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import { getOrderForUser, isKnownPaymentChannel, markOrderPaid } from "@/lib/payments";

const bodySchema = z.object({
  orderNo: z.string().min(1),
  providerTradeNo: z.string().optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ channel: string }> }
) {
  const { channel } = await context.params;

  if (!isKnownPaymentChannel(channel)) {
    return NextResponse.json(
      {
        error: "未知支付渠道。"
      },
      { status: 404 }
    );
  }

  try {
    const user = await getApiUser();
    const body = bodySchema.parse(await request.json());
    const existingOrder = await getOrderForUser(body.orderNo, user.id);

    if (!existingOrder) {
      return NextResponse.json(
        {
          error: "订单不存在。"
        },
        { status: 404 }
      );
    }

    const order = await markOrderPaid({
      orderNo: body.orderNo,
      channel,
      payload: {
        providerTradeNo: body.providerTradeNo,
        notifiedAt: new Date().toISOString(),
        source: "mock-notify"
      }
    });

    return NextResponse.json({
      ok: true,
      orderNo: order.order_no,
      status: order.status
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        {
          error: "请先登录后再模拟支付。"
        },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
      return NextResponse.json(
        {
          error: "订单不存在。"
        },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message === "ORDER_NOT_PAYABLE") {
      return NextResponse.json(
        {
          error: "订单已关闭，不能再标记为已支付。"
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: "支付回调处理失败。"
      },
      { status: 500 }
    );
  }
}
