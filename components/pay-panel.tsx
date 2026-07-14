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
    <section className="correction-side-panel">
      <div className="section-heading">
        <span className="eyebrow">checkout</span>
        <h2>开通 9.9 会员</h2>
      </div>
      <p className="helper-copy muted">开通后，错题分析、错误类型纠正和变式题训练不再限制次数。</p>

      <div className="danger-box">订单金额：{formatFenToYuan(order?.amountFen ?? 990)}</div>

      <div className="segment-row">
        {(["alipay", "wechat"] as const).map((item) => (
          <button
            key={item}
            className="button"
            onClick={() => setChannel(item)}
            style={{
              background: channel === item ? "rgba(111,143,174,0.12)" : undefined,
              borderColor: channel === item ? "rgba(111,143,174,0.28)" : undefined
            }}
          >
            {CHANNEL_LABEL[item]}
          </button>
        ))}
      </div>

      <div className="page-actions">
        <button className="button button--danger" onClick={handleCreateOrder} disabled={loading}>
          {loading ? "创建中..." : `生成${CHANNEL_LABEL[channel]}订单`}
        </button>
        {order ? (
          <button className="button" onClick={handleMockPaid} disabled={loading || status === "paid"}>
            {status === "paid" ? "已完成支付" : "模拟支付成功"}
          </button>
        ) : null}
      </div>

      {order ? (
        <div className="status-box">
          订单号：{order.orderNo}
          <br />
          支付渠道：{CHANNEL_LABEL[order.channel]}
          <br />
          订单状态：{status ?? order.status}
        </div>
      ) : null}

      {status === "paid" ? <div className="danger-box">支付成功，会员权益已生效。</div> : null}
      {error ? <div className="danger-box">{error}</div> : null}
    </section>
  );
}
