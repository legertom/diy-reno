"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function DevLoginForm() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("dev-token", {
      token,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Invalid token");
    } else {
      window.location.href = "/";
    }
  }

  return (
    <div className="mt-8 border-t border-line pt-8">
      <p className="mb-3 text-[11px] font-semibold tracking-[0.12em] text-ink-faint uppercase">
        🔧 Dev login
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="password"
          placeholder="Dev token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="flex-1 rounded-full border border-line-strong bg-card px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-ink-faint"
        />
        <button
          type="submit"
          disabled={loading || !token}
          className="rounded-full border border-line-strong bg-card px-5 py-2.5 text-sm font-medium text-ink shadow-[var(--shadow-card)] transition-colors hover:border-ink disabled:opacity-40"
        >
          {loading ? "…" : "Go"}
        </button>
      </form>
      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
