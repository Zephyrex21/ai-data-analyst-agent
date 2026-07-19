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
import { formatDisplayValue, roundForDisplay } from "../lib/formatValue";
import { useTheme } from "../contexts/ThemeContext";

// Using literal hex values rather than CSS custom properties here — SVG
// presentation attributes (fill/stroke) don't reliably resolve var() across
// browsers, especially through a charting library's internal rendering.
// Kept theme-aware by branching on the current theme instead.
const ACCENT = "#0a84ff";
const PIE_COLORS = ["#0a84ff", "#34c759", "#ff9f0a", "#bf5af2", "#ff453a", "#64d2ff"];

interface ResultChartProps {
  spec: ChartSpec;
  result: QueryResult;
}

export function ResultChart({ spec, result }: ResultChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const gridStroke = isDark ? "#38383a" : "#e5e5ea";
  const tickColor = isDark ? "#98989d" : "#6e6e73";

  const data = result.rows.map((row) => {
    const raw = row[spec.valueKey];
    const num = typeof raw === "number" ? raw : Number(raw);
    return {
      [spec.labelKey]: row[spec.labelKey],
      // Rounded (not just formatted) so Recharts' own default pie label text
      // — which we don't control the rendering of — shows a clean number
      // instead of raw floating-point summation noise.
      [spec.valueKey]: roundForDisplay(num),
    };
  });

  const tooltipFormatter = (value: unknown) => formatDisplayValue(value);
  const tooltipStyle = {
    backgroundColor: isDark ? "#1c1c1e" : "#ffffff",
    border: `1px solid ${isDark ? "#38383a" : "#e5e5ea"}`,
    color: isDark ? "#f5f5f7" : "#1d1d1f",
    borderRadius: 8,
    fontSize: 13,
  };

  return (
    <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4" style={{ height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        {spec.type === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey={spec.labelKey} tick={{ fontSize: 12, fill: tickColor }} />
            <YAxis tick={{ fontSize: 12, fill: tickColor }} tickFormatter={(v) => formatDisplayValue(v)} />
            <Tooltip formatter={tooltipFormatter} contentStyle={tooltipStyle} />
            <Bar dataKey={spec.valueKey} fill={ACCENT} radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : spec.type === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey={spec.labelKey} tick={{ fontSize: 12, fill: tickColor }} />
            <YAxis tick={{ fontSize: 12, fill: tickColor }} tickFormatter={(v) => formatDisplayValue(v)} />
            <Tooltip formatter={tooltipFormatter} contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey={spec.valueKey} stroke={ACCENT} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        ) : (
          <PieChart>
            <Tooltip formatter={tooltipFormatter} contentStyle={tooltipStyle} />
            <Pie
              data={data}
              dataKey={spec.valueKey}
              nameKey={spec.labelKey}
              outerRadius={100}
              label={{ fill: tickColor }}
            >
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
