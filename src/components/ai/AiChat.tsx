"use client";
import { useEffect, useRef, useState } from "react";
import { IconSend, IconSparkles, IconX } from "@tabler/icons-react";
import { useAuth } from "../AuthProvider";
import { AiLabel } from "../ui";
import { api, errorMessage } from "@/lib/client/api";

interface Msg {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

const SUGGESTIONS = {
  admin: ["How many active employees are there?", "What is this month's payroll cost?", "Who came late most often this month?"],
  hr: ["Who is on leave today?", "Who came late most often this month?", "What is this month's attendance rate?"],
  employee: ["How many sick leaves do I have left this year?", "How many times was I late this month?", "Late hone ka rule kya hai?"],
};

/** The chat body, used by the floating panel and the full Assistant page. */
export function ChatBox({ autoFocus }: { autoFocus?: boolean }) {
  const { me } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setText("");
    setBusy(true);
    try {
      const history = next.filter((m) => !m.error).slice(-10).map(({ role, content }) => ({ role, content }));
      const res = await api<{ answer: string }>("/ai/chat", { body: { messages: history } });
      setMessages((m) => [...m, { role: "assistant", content: res.answer }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: errorMessage(e), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="ai-messages">
        {messages.length === 0 && (
          <div>
            <div className="ai-msg bot mb-3">
              <AiLabel />
              <div>
                Hi {me?.name.split(" ")[0]}! I answer from your company&apos;s real HR data and policy. {me?.role === "employee" ? "I can only see your own records." : ""} You can also ask in Roman Urdu.
              </div>
            </div>
            <div className="ai-suggest">
              {SUGGESTIONS[me?.role ?? "employee"].map((s) => (
                <button key={s} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role === "user" ? "user" : "bot"}`} style={m.error ? { borderColor: "var(--danger)" } : undefined}>
            {m.role === "assistant" && !m.error && <AiLabel />}
            {m.role === "assistant" && m.error && <div className="ai-label text-danger">Assistant unavailable</div>}
            <div>{m.content}</div>
          </div>
        ))}
        {busy && (
          <div className="ai-msg bot">
            <div className="typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        <div ref={end} />
      </div>
      <form
        className="ai-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input className="form-control" placeholder="Ask about attendance, leave, payroll..." value={text} onChange={(e) => setText(e.target.value)} maxLength={500} autoFocus={autoFocus} aria-label="Message the AI assistant" />
        <button className="btn btn-primary" disabled={busy || !text.trim()} aria-label="Send">
          <IconSend size={16} />
        </button>
      </form>
    </>
  );
}

export function AiChat({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <>
      {open && (
        <div className="ai-panel" role="dialog" aria-label="AI assistant">
          <div className="ai-head">
            <IconSparkles size={20} />
            <div className="flex-grow-1">
              <h6>HCM Assistant</h6>
              <div className="fs-12" style={{ opacity: 0.85 }}>
                Answers from your HR data · same access as you
              </div>
            </div>
            <button className="btn btn-sm text-white p-1" onClick={() => onOpenChange(false)} aria-label="Close assistant">
              <IconX size={18} />
            </button>
          </div>
          <ChatBox autoFocus />
        </div>
      )}
      <button className="ai-fab" onClick={() => onOpenChange(!open)} aria-label="Open AI assistant">
        {open ? <IconX size={24} /> : <IconSparkles size={24} />}
      </button>
    </>
  );
}
