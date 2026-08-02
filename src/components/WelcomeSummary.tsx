interface WelcomeSummaryProps {
  text: string;
}

export function WelcomeSummary({ text }: WelcomeSummaryProps) {
  return (
    <div className="clay-accent p-4 text-sm text-[var(--color-text)] leading-relaxed">
      {text}
    </div>
  );
}
