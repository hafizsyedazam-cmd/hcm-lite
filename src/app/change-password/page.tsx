"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { toast } from "sonner";
import { AuthLayout } from "@/components/AuthLayout";
import { useAuth } from "@/components/AuthProvider";
import { Field, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { auth } from "@/lib/client/firebase";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { me, loading, refresh, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [me, loading, router]);

  if (loading || !me) {
    return (
      <div className="splash">
        <Spinner />
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return toast.error("The two passwords do not match");
    setBusy(true);
    try {
      await api("/me/password", { body: { password } });
      // Changing the password ends old sessions, so sign in again with the new one.
      await signInWithEmailAndPassword(auth, me.email, password);
      await refresh();
      toast.success("Password changed");
      router.replace("/dashboard");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <span className="badge-soft s-warning no-dot mb-3">Action required</span>
      <h3>Choose your own password</h3>
      <p className="sub">Hi {me.name}, you signed in with a temporary password. Set a new one to continue.</p>
      <form onSubmit={submit}>
        <Field label="New password" hint="At least 8 characters.">
          <input type="password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password">
          <input type="password" className="form-control" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" />
        </Field>
        <button className="btn btn-auth" disabled={busy}>
          {busy ? "Saving..." : "Save and continue"}
        </button>
      </form>
      <button className="btn btn-link w-100 mt-2 fs-13" onClick={() => signOut().then(() => router.replace("/login"))}>
        Sign out
      </button>
    </AuthLayout>
  );
}
