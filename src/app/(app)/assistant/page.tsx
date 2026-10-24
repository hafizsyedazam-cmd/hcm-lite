"use client";
import { IconShieldLock, IconSparkles } from "@tabler/icons-react";
import { useAuth } from "@/components/AuthProvider";
import { ChatBox } from "@/components/ai/AiChat";
import { Card, PageHeader } from "@/components/ui";

export default function AssistantPage() {
  const { me } = useAuth();
  return (
    <>
      <PageHeader title="AI Assistant" crumbs={["Main Menu", "AI Assistant"]} />
      <div className="row">
        <div className="col-xl-8">
          <div className="card overflow-hidden">
            <div className="ai-head">
              <IconSparkles size={20} />
              <div>
                <h6>HCM Assistant</h6>
                <div className="fs-12" style={{ opacity: 0.85 }}>Answers come from the same data and permissions as the rest of the app</div>
              </div>
            </div>
            <div className="d-flex flex-column" style={{ height: "calc(100vh - 260px)", minHeight: 420 }}>
              <ChatBox autoFocus />
            </div>
          </div>
        </div>
        <div className="col-xl-4">
          <Card title="What I can do">
            <ul className="fs-13 ps-3 mb-0 d-flex flex-column gap-2">
              {me?.role === "employee" ? (
                <>
                  <li>Your leave balance, attendance and payslips</li>
                  <li>Company policy: late rules, leave quotas, payroll and tax</li>
                  <li>Use <strong>Smart leave</strong> on the My Leave page to turn a sentence into a leave form</li>
                </>
              ) : (
                <>
                  <li>Headcount by department, attrition</li>
                  <li>Attendance rate, late-comers, who is on leave today</li>
                  <li>Leave usage and pending approvals</li>
                  <li>Payroll cost and average salaries{me?.role === "hr" ? "" : " (all company data)"}</li>
                  <li>Company policy questions</li>
                </>
              )}
            </ul>
          </Card>
          <Card title={<h5 className="d-flex align-items-center gap-2"><IconShieldLock size={18} /> Guardrails</h5>}>
            <ul className="fs-13 ps-3 mb-0 d-flex flex-column gap-2">
              <li>Same access as you: {me?.role === "employee" ? "only your own records" : "company data for your role"}</li>
              <li>The AI never changes data; it only reads through the app&apos;s services</li>
              <li>About 20 questions per hour, 15 s timeout</li>
              <li>Every answer is labelled AI-generated and logged</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
