interface FlowStep {
  label: string;
  detail: string;
  variant?: "accent" | "default";
}

const STEPS: FlowStep[] = [
  { label: "Upload CSV", detail: "parsed entirely in your browser" },
  { label: "Ask a question", detail: "plain English" },
  { label: "Groq LLM", detail: "writes SQL or Python", variant: "accent" },
  { label: "Validated", detail: "blocks unsafe/hallucinated code" },
  { label: "Executed", detail: "DuckDB-WASM or Pyodide, in-browser", variant: "accent" },
  { label: "Real answer", detail: "chart, table, or number" },
];

export function ArchitectureVisual() {
  return (
    <div className="clay p-6 w-full">
      <p className="text-sm font-medium text-[var(--color-text-muted)] mb-4 text-center">
        Everything except the LLM call runs entirely in your browser
      </p>
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-1">
        {STEPS.map((step, i) => (
          <div key={step.label} className="flex flex-col md:flex-row items-center gap-2 md:gap-1 flex-1">
            <div
              className="clay-inset w-full px-4 py-3 text-center"
              style={step.variant === "accent" ? { background: "var(--color-accent-soft)" } : undefined}
            >
              <p className="text-sm font-semibold text-[var(--color-text)]">{step.label}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{step.detail}</p>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className="text-[var(--color-text-muted)] text-lg shrink-0 rotate-90 md:rotate-0"
                aria-hidden="true"
              >
                →
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
