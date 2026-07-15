export class LlmError extends Error {}

export interface PreviousAttempt {
  sql: string;
  error: string;
}

interface GenerateSqlResponse {
  sql?: string;
  error?: string;
}

export async function generateSql(
  question: string,
  schemaDescription: string,
  previousAttempt?: PreviousAttempt | null
): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/generate-sql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, schemaDescription, previousAttempt: previousAttempt ?? null }),
    });
  } catch {
    throw new LlmError(
      "Couldn't reach the server. If you're running locally, make sure you started this with `vercel dev`, not `npm run dev` — plain Vite doesn't run the /api function."
    );
  }

  let data: GenerateSqlResponse;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new LlmError(
      "Got a non-JSON response from /api/generate-sql — the API route isn't actually running. " +
        "If you're developing locally, this almost always means you started the app with `npm run dev` " +
        "instead of `vercel dev`. Plain Vite doesn't serve the /api function and silently falls back to " +
        "the HTML page instead. Stop the current server and run `vercel dev`."
    );
  }
  try {
    data = await res.json();
  } catch {
    throw new LlmError("Server returned a response that claimed to be JSON but wasn't.");
  }

  if (!res.ok || data.error) {
    throw new LlmError(data.error ?? `Request failed (${res.status}).`);
  }
  if (!data.sql) {
    throw new LlmError("Server didn't return any SQL.");
  }
  return data.sql;
}
