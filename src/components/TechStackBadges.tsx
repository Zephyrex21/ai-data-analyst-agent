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
          className="clay text-xs font-medium px-3.5 py-1.5 text-[var(--color-text-muted)]"
          style={{ borderRadius: 9999, boxShadow: "4px 4px 10px var(--clay-shadow-dark), -3px -3px 8px var(--clay-shadow-light)" }}
        >
          {tech}
        </span>
      ))}
    </div>
  );
}
