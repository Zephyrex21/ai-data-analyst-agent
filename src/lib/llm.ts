export class LlmError extends Error {}

interface GenerateSqlResponse {
  sql?: string;
  error?: string;
}

export async function generateSql(question: string, schemaDescription: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/generate-sql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, schemaDescription }),
    });
  } catch {
    throw new LlmError(
      "Couldn't reach the server. If you're running locally, make sure you started this with `vercel dev`, not `npm run dev` — plain Vite doesn't run the /api function."
    );
  }

  let data: GenerateSqlResponse;
  try {
    data = await res.json();
  } catch {
    throw new LlmError("Server returned an unexpected response.");
  }

  if (!res.ok || data.error) {
    throw new LlmError(data.error ?? `Request failed (${res.status}).`);
  }
  if (!data.sql) {
    throw new LlmError("Server didn't return any SQL.");
  }
  return data.sql;
}
