import { describe, it, expect, vi } from "vitest";
import { runQueryWithRetries, MAX_ATTEMPTS, type OrchestratorDeps } from "./queryOrchestrator";
import type { ParsedCsv } from "./csv";
import type { QueryResult } from "./duckdb";

const csv: ParsedCsv = {
  fileName: "x.csv",
  totalRows: 0,
  warnings: [],
  rows: [],
  columns: [
    { name: "region", type: "string" },
    { name: "revenue", type: "number" },
  ],
};

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const updates: T[] = [];
  for await (const update of gen) updates.push(update);
  return updates;
}

function baseDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    generateQuery: vi.fn(),
    runSql: vi.fn(),
    runPython: vi.fn(),
    isDataFrameLoaded: () => true,
    loadDataFrame: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("runQueryWithRetries — success path costs exactly one LLM call", () => {
  it("does not retry when the first attempt succeeds", async () => {
    const generateQuery = vi.fn(async () => ({ engine: "sql" as const, code: "SELECT * FROM data" }));
    const runSql = vi.fn(async (): Promise<QueryResult> => ({ columns: ["x"], rows: [{ x: 1 }] }));
    const deps = baseDeps({ generateQuery, runSql });

    const updates = await collect(runQueryWithRetries("q", csv, [], deps));

    expect(generateQuery).toHaveBeenCalledTimes(1);
    expect(runSql).toHaveBeenCalledTimes(1);
    const last = updates[updates.length - 1];
    expect(last.stage).toBe("done");
    expect(last.attemptsUsed).toBe(1);
  });
});

describe("runQueryWithRetries — self-correction", () => {
  it("retries on a validation failure (unknown column) and succeeds once corrected", async () => {
    const generateQuery = vi
      .fn()
      .mockResolvedValueOnce({ engine: "sql", code: "SELECT profit FROM data" }) // unknown column
      .mockResolvedValueOnce({ engine: "sql", code: "SELECT SUM(revenue) AS total FROM data" });
    const runSql = vi.fn(async (): Promise<QueryResult> => ({ columns: ["total"], rows: [{ total: 100 }] }));
    const deps = baseDeps({ generateQuery, runSql });

    const updates = await collect(runQueryWithRetries("q", csv, [], deps));

    expect(generateQuery).toHaveBeenCalledTimes(2);
    // second call should have received the first attempt's error as context
    const secondCallArgs = generateQuery.mock.calls[1];
    expect(secondCallArgs[2]).toMatchObject({ code: "SELECT profit FROM data" });
    const last = updates[updates.length - 1];
    expect(last.stage).toBe("done");
    expect(last.attemptsUsed).toBe(2);
  });

  it("retries on a DuckDB execution failure and succeeds on retry", async () => {
    const generateQuery = vi.fn(async () => ({ engine: "sql" as const, code: "SELECT SUM(revenue) AS total FROM data" }));
    const runSql = vi
      .fn()
      .mockRejectedValueOnce(new Error("Binder Error: fake failure"))
      .mockResolvedValueOnce({ columns: ["total"], rows: [{ total: 100 }] });
    const deps = baseDeps({ generateQuery, runSql });

    const updates = await collect(runQueryWithRetries("q", csv, [], deps));

    expect(runSql).toHaveBeenCalledTimes(2);
    expect(updates[updates.length - 1].stage).toBe("done");
  });

  it("stops after MAX_ATTEMPTS and reports a clean final error, never looping forever", async () => {
    const generateQuery = vi.fn(async () => ({ engine: "sql" as const, code: "SELECT profit FROM data" }));
    const deps = baseDeps({ generateQuery });

    const updates = await collect(runQueryWithRetries("q", csv, [], deps));

    expect(generateQuery).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    const last = updates[updates.length - 1];
    expect(last.stage).toBe("error");
    expect(last.error).toContain(String(MAX_ATTEMPTS));
  });
});

describe("runQueryWithRetries — LLM/network failures don't retry", () => {
  it("fails immediately without retrying when the LLM call itself throws", async () => {
    const generateQuery = vi.fn().mockRejectedValue(new Error("Couldn't reach the server."));
    const deps = baseDeps({ generateQuery });

    const updates = await collect(runQueryWithRetries("q", csv, [], deps));

    expect(generateQuery).toHaveBeenCalledTimes(1);
    expect(updates[updates.length - 1].stage).toBe("error");
  });
});

describe("runQueryWithRetries — Python routing", () => {
  it("routes to Python, loads the dataframe once, and executes", async () => {
    const generateQuery = vi.fn(async () => ({
      engine: "python" as const,
      code: "result = df['revenue'].corr(df['revenue'])",
    }));
    const runPython = vi.fn(async (): Promise<QueryResult> => ({ columns: ["result"], rows: [{ result: 1 }] }));
    const loadDataFrame = vi.fn(async () => {});
    const deps = baseDeps({ generateQuery, runPython, isDataFrameLoaded: () => false, loadDataFrame });

    const updates = await collect(runQueryWithRetries("q", csv, [], deps));

    expect(loadDataFrame).toHaveBeenCalledTimes(1);
    expect(runPython).toHaveBeenCalledTimes(1);
    expect(updates.some((u) => u.stage === "loading-python")).toBe(true);
    expect(updates[updates.length - 1].stage).toBe("done");
  });

  it("skips the dataframe reload when it's already loaded", async () => {
    const generateQuery = vi.fn(async () => ({ engine: "python" as const, code: "result = 1" }));
    const runPython = vi.fn(async (): Promise<QueryResult> => ({ columns: ["result"], rows: [{ result: 1 }] }));
    const loadDataFrame = vi.fn(async () => {});
    const deps = baseDeps({ generateQuery, runPython, isDataFrameLoaded: () => true, loadDataFrame });

    const updates = await collect(runQueryWithRetries("q", csv, [], deps));

    expect(loadDataFrame).not.toHaveBeenCalled();
    expect(updates.some((u) => u.stage === "loading-python")).toBe(false);
  });

  it("rejects unsafe Python code (e.g. file access) before ever executing it", async () => {
    const generateQuery = vi.fn(async () => ({
      engine: "python" as const,
      code: "import os\nresult = os.listdir('/')",
    }));
    const runPython = vi.fn();
    const deps = baseDeps({ generateQuery, runPython });

    const updates = await collect(runQueryWithRetries("q", csv, [], deps));

    expect(runPython).not.toHaveBeenCalled();
    expect(updates[updates.length - 1].stage).toBe("error");
  });
});

describe("runQueryWithRetries — conversation history is passed through", () => {
  it("forwards the provided history to generateQuery unchanged", async () => {
    const generateQuery = vi.fn(async () => ({ engine: "sql" as const, code: "SELECT * FROM data" }));
    const runSql = vi.fn(async (): Promise<QueryResult> => ({ columns: ["x"], rows: [{ x: 1 }] }));
    const deps = baseDeps({ generateQuery, runSql });
    const history = [
      { question: "prior q", engine: "sql" as const, code: "SELECT 1", resultSummary: "1 row" },
    ];

    await collect(runQueryWithRetries("follow-up", csv, history, deps));

    expect(generateQuery).toHaveBeenCalledWith("follow-up", expect.any(String), null, history);
  });
});
