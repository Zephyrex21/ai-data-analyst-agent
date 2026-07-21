import { useRef, useState } from "react";
import { fetchSampleDataFile } from "../lib/sampleData";

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  onSampleSelected: (file: File) => void;
  isLoading: boolean;
}

export function FileUpload({ onFileSelected, onSampleSelected, isLoading }: FileUploadProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [isSampleLoading, setIsSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFileSelected(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
    // allow re-selecting the same file name after a reset
    e.target.value = "";
  }

  async function handleTrySample(e: React.MouseEvent) {
    e.stopPropagation();
    setSampleError(null);
    setIsSampleLoading(true);
    try {
      const file = await fetchSampleDataFile();
      onSampleSelected(file);
    } catch (err) {
      setSampleError(err instanceof Error ? err.message : "Couldn't load the sample dataset.");
    } finally {
      setIsSampleLoading(false);
    }
  }

  const busy = isLoading || isSampleLoading;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label="Upload a CSV file — drop a file here, or press Enter to browse"
        aria-disabled={busy}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (busy) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`clay clay-pressable p-12 text-center transition-transform duration-200 ${
          isDragActive ? "scale-[1.02]" : ""
        }`}
        style={isDragActive ? { background: "var(--color-accent-soft)" } : undefined}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleInputChange}
          disabled={busy}
        />

        <div
          className="clay mx-auto mb-4 flex items-center justify-center"
          style={{ width: 64, height: 64, borderRadius: 9999 }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            className="text-[var(--color-accent)]"
            aria-hidden="true"
          >
            <path
              d="M12 15V3m0 0L7 8m5-5l5 5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <p className="text-lg font-medium text-[var(--color-text)]">
          {isLoading ? "Reading file…" : "Drop a CSV file here"}
        </p>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          or click to browse — up to 25MB, parsed entirely in your browser
        </p>
      </div>

      <div className="text-center">
        <button
          onClick={handleTrySample}
          disabled={busy}
          className="text-sm font-medium text-[var(--color-accent)] hover:underline disabled:opacity-50 disabled:cursor-default"
        >
          {isSampleLoading ? "Loading sample data…" : "Or try it instantly with sample sales data →"}
        </button>
        {sampleError && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{sampleError}</p>
        )}
      </div>
    </div>
  );
}
