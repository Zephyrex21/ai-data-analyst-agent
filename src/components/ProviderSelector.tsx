import { PROVIDER_OPTIONS, type ProviderId } from "../lib/providers";

interface ProviderSelectorProps {
  value: ProviderId;
  onChange: (provider: ProviderId) => void;
  disabled?: boolean;
}

export function ProviderSelector({ value, onChange, disabled = false }: ProviderSelectorProps) {
  return (
    <div
      className="clay-inset inline-flex items-center gap-1 p-1"
      role="radiogroup"
      aria-label="Model"
    >
      {PROVIDER_OPTIONS.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 disabled:pointer-events-none ${
              active
                ? "clay clay-solid-accent text-white"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
