import { SAMPLE_QUESTIONS } from "../lib/sampleData";

interface SampleQuestionsProps {
  onAsk: (question: string) => void;
  isBusy: boolean;
}

export function SampleQuestions({ onAsk, isBusy }: SampleQuestionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="text-xs text-[var(--color-text-muted)] w-full">
        Try one of these:
      </span>
      {SAMPLE_QUESTIONS.map((q) => (
        <button
          key={q}
          onClick={() => onAsk(q)}
          disabled={isBusy}
          className="text-xs rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-default disabled:active:scale-100"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
