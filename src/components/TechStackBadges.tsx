const TECH_STACK = [
  "React",
  "TypeScript",
  "Vite",
  "Tailwind CSS",
  "DuckDB-WASM",
  "Pyodide",
  "Groq",
  "Vercel",
];

export function TechStackBadges() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {TECH_STACK.map((tech) => (
        <span
          key={tech}
          className="text-xs font-medium rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-[var(--color-text-muted)]"
        >
          {tech}
        </span>
      ))}
    </div>
  );
}
