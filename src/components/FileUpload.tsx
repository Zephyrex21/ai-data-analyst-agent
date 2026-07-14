import { useRef, useState } from "react";

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
}

export function FileUpload({ onFileSelected, isLoading }: FileUploadProps) {
  const [isDragActive, setIsDragActive] = useState(false);
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

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragActive(true);
      }}
      onDragLeave={() => setIsDragActive(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`glass rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
        isDragActive
          ? "border-[var(--color-accent)] bg-blue-50/60"
          : "border-[var(--color-border)]"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleInputChange}
        disabled={isLoading}
      />
      <p className="text-lg font-medium text-[var(--color-text)]">
        {isLoading ? "Reading file…" : "Drop a CSV file here"}
      </p>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        or click to browse — up to 25MB, parsed entirely in your browser
      </p>
    </div>
  );
}
