import type { ReactNode } from "react";
import { IconCalendarCheck, IconCash, IconSparkles } from "@tabler/icons-react";

const FEATURES = [
  { icon: IconCalendarCheck, title: "Attendance", text: "Web & camera check-in" },
  { icon: IconCash, title: "Payroll", text: "Tax slabs & PDF payslips" },
  { icon: IconSparkles, title: "AI assistant", text: "Answers from your data" },
];

/** Full-screen photo background with a brand panel and a floating form card. Used by setup, login and change-password. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <section className="auth-side">
        <div className="auth-brand">
          <span className="logo-mark">H</span>
          HCM Lite
        </div>

        <div className="hide-sm">
          <span className="auth-eyebrow">
            <span className="pulse" /> AI-assisted HR for Admin, HR & Employees
          </span>
          <h1>
            Your people, attendance and payroll — <span className="accent">in one smart place.</span>
          </h1>
          <p className="lead-c">Every number on the dashboard comes from what your team does in the app, and the assistant answers from the same data.</p>
        </div>

        <div className="auth-features hide-sm">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div className="auth-feature" key={title}>
              <span className="ico">
                <Icon size={18} />
              </span>
              <strong>{title}</strong>
              {text}
            </div>
          ))}
        </div>

        <div className="auth-chat hide-sm" aria-hidden="true">
          <div className="bubble q">Who is on leave today?</div>
          <div className="bubble a">
            <small>✦ AI-generated</small>2 people: Ayesha (casual) and Bilal (sick).
          </div>
        </div>
      </section>

      <main className="auth-card">{children}</main>
    </div>
  );
}
