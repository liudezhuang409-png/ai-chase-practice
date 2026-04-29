import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { closeExpiredOrders, getOrderForUser } from "@/lib/payments";

export async function GET(request: Request) {
  try {
    const user = await getApiUser();
    const { searchParams } = new URL(request.url);
    const orderNo = searchParams.get("orderNo");

    if (!orderNo) {
      return NextResponse.json(
        {
          error: "缺少订单号。"
        },
        { status: 400 }
      );
    }

    await closeExpiredOrders();
    const order = await getOrderForUser(orderNo, user.id);

    if (!order) {
      return NextResponse.json(
        {
          error: "订单不存在。"
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      orderNo: order.order_no,
      status: order.status,
      channel: order.channel,
      amountFen: order.amount_fen,
      paidAt: order.paid_at
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        {
          error: "请先登录后再查看订单状态。"
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "读取订单状态失败。"
      },
      { status: 500 }
    );
  }
}
