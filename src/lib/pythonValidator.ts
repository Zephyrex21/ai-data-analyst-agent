export interface PythonValidationResult {
  valid: boolean;
  reason?: string;
}

// Defense-in-depth, not the primary safety mechanism — Pyodide's WASM sandbox
// has no real OS filesystem or network access regardless of what code tries
// to do. This exists to fail fast with a clear, specific reason instead of a
// confusing runtime error, and to keep generated code within the pattern
// this app actually supports (operate on `df`, assign to `result`).
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bimport\s+os\b/, label: "import os" },
  { pattern: /\bimport\s+sys\b/, label: "import sys" },
  { pattern: /\bimport\s+subprocess\b/, label: "import subprocess" },
  { pattern: /\bimport\s+socket\b/, label: "import socket" },
  { pattern: /\bimport\s+shutil\b/, label: "import shutil" },
  { pattern: /\brequests\b/, label: "requests" },
  { pattern: /\burllib\b/, label: "urllib" },
  { pattern: /\bopen\s*\(/, label: "open(...)" },
  { pattern: /__import__\s*\(/, label: "__import__(...)" },
  { pattern: /\beval\s*\(/, label: "eval(...)" },
  { pattern: /\bexec\s*\(/, label: "exec(...)" },
  { pattern: /\bcompile\s*\(/, label: "compile(...)" },
  { pattern: /\binput\s*\(/, label: "input(...)" },
  { pattern: /\bpathlib\b/, label: "pathlib" },
];

export function validatePythonCode(code: string): PythonValidationResult {
  const trimmed = code.trim();
  if (!trimmed) {
    return { valid: false, reason: "The model returned empty Python code." };
  }

  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) {
      console.warn("[pythonValidator] rejected code:", { code: trimmed, label });
      return { valid: false, reason: `Generated code uses a disallowed pattern: ${label}.` };
    }
  }

  // Contract: the code must assign its final answer to a variable named
  // `result` — that's what runPythonCode() reads back afterward.
  if (!/\bresult\s*=/.test(trimmed)) {
    return {
      valid: false,
      reason: "Generated code didn't assign an answer to a variable named `result`.",
    };
  }

  // The DataFrame is pre-loaded; reloading/reassigning it would silently
  // discard the real uploaded data.
  if (/\bdf\s*=\s*pd\.read_csv/.test(trimmed)) {
    return {
      valid: false,
      reason: "Generated code tried to reload the dataset instead of using the existing `df`.",
    };
  }

  return { valid: true };
}
