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
          className="clay clay-pressable text-xs px-3.5 py-2 text-[var(--color-text)] hover:text-[var(--color-accent)] disabled:opacity-50 disabled:cursor-default disabled:pointer-events-none"
          style={{ borderRadius: 9999 }}
        >
          {q}
        </button>
      ))}
    </div>
  );
}
