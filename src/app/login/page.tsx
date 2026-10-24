"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { IconArrowRight, IconEye, IconEyeOff, IconInfoCircle, IconLock, IconMail } from "@tabler/icons-react";
import { AuthLayout } from "@/components/AuthLayout";
import { useAuth } from "@/components/AuthProvider";
import { Field } from "@/components/ui";
import { auth } from "@/lib/client/firebase";

export default function LoginPage() {
  const router = useRouter();
  const { me, loading, error: authError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((s) => (s.setupComplete ? setCompany(s.companyName) : router.replace("/setup")))
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    if (!loading && me) router.replace(me.mustChangePassword ? "/change-password" : "/dashboard");
  }, [me, loading, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(
        code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")
          ? "Email or password is incorrect"
          : code.includes("user-disabled")
            ? "This account has been deactivated. Contact your Admin."
            : code.includes("too-many-requests")
              ? "Too many attempts. Please wait a minute and try again."
              : "Could not sign in. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="card-logo">H</div>
      <h3>Welcome back 👋</h3>
      <p className="sub">{company ? `Sign in to ${company}'s HR portal` : "Sign in to your HR portal"}</p>

      {(error || authError) && <div className="alert alert-danger fs-13 py-2">{error || authError}</div>}

      <form onSubmit={submit}>
        <Field label="Email address">
          <div className="input-icon">
            <IconMail size={18} />
            <input type="email" className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" placeholder="you@company.com" autoFocus />
          </div>
        </Field>
        <Field label="Password">
          <div className="input-icon">
            <IconLock size={18} />
            <input type={show ? "text" : "password"} className="form-control pe-5" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" placeholder="••••••••" />
            <button type="button" className="toggle-eye" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
              {show ? <IconEyeOff size={18} /> : <IconEye size={18} />}
            </button>
          </div>
        </Field>
        <button className="btn btn-auth mt-2" disabled={busy || loading}>
          {busy ? "Signing in..." : (
            <>
              Sign in <IconArrowRight size={18} />
            </>
          )}
        </button>
      </form>

      <div className="auth-note">
        <IconInfoCircle size={18} />
        <span>New employee? HR shares a temporary password with you. You&apos;ll set your own password on first sign-in.</span>
      </div>
      <div className="auth-foot">Secured with Firebase Authentication · HCM Lite</div>
    </AuthLayout>
  );
}
