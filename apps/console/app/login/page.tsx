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
    <div className="relative flex min-h-screen w-full flex-1 flex-col overflow-hidden bg-brand-navy-deep lg:flex-row">
      {/* An eagle gliding across the full page, left off-screen to right off-screen, looping.
          Fixed positioning + a wide viewport-relative path (see .flying-eagle/@keyframes
          fly-across in globals.css) so it crosses both panels, not just one. */}
      <div className="flying-eagle pointer-events-none fixed left-0 top-[14%] z-20" aria-hidden="true">
        <EagleMark className="h-16 w-16 lg:h-24 lg:w-24" fill="white" />
      </div>

      {/* Left: brand + form, on the navy/stars field. */}
      <div className="stars-field relative z-10 flex w-full flex-col items-center justify-center px-4 py-12 lg:w-[46%] lg:px-12">
        <div className="w-full max-w-sm space-y-6">
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

      {/* Right: the eagle, full-bleed. Photo credit: public/brand/CREDIT.md (USFWS, public
          domain, Todd Harless 2006). This panel is close to full viewport height, which is
          why it's here rather than in a short wide strip — a portrait action shot like this
          one loses everything that makes it recognizable when it's cropped down to a
          letterbox band. */}
      <div className="relative min-h-[45vh] w-full flex-1 overflow-hidden lg:min-h-screen">
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative full-bleed panel; next/image's fixed sizing fought the responsive crop here */}
        <img
          src="/brand/bald-eagle.jpg"
          alt="A bald eagle in flight against a blue sky"
          className="h-full w-full object-cover object-[62%_38%]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-navy-deep/35 via-transparent to-transparent lg:bg-gradient-to-r lg:from-brand-navy-deep/50 lg:via-transparent lg:to-transparent" />
        <div className="absolute inset-y-0 left-0 w-[3px] bg-brand-accent-red lg:block hidden" />
        <div className="absolute inset-x-0 top-0 h-[3px] bg-brand-accent-red lg:hidden" />
      </div>
    </div>
  );
}
