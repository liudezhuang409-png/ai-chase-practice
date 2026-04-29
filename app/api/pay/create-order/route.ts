import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import { createOrder } from "@/lib/payments";
import { getUserPlan } from "@/lib/quota";

const bodySchema = z.object({
  channel: z.enum(["alipay", "wechat", "mock"])
});

export async function POST(request: Request) {
  try {
    const user = await getApiUser();
    const body = bodySchema.parse(await request.json());
    const plan = await getUserPlan(user.id);

    if (plan === "pro") {
      return NextResponse.json(
        {
          error: "你已经是 Pro 用户，无需重复支付。"
        },
        { status: 409 }
      );
    }

    const order = await createOrder(user.id, body.channel);

    return NextResponse.json(order);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        {
          error: "请先登录后再创建订单。"
        },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          error: "支付渠道参数不正确。"
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "创建订单失败，请稍后重试。"
      },
      { status: 500 }
    );
  }
}
