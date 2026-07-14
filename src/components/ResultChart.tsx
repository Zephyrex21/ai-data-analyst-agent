import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ChartSpec } from "../lib/chartSelection";
import type { QueryResult } from "../lib/duckdb";

// Using literal hex values rather than CSS custom properties here — SVG
// presentation attributes (fill/stroke) don't reliably resolve var() across
// browsers, especially through a charting library's internal rendering.
const ACCENT = "#007aff";
const PIE_COLORS = ["#007aff", "#34c759", "#ff9500", "#af52de", "#ff3b30", "#5ac8fa"];

interface ResultChartProps {
  spec: ChartSpec;
  result: QueryResult;
}

export function ResultChart({ spec, result }: ResultChartProps) {
  const data = result.rows.map((row) => ({
    [spec.labelKey]: row[spec.labelKey],
    [spec.valueKey]:
      typeof row[spec.valueKey] === "number" ? row[spec.valueKey] : Number(row[spec.valueKey]),
  }));

  return (
    <div className="rounded-xl bg-white border border-[var(--color-border)] p-4" style={{ height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        {spec.type === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
            <XAxis dataKey={spec.labelKey} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey={spec.valueKey} fill={ACCENT} radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : spec.type === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
            <XAxis dataKey={spec.labelKey} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey={spec.valueKey} stroke={ACCENT} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        ) : (
          <PieChart>
            <Tooltip />
            <Pie data={data} dataKey={spec.valueKey} nameKey={spec.labelKey} outerRadius={100} label>
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
