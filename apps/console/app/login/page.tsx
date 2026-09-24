"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";

const DEMO_ACCOUNTS = [
  { label: "Field director", email: "director@demo.local", role: "field_director" },
  { label: "Team lead", email: "lead@demo.local", role: "team_lead" },
  { label: "Canvasser", email: "canvasser@demo.local", role: "canvasser" },
];
const DEMO_PASSWORD = "devpassword";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace("/live-ops");
  }, [loading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/live-ops");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 0
            ? "Can't reach the API. Is it running at " +
                (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001") +
                "?"
            : err.message
        );
      } else {
        setError("Login failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-brand-cream px-4 py-12">
      <div className="w-full max-w-sm space-y-7">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-navy font-display text-base font-semibold tracking-wide text-white shadow-sm">
            GB
          </div>
          <h1 className="font-display text-2xl font-semibold text-brand-ink">
            Field Console
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">Sign in to manage today&apos;s canvass.</p>
          <div className="tricolor-rule mx-auto mt-5 w-16 rounded-full" />
        </div>

        <form onSubmit={handleSubmit} className="card-premium space-y-4 p-7">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-brand-ink focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
              placeholder="you@demo.local"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-brand-ink focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand-navy px-3 py-2.5 text-sm font-semibold tracking-wide text-white shadow-sm transition-colors hover:bg-brand-navy-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="rounded-xl border border-dashed border-brand-hairline bg-white/60 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Demo credentials
          </p>
          <ul className="space-y-1.5">
            {DEMO_ACCOUNTS.map((acct) => (
              <li key={acct.email} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-600">
                  <span className="font-medium text-slate-800">{acct.label}</span>{" "}
                  <code className="text-xs text-slate-500">{acct.email}</code>
                </span>
                <button
                  type="button"
                  onClick={() => fillDemo(acct.email)}
                  className="shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-brand-navy hover:bg-slate-100"
                >
                  Use
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">
            Password for all three: <code>{DEMO_PASSWORD}</code>
          </p>
        </div>
      </div>
    </div>
  );
}
