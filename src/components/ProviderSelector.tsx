import { useEffect, useRef } from "react";
import { PROVIDER_OPTIONS, type ProviderId } from "../lib/providers";

interface ProviderSelectorProps {
  value: ProviderId;
  onChange: (provider: ProviderId) => void;
  disabled?: boolean;
}

// A dropdown rather than the old pill row (Phase 21) — 5 providers with a
// name + model + tag each doesn't fit comfortably as inline pills. Uses
// <details>/<summary> (same disclosure pattern already used for "show
// code"/"show the real numbers" elsewhere) instead of a fully custom
// listbox, closing itself via a ref once an option is picked — and, since
// native <details> doesn't do this on its own, also on an outside click.
export function ProviderSelector({ value, onChange, disabled = false }: ProviderSelectorProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const selected = PROVIDER_OPTIONS.find((p) => p.id === value) ?? PROVIDER_OPTIONS[0];

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (detailsRef.current?.open && !detailsRef.current.contains(e.target as Node)) {
        detailsRef.current.open = false;
      }
    }
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  function handleSelect(id: ProviderId) {
    onChange(id);
    if (detailsRef.current) detailsRef.current.open = false;
  }

  return (
    <details ref={detailsRef} className="relative">
      <summary
        aria-label="Model"
        className={`clay clay-pressable list-none flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none ${
          disabled ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <span className="text-xs font-medium text-[var(--color-text)]">{selected.label}</span>
        <span className="text-xs text-[var(--color-text-muted)]">{selected.model}</span>
        <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]">
          {selected.tag}
        </span>
        <span className="text-[var(--color-text-muted)] text-[10px]">▾</span>
      </summary>

      <div className="clay absolute right-0 top-full mt-2 z-30 w-64 p-1.5 flex flex-col gap-1">
        {PROVIDER_OPTIONS.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => handleSelect(option.id)}
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-2xl text-left transition-colors ${
                active
                  ? "clay-solid-accent text-white"
                  : "text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
              }`}
            >
              <span className="flex flex-col">
                <span className="text-xs font-medium">{option.label}</span>
                <span className={`text-[11px] ${active ? "text-white/80" : "text-[var(--color-text-muted)]"}`}>
                  {option.model}
                </span>
              </span>
              <span
                className={`text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                  active ? "bg-white/20 text-white" : "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]"
                }`}
              >
                {option.tag}
              </span>
            </button>
          );
        })}
      </div>
    </details>
  );
}
