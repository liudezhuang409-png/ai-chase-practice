"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CreateOrderResponse, PaymentChannel, PaymentOrderStatus } from "@/lib/types";
import { formatFenToYuan } from "@/lib/utils";

const CHANNEL_LABEL: Record<PaymentChannel, string> = {
  alipay: "支付宝",
  wechat: "微信支付",
  mock: "Mock 支付"
};

export function PayPanel() {
  const router = useRouter();
  const [channel, setChannel] = useState<PaymentChannel>("alipay");
  const [order, setOrder] = useState<CreateOrderResponse | null>(null);
  const [status, setStatus] = useState<PaymentOrderStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!order || status !== "pending") {
      return;
    }

    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/pay/order-status?orderNo=${order.orderNo}`);

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as { status: PaymentOrderStatus };
      setStatus(data.status);

      if (data.status === "paid") {
        router.refresh();
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [order, router, status]);

  async function handleCreateOrder() {
    setLoading(true);
    setError("");

    const response = await fetch("/api/pay/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        channel
      })
    });

    setLoading(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "创建订单失败。");
      return;
    }

    const data = (await response.json()) as CreateOrderResponse;
    setOrder(data);
    setStatus(data.status);
  }

  async function handleMockPaid() {
    if (!order) {
      return;
    }

    setLoading(true);
    setError("");

    const response = await fetch(`/api/pay/notify/${order.channel}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        orderNo: order.orderNo
      })
    });

    setLoading(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "模拟支付失败。");
      return;
    }

    setStatus("paid");
    router.refresh();
  }

  return (
    <section className="panel" style={{ padding: 36, display: "grid", gap: 24 }}>
      <div className="eyebrow">upgrade to pro</div>
      <h1 style={{ margin: 0, fontSize: "clamp(36px, 7vw, 72px)" }}>别让系统停手。</h1>
      <p className="muted" style={{ maxWidth: 700, lineHeight: 1.8 }}>
        当前先做统一订单与支付状态机。你可以选择支付宝或微信支付入口，下单后通过 mock 回调完成联调，
        未来再替换成真实商户渠道。
      </p>

      <div className="danger-box">
        Pro 套餐：{formatFenToYuan(order?.amountFen ?? 1990)} / 解锁无限追杀、无限变式题、当天不再限次。
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {(["alipay", "wechat"] as const).map((item) => (
          <button
            key={item}
            className="button"
            onClick={() => setChannel(item)}
            style={{
              background: channel === item ? "rgba(255,255,255,0.12)" : undefined
            }}
          >
            {CHANNEL_LABEL[item]}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button className="button button--danger" onClick={handleCreateOrder} disabled={loading}>
          {loading ? "创建中..." : `生成${CHANNEL_LABEL[channel]}订单`}
        </button>
        {order ? (
          <button className="button" onClick={handleMockPaid} disabled={loading || status === "paid"}>
            {status === "paid" ? "已支付" : "模拟支付成功"}
          </button>
        ) : null}
      </div>

      {order ? (
        <div className="panel" style={{ padding: 20, display: "grid", gap: 10 }}>
          <div>订单号：{order.orderNo}</div>
          <div>渠道：{CHANNEL_LABEL[order.channel]}</div>
          <div>金额：{formatFenToYuan(order.amountFen)}</div>
          <div>状态：{status ?? order.status}</div>
          {order.payUrl ? (
            <a href={order.payUrl} target="_blank" rel="noreferrer" className="muted">
              打开支付链接（当前为 mock 链接）
            </a>
          ) : null}
          {order.qrPayload ? <div className="muted">二维码载荷：{order.qrPayload}</div> : null}
        </div>
      ) : null}

      {status === "paid" ? (
        <div className="danger-box">支付成功，刷新后即可获得 Pro 无限练权限。</div>
      ) : null}
      {error ? <div className="danger-box">{error}</div> : null}
    </section>
  );
}
