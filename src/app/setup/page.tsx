"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { toast } from "sonner";
import { AuthLayout } from "@/components/AuthLayout";
import { Field, Spinner } from "@/components/ui";
import { auth } from "@/lib/client/firebase";
import { errorMessage } from "@/lib/client/api";

const ZONES = ["Asia/Karachi", "Asia/Dubai", "Asia/Riyadh", "Asia/Kolkata", "Europe/London", "America/New_York", "UTC"];

export default function SetupPage() {
  const router = useRouter();
  const [status, setStatus] = useState<{ setupComplete: boolean; adminFromEnv: boolean } | null>(null);
  const [form, setForm] = useState({ companyName: "", adminName: "", adminEmail: "", adminPassword: "", timezone: "Asia/Karachi" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((s) => (s.setupComplete ? router.replace("/login") : setStatus(s)))
      .catch(() => setStatus({ setupComplete: false, adminFromEnv: false }));
  }, [router]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(status?.adminFromEnv ? { companyName: form.companyName, adminName: form.adminName, timezone: form.timezone } : form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup failed");
      toast.success("Company created. Welcome to HCM Lite!");
      if (status?.adminFromEnv) {
        router.replace("/login");
      } else {
        await signInWithEmailAndPassword(auth, form.adminEmail, form.adminPassword);
        router.replace("/settings?welcome=1");
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <div className="splash">
        <Spinner />
      </div>
    );
  }

  return (
    <AuthLayout>
      <span className="badge-soft s-primary no-dot mb-3">First-run setup</span>
      <h3>Set up your company</h3>
      <p className="sub">The system starts empty. Create the company and the Admin account to begin.</p>
      <form onSubmit={submit}>
        <Field label="Company name">
          <input className="form-control" value={form.companyName} onChange={set("companyName")} required minLength={2} placeholder="e.g. Saylani Tech" />
        </Field>
        <Field label="Time zone" hint="Used to stamp check-in times and decide late arrivals.">
          <select className="form-select" value={form.timezone} onChange={set("timezone")}>
            {ZONES.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </Field>
        <Field label="Admin full name">
          <input className="form-control" value={form.adminName} onChange={set("adminName")} required minLength={2} placeholder="Your name" />
        </Field>
        {status.adminFromEnv ? (
          <div className="alert alert-info fs-13">The Admin email and password are read from ADMIN_EMAIL / ADMIN_PASSWORD in the server env file.</div>
        ) : (
          <>
            <Field label="Admin email">
              <input type="email" className="form-control" value={form.adminEmail} onChange={set("adminEmail")} required placeholder="admin@company.com" autoComplete="username" />
            </Field>
            <Field label="Admin password" hint="At least 8 characters.">
              <input type="password" className="form-control" value={form.adminPassword} onChange={set("adminPassword")} required minLength={8} autoComplete="new-password" />
            </Field>
          </>
        )}
        <button className="btn btn-auth" disabled={busy}>
          {busy ? "Creating company..." : "Create company & Admin"}
        </button>
      </form>
    </AuthLayout>
  );
}
