"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { EagleMark } from "@/components/brand/EagleMark";

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
    <div className="stars-field relative flex min-h-screen w-full flex-1 flex-col items-center justify-center overflow-hidden bg-brand-navy-deep px-4 py-10">
      {/* An eagle gliding across the full page, left off-screen to right off-screen, looping.
          See .flying-eagle/@keyframes fly-across in globals.css. This is the small vector
          accent; the large real photo cutout below is the main graphic. */}
      <div className="flying-eagle pointer-events-none fixed left-0 top-[10%] z-20" aria-hidden="true">
        <EagleMark className="h-14 w-14" fill="white" />
      </div>

      {/* The eagle: a transparent-background cutout (public/brand/bald-eagle-perched-cutout-v3.png,
          credit in CREDIT.md) of the bird perched on a branch rather than in flight, pinned
          large in the top-right corner rather than sitting in the centered form column — a
          corner graphic rather than a hero panel. Filename bumped each time the cutout's
          background-removal bugs got fixed so browsers that cached a broken version under
          an old filename fetch the corrected image instead of serving it from cache. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative, no next/image benefit for a fixed-position PNG cutout */}
      <img
        src="/brand/bald-eagle-perched-cutout-v3.png"
        alt=""
        className="pointer-events-none fixed right-0 top-0 z-0 h-[70vh] w-auto max-h-[640px] opacity-90 drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
      />

      <div className="relative z-10 w-full max-w-sm space-y-5">
        <div className="text-center">
          <span className="ribbon-banner">
            <span className="ribbon-banner__text">Field Operations</span>
          </span>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-wide text-white">
            Field Console
          </h1>
          <p className="mt-1.5 text-sm text-white/70">Sign in to manage today&apos;s canvass.</p>
          <div className="tricolor-rule mx-auto mt-5 w-16 rounded-full" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border-t-4 border-brand-accent-red bg-white p-7 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)]">
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

          <div className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">
              Demo credentials
            </p>
            <ul className="space-y-1.5">
              {DEMO_ACCOUNTS.map((acct) => (
                <li key={acct.email} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-white/80">
                    <span className="font-medium text-white">{acct.label}</span>{" "}
                    <code className="text-xs text-white/60">{acct.email}</code>
                  </span>
                  <button
                    type="button"
                    onClick={() => fillDemo(acct.email)}
                    className="shrink-0 rounded border border-white/25 bg-white/10 px-2 py-0.5 text-xs font-medium text-white hover:bg-white/20"
                  >
                    Use
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-white/50">
              Password for all three: <code>{DEMO_PASSWORD}</code>
            </p>
          </div>
      </div>
    </div>
  );
}
