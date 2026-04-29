"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AuthCard() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
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

    setMessage(mode === "signup" ? "注册成功，开始接受追杀。" : "登录成功，开始做题。");
    router.refresh();
    router.push("/practice");
  }

  return (
    <div
      className="panel"
      style={{
        padding: 28,
        display: "grid",
        gap: 14
      }}
    >
      <div style={{ display: "flex", gap: 10 }}>
        <button
          className="button"
          onClick={() => setMode("login")}
          style={{
            background: mode === "login" ? "rgba(255,255,255,0.12)" : undefined
          }}
        >
          登录
        </button>
        <button
          className="button"
          onClick={() => setMode("signup")}
          style={{
            background: mode === "signup" ? "rgba(255,255,255,0.12)" : undefined
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
        {loading ? "处理中..." : mode === "signup" ? "注册并开始做题" : "登录开始追杀"}
      </button>
      {message ? <div className="danger-box">{message}</div> : null}
    </div>
  );
}
