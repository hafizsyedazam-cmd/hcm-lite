import type { ReactNode } from "react";
import { IconBrain, IconCalendarCheck, IconCash } from "@tabler/icons-react";

/** Split screen used by setup, login and change-password. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-side">
        <span className="circle" style={{ width: 380, height: 380, right: -120, top: -100 }} />
        <span className="circle" style={{ width: 260, height: 260, left: -80, bottom: -60 }} />
        <div className="d-flex align-items-center gap-2 position-relative">
          <span className="logo-mark" style={{ background: "#fff", color: "var(--primary)" }}>
            H
          </span>
          <span className="fs-4 fw-bold">HCM Lite</span>
        </div>
        <div className="position-relative">
          <h1 className="mb-3">
            People, attendance, leave
            <br />
            and payroll in one place.
          </h1>
          <p className="mb-4" style={{ opacity: 0.9, maxWidth: 420 }}>
            An AI-assisted HR system for Admin, HR and Employees. Every number comes from what your team does in the app.
          </p>
          <div className="d-flex flex-column gap-2" style={{ maxWidth: 400 }}>
            {[
              [IconCalendarCheck, "Web and camera check-in with live attendance board"],
              [IconCash, "Monthly payroll with tax slabs and PDF payslips"],
              [IconBrain, "Ask the AI assistant: “Who is on leave today?”"],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof IconCash;
              return (
                <div className="glass d-flex align-items-center gap-3" key={i}>
                  <I size={22} />
                  <span>{text as string}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="fs-13 position-relative" style={{ opacity: 0.8 }}>
          Saylani Hackathon · HCM Lite
        </div>
      </div>
      <div className="auth-form">
        <div className="inner">{children}</div>
      </div>
    </div>
  );
}
