interface DevModeToggleProps {
  devMode: boolean;
  onChange: (next: boolean) => void;
}

export function DevModeToggle({ devMode, onChange }: DevModeToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!devMode)}
      aria-pressed={devMode}
      aria-label={devMode ? "Turn off Dev Mode" : "Turn on Dev Mode"}
      title={devMode ? "Dev Mode on — showing generated code" : "Turn on Dev Mode to see the generated code"}
      className={`clay clay-pressable flex items-center gap-1.5 h-10 px-3 text-xs font-medium transition-colors ${
        devMode
          ? "clay-solid-accent text-white"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M8.5 8l-4.5 4 4.5 4M15.5 8l4.5 4-4.5 4M13.5 5l-3 14"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Dev Mode
    </button>
  );
}
