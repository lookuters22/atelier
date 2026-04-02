import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "../lib/supabase";

export function LoginPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleAuth() {
    try {
      setError(null);
      setIsLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/today` },
      });
      if (error) throw error;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleContinueWithEmail() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Please enter your email address.");
      return;
    }

    try {
      setError(null);
      setIsLoading(true);
      const { data, error } = await supabase.rpc("check_user_exists", {
        lookup_email: trimmed,
      });
      if (error) throw error;
      setIsExistingUser(!!data);
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not verify email.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmitCredentials() {
    if (!password) {
      setError("Please enter a password.");
      return;
    }
    if (!isExistingUser && !agreedToTerms) {
      setError("You must agree to the terms to create an account.");
      return;
    }

    try {
      setError(null);
      setIsLoading(true);
      if (isExistingUser) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setIsLoading(false);
    }
  }

  function goBack() {
    setStep(1);
    setPassword("");
    setError(null);
    setAgreedToTerms(false);
  }

  const inputClasses =
    "w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-[13px] font-medium text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/20 transition";

  const primaryBtnClasses =
    "inline-flex w-full items-center justify-center gap-3 rounded-full bg-white px-6 py-3 text-[13px] font-semibold text-sidebar shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_2px_4px_rgba(0,0,0,0.1),0_12px_32px_rgba(0,0,0,0.25)] transition-all hover:bg-white/95 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_2px_4px_rgba(0,0,0,0.1),0_16px_40px_rgba(0,0,0,0.3)] disabled:cursor-not-allowed disabled:opacity-50";

  const secondaryBtnClasses =
    "inline-flex w-full items-center justify-center gap-3 rounded-full border border-white/10 bg-white/[0.05] px-6 py-3 text-[13px] font-semibold text-white transition-all hover:bg-white/10 hover:border-white/15 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[#0d0f13] px-6">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-5%,rgba(59,78,208,0.15),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(30,33,41,0.8),transparent)]" />

      <div className="relative z-10 flex w-full max-w-[400px] flex-col items-center">
        {/* Logo mark */}
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.07] text-[15px] font-semibold tracking-tight text-white ring-1 ring-white/[0.08]">
          A
        </div>

        {/* Title */}
        <h1 className="mt-5 text-center text-base font-semibold tracking-tight text-white">
          Atelier Studio OS
        </h1>
        <p className="mt-1.5 text-center text-[13px] text-white/40">
          {step === 1
            ? "Sign in or create your account"
            : isExistingUser
              ? "Welcome back"
              : "Create your account"}
        </p>

        {/* Card */}
        <div className="mt-8 w-full rounded-2xl border border-white/[0.06] bg-white/[0.025] p-6 shadow-[0_0_0_1px_rgba(0,0,0,0.3),0_8px_40px_-12px_rgba(0,0,0,0.5)] backdrop-blur-sm sm:p-8">
          {/* Error banner */}
          {error && (
            <div className="mb-5 w-full rounded-lg border border-red-500/20 bg-red-500/[0.08] px-4 py-2.5 text-center text-[12px] font-medium text-red-300">
              {error}
            </div>
          )}

          {step === 1 ? (
            <>
              {/* Google OAuth */}
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isLoading}
                className={primaryBtnClasses}
              >
                {isLoading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-sidebar/20 border-t-sidebar" />
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                )}
                {isLoading ? "Redirecting\u2026" : "Continue with Google"}
              </button>

              {/* Divider */}
              <div className="my-5 flex items-center gap-4">
                <div className="h-px flex-1 bg-white/[0.06]" />
                <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/20">or</span>
                <div className="h-px flex-1 bg-white/[0.06]" />
              </div>

              {/* Email input */}
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleContinueWithEmail();
                }}
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@studio.com"
                  autoComplete="email"
                  className={inputClasses}
                />
                <button type="submit" disabled={isLoading} className={secondaryBtnClasses}>
                  {isLoading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  ) : null}
                  {isLoading ? "Checking\u2026" : "Continue with email"}
                </button>
              </form>
            </>
          ) : (
            <>
              {/* Back button */}
              <button
                type="button"
                onClick={goBack}
                className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-white/40 transition hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
                Back
              </button>

              {/* Email display */}
              <div className="mb-4 w-full rounded-lg border border-white/[0.06] bg-black/20 px-4 py-2.5 text-[13px] font-medium text-white/45">
                {email}
              </div>

              {/* Password form */}
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmitCredentials();
                }}
              >
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete={isExistingUser ? "current-password" : "new-password"}
                  autoFocus
                  className={inputClasses}
                />

                {!isExistingUser && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-white/20 bg-black/30 accent-white"
                    />
                    <span className="text-[12px] leading-relaxed text-white/35">
                      I agree to the{" "}
                      <span className="font-semibold text-white/55 hover:text-white/70">Terms of Service</span>{" "}
                      and{" "}
                      <span className="font-semibold text-white/55 hover:text-white/70">Privacy Policy</span>
                    </span>
                  </label>
                )}

                <button
                  type="submit"
                  disabled={isLoading || (!isExistingUser && !agreedToTerms)}
                  className={primaryBtnClasses}
                >
                  {isLoading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-sidebar/20 border-t-sidebar" />
                  ) : null}
                  {isLoading
                    ? isExistingUser
                      ? "Logging in\u2026"
                      : "Creating account\u2026"
                    : isExistingUser
                      ? "Log In"
                      : "Create Account"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className="relative z-10 mt-10 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-white/15">
        Intelligent Studio Management
      </p>
    </div>
  );
}
