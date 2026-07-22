import { useState } from "react";

interface AskBarProps {
  onAsk: (question: string) => void;
  isBusy: boolean;
}

export function AskBar({ onAsk, isBusy }: AskBarProps) {
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || isBusy) return;
    onAsk(value.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="clay p-4 w-full flex flex-col sm:flex-row gap-3">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask a question about your data, e.g. “what's total revenue by region?”"
        disabled={isBusy}
        className="clay-inset flex-1 px-4 py-3 text-sm text-[var(--color-text)] disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={isBusy || !value.trim()}
        className="clay clay-pressable clay-solid-accent text-white text-sm font-medium px-5 py-3 whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none"
      >
        {isBusy ? "Thinking…" : "Ask"}
      </button>
    </form>
  );
}
