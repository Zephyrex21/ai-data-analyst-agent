interface Highlight {
  title: string;
  description: string;
}

const HIGHLIGHTS: Highlight[] = [
  {
    title: "Verified, not guessed",
    description:
      "Every answer is real SQL or Python — executed and validated, not just LLM prose that sounds right.",
  },
  {
    title: "Dual execution engine",
    description:
      "SQL (DuckDB) handles most questions; Python (pandas) takes over for statistics SQL struggles with.",
  },
  {
    title: "Self-correcting",
    description:
      "A wrong query doesn't just fail — the exact error goes back to the model for a fix, up to 3 attempts.",
  },
  {
    title: "$0 to run",
    description:
      "DuckDB and Python execute entirely in your browser. No backend, no server cost, no server risk.",
  },
];

export function FeatureHighlights() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
      {HIGHLIGHTS.map((h) => (
        <div key={h.title} className="glass rounded-2xl p-5">
          <p className="font-semibold text-[var(--color-text)]">{h.title}</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{h.description}</p>
        </div>
      ))}
    </div>
  );
}
