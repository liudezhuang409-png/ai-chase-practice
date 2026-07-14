"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasConfiguredSupabasePublicEnv } from "@/lib/setup";

export function AuthCard() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const supabaseReady = hasConfiguredSupabasePublicEnv({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  });

  async function handleSubmit() {
    if (!supabaseReady) {
      setMessage("当前仍是演示配置，接入正式环境后即可保存真实错题纠正记录。");
      return;
    }

    setLoading(true);
    setMessage("");

    const supabase = createSupabaseBrowserClient();

    const result =
      mode === "signup"
        ? await supabase.auth.signUp({
            email,
            password
          })
        : await supabase.auth.signInWithPassword({
            email,
            password
          });

    setLoading(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    setMessage(mode === "signup" ? "注册完成，开始建立你的错题纠正记录。" : "欢迎回来，继续纠正错题。");
    router.refresh();
    router.push("/practice");
  }

  async function handleDemoLogin() {
    setLoading(true);
    setMessage("");

    const response = await fetch("/api/demo/login", {
      method: "POST"
    });

    setLoading(false);

    if (!response.ok) {
      setMessage("进入演示模式失败，请刷新后重试。");
      return;
    }

    router.refresh();
    router.push("/practice");
  }

  return (
    <div className="panel section-block">
      <div className="eyebrow">account access</div>
      <div style={{ display: "grid", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 32 }}>登录后保存错题纠正记录</h2>
        <p className="helper-copy muted">
          系统会记录你错在哪一类、纠正过哪些点，以及后续变式题有没有真正改正。
        </p>
      </div>

      <div className="segment-row">
        <button
          className="button"
          onClick={() => setMode("login")}
          style={{
            background: mode === "login" ? "rgba(111,143,174,0.12)" : undefined,
            borderColor: mode === "login" ? "rgba(111,143,174,0.26)" : undefined
          }}
        >
          登录
        </button>
        <button
          className="button"
          onClick={() => setMode("signup")}
          style={{
            background: mode === "signup" ? "rgba(111,143,174,0.12)" : undefined,
            borderColor: mode === "signup" ? "rgba(111,143,174,0.26)" : undefined
          }}
        >
          注册
        </button>
      </div>

      <input
        className="input"
        placeholder="邮箱"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <input
        className="input"
        placeholder="密码"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      <button className="button button--danger" onClick={handleSubmit} disabled={loading}>
        {loading ? "处理中..." : mode === "signup" ? "注册并开始纠错" : "登录并继续纠错"}
      </button>

      {!supabaseReady ? (
        <div className="danger-box">当前为本地演示模式，你可以先直接进入体验版感受完整流程。</div>
      ) : null}

      {!supabaseReady ? (
        <button className="button" onClick={handleDemoLogin} disabled={loading}>
          {loading ? "进入中..." : "进入演示版"}
        </button>
      ) : null}

      {message ? <div className="danger-box">{message}</div> : null}
    </div>
  );
}
