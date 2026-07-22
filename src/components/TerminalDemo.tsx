import { useEffect, useState } from "react";

interface DemoStep {
  question: string;
  engine: "SQL" | "Python";
  code: string;
  result: string;
}

const DEMO_STEPS: DemoStep[] = [
  {
    question: "what's total revenue by region?",
    engine: "SQL",
    code: "SELECT region, SUM(revenue) AS total_revenue\nFROM data GROUP BY region",
    result: "North $361,540 · South $284,399 · East $234,764 · West $295,753",
  },
  {
    question: "are there any outliers in revenue?",
    engine: "Python",
    code: "z = (df['revenue'] - df['revenue'].mean()) / df['revenue'].std()\nresult = df[abs(z) > 3]",
    result: "8 rows flagged as statistical outliers",
  },
  {
    question: "highest revenue day in North?",
    engine: "SQL",
    code: "SELECT * FROM data WHERE region = 'North'\nORDER BY revenue DESC LIMIT 1",
    result: "2025-11-17 · Widget C · $9,170.29",
  },
];

type Phase = "typing-question" | "thinking" | "typing-code" | "showing-result" | "pausing";

const TYPE_SPEED_MS = 35;
const THINKING_MS = 700;
const RESULT_PAUSE_MS = 2200;

export function TerminalDemo() {
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing-question");
  const [questionText, setQuestionText] = useState("");
  const [codeText, setCodeText] = useState("");

  const step = DEMO_STEPS[stepIndex];

  useEffect(() => {
    setQuestionText("");
    setCodeText("");
    setPhase("typing-question");
  }, [stepIndex]);

  useEffect(() => {
    if (phase !== "typing-question") return;
    if (questionText.length < step.question.length) {
      const t = setTimeout(
        () => setQuestionText(step.question.slice(0, questionText.length + 1)),
        TYPE_SPEED_MS
      );
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setPhase("thinking"), 400);
    return () => clearTimeout(t);
  }, [phase, questionText, step.question]);

  useEffect(() => {
    if (phase !== "thinking") return;
    const t = setTimeout(() => setPhase("typing-code"), THINKING_MS);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "typing-code") return;
    if (codeText.length < step.code.length) {
      const t = setTimeout(
        () => setCodeText(step.code.slice(0, codeText.length + 1)),
        TYPE_SPEED_MS / 2
      );
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setPhase("showing-result"), 300);
    return () => clearTimeout(t);
  }, [phase, codeText, step.code]);

  useEffect(() => {
    if (phase !== "showing-result") return;
    const t = setTimeout(() => setPhase("pausing"), RESULT_PAUSE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "pausing") return;
    const t = setTimeout(() => setStepIndex((i) => (i + 1) % DEMO_STEPS.length), 500);
    return () => clearTimeout(t);
  }, [phase]);

  return (
    <div className="clay w-full max-w-2xl p-3" aria-hidden="true">
      {/* Header bar with clay-style traffic-light dots */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="h-3 w-3 rounded-full" style={{ background: "#e6a099" }} />
        <span className="h-3 w-3 rounded-full" style={{ background: "#e0c458" }} />
        <span className="h-3 w-3 rounded-full" style={{ background: "#8ec6a8" }} />
        <span className="ml-2 text-xs text-[var(--color-text-muted)]">
          ai-data-analyst-agent — demo
        </span>
      </div>

      {/* Recessed "screen" — deliberately kept dark regardless of theme, matching a real terminal/editor rather than adapting to light mode */}
      <div
        className="rounded-[20px] p-5 font-mono text-sm min-h-[220px]"
        style={{
          background: "#1c1a2e",
          boxShadow: "inset 3px 3px 8px rgba(0,0,0,0.4), inset -2px -2px 6px rgba(255,255,255,0.03)",
        }}
      >
        <div className="text-[#8ec6a8]">
          <span className="text-[#9296f0]">You asked&gt; </span>
          {questionText}
          {phase === "typing-question" && <span className="animate-pulse">▌</span>}
        </div>

        {phase === "thinking" && (
          <div className="mt-3 flex items-center gap-1 text-[#a29cc2]">
            <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-[#9296f0]" />
            <span
              className="thinking-dot h-1.5 w-1.5 rounded-full bg-[#9296f0]"
              style={{ animationDelay: "0.15s" }}
            />
            <span
              className="thinking-dot h-1.5 w-1.5 rounded-full bg-[#9296f0]"
              style={{ animationDelay: "0.3s" }}
            />
          </div>
        )}

        {(phase === "typing-code" || phase === "showing-result" || phase === "pausing") && (
          <div className="mt-3">
            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-[#322f52] text-[#9296f0]">
              {step.engine}
            </span>
            <pre className="mt-2 whitespace-pre-wrap text-[#ede9f7] text-xs leading-relaxed">
              {codeText}
              {phase === "typing-code" && <span className="animate-pulse">▌</span>}
            </pre>
          </div>
        )}

        {(phase === "showing-result" || phase === "pausing") && (
          <div className="mt-3 text-[#8ec6a8] text-xs">→ {step.result}</div>
        )}
      </div>
    </div>
  );
}
