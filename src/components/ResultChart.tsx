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
// Kept theme-aware by branching on the current theme instead. Palette is a
// muted, premium pastel set matching the clay design system rather than
// vivid system colors — periwinkle first (the brand accent), then softly
// desaturated sage/gold/plum/rose/teal.
const PIE_COLORS_LIGHT = ["#5b5fc7", "#6fae8c", "#e0a458", "#a374b5", "#d97d75", "#5aa9c9"];
const PIE_COLORS_DARK = ["#9296f0", "#8ec6a8", "#e8bc7e", "#c199d1", "#e6a099", "#7cc3dd"];

interface ResultChartProps {
  spec: ChartSpec;
  result: QueryResult;
}

export function ResultChart({ spec, result }: ResultChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accent = isDark ? "#9296f0" : "#5b5fc7";
  const pieColors = isDark ? PIE_COLORS_DARK : PIE_COLORS_LIGHT;
  const gridStroke = isDark ? "#3d3958" : "#ddd9ee";
  const tickColor = isDark ? "#a29cc2" : "#6b6785";

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
    backgroundColor: isDark ? "#2a2740" : "#f8f7fb",
    border: `1px solid ${isDark ? "#3d3958" : "#ddd9ee"}`,
    color: isDark ? "#ede9f7" : "#2e2b45",
    borderRadius: 14,
    fontSize: 13,
  };

  return (
    <div className="clay p-4" style={{ height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        {spec.type === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey={spec.labelKey} tick={{ fontSize: 12, fill: tickColor }} />
            <YAxis tick={{ fontSize: 12, fill: tickColor }} tickFormatter={(v) => formatDisplayValue(v)} />
            <Tooltip formatter={tooltipFormatter} contentStyle={tooltipStyle} />
            <Bar dataKey={spec.valueKey} fill={accent} radius={[8, 8, 0, 0]} />
          </BarChart>
        ) : spec.type === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey={spec.labelKey} tick={{ fontSize: 12, fill: tickColor }} />
            <YAxis tick={{ fontSize: 12, fill: tickColor }} tickFormatter={(v) => formatDisplayValue(v)} />
            <Tooltip formatter={tooltipFormatter} contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey={spec.valueKey} stroke={accent} strokeWidth={3} dot={{ r: 4 }} />
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
                <Cell key={i} fill={pieColors[i % pieColors.length]} />
              ))}
            </Pie>
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
