import { slugifyForFilename } from "./downloadCsv";

// Standard SVG → canvas → PNG rasterization. Recharts renders a real,
// fully-sized <svg> (via ResponsiveContainer, which measures its container
// and sets explicit width/height on mount) — this reads that live element
// directly rather than trying to reconstruct the chart, so whatever's
// actually on screen is exactly what gets exported.
//
// NOTE: this is the one piece of Phase 29 that's genuinely hard to verify
// without a real browser — canvas/Image/SVG-serialization behavior can have
// subtle cross-browser quirks this sandbox can't exercise. Flagged in
// PHASE_20_QA_CHECKLIST.md for a real pass.

const EXPORT_SCALE = 2; // renders at 2x the on-screen size for a crisper download

export class ChartExportError extends Error {}

function getSvgDimensions(svg: SVGSVGElement): { width: number; height: number } {
  const rect = svg.getBoundingClientRect();
  const width = rect.width || svg.viewBox.baseVal.width || 600;
  const height = rect.height || svg.viewBox.baseVal.height || 320;
  return { width, height };
}

export async function downloadSvgAsPng(svg: SVGSVGElement, questionForFilename: string): Promise<void> {
  const { width, height } = getSvgDimensions(svg);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  const svgText = new XMLSerializer().serializeToString(clone);
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;

  const image = await loadImage(svgDataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = width * EXPORT_SCALE;
  canvas.height = height * EXPORT_SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ChartExportError("Couldn't get a 2D canvas context.");

  // White background regardless of the app's current theme — a downloaded
  // chart is likely to end up pasted somewhere that assumes an opaque,
  // light background (a doc, a slide), not layered over something dark.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  ctx.drawImage(image, 0, 0, width, height);

  const pngDataUrl = canvas.toDataURL("image/png");

  const link = document.createElement("a");
  link.href = pngDataUrl;
  link.download = `${slugifyForFilename(questionForFilename)}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ChartExportError("Couldn't render the chart for export."));
    img.src = src;
  });
}
