import type { ConversationTurn } from "../hooks/useAskQuestion";
import { formatDisplayValue } from "./formatValue";
import { slugifyForFilename } from "./downloadCsv";

const ENGINE_LABELS: Record<string, string> = {
  sql: "SQL",
  python: "Python",
  insights: "Insights",
  meta: "Info",
};

function formatResultAsMarkdownTable(turn: ConversationTurn): string | null {
  if (!turn.result || turn.result.rows.length === 0) return null;
  const { columns, rows } = turn.result;
  const preview = rows.slice(0, 20); // reports stay readable; full data is still a CSV download away
  const header = `| ${columns.join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = preview
    .map((row) => `| ${columns.map((c) => formatDisplayValue(row[c])).join(" | ")} |`)
    .join("\n");
  const truncatedNote = rows.length > preview.length ? `\n\n*(showing ${preview.length} of ${rows.length} rows)*` : "";
  return `${header}\n${divider}\n${body}${truncatedNote}`;
}

function formatTurnAsMarkdown(turn: ConversationTurn, index: number): string {
  const lines: string[] = [`## ${index + 1}. ${turn.question}`];

  if (turn.engine) {
    const label = ENGINE_LABELS[turn.engine] ?? turn.engine;
    lines.push(`*Engine: ${label}*`);
  }

  if (turn.error) {
    lines.push(`\n> ${turn.error}`);
    return lines.join("\n");
  }

  if (turn.narrative) {
    lines.push(`\n${turn.narrative}`);
  }

  if (turn.sql) {
    const lang = turn.engine === "python" ? "python" : "sql";
    lines.push(`\n\`\`\`${lang}\n${turn.sql}\n\`\`\``);
  }

  const table = formatResultAsMarkdownTable(turn);
  if (table) lines.push(`\n${table}`);

  return lines.join("\n");
}

/** Builds a self-contained Markdown report of the whole conversation so far. Exported for testing. */
export function buildConversationReport(turns: ConversationTurn[], datasetName: string): string {
  const doneTurns = turns.filter((t) => t.stage === "done" || t.stage === "error");
  const header = `# Conversation report — ${datasetName}\n\n${doneTurns.length} question${doneTurns.length === 1 ? "" : "s"} answered.`;
  const body = doneTurns.map((t, i) => formatTurnAsMarkdown(t, i)).join("\n\n---\n\n");
  return `${header}\n\n---\n\n${body}\n`;
}

export function downloadConversationReport(turns: ConversationTurn[], datasetName: string): void {
  const markdown = buildConversationReport(turns, datasetName);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugifyForFilename(datasetName)}-conversation.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
