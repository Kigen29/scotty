

# Chart & Spacing Improvements Plan

## Problems Identified
1. **Horizontal bar charts** (category breakdown in Reports, pipeline funnels in Dashboard/Reports) look cramped and hard to read
2. **Charts are too short** — 220px height is cramped, especially with many data points
3. **Spacing is tight** — cards and sections feel crammed with `space-y-6` and small padding
4. **No per-chart export** — only a global CSV export exists on Reports page

## Changes

### 1. Create a reusable `ExportableChart` wrapper component
**New file: `src/components/ExportableChart.tsx`**
- Wraps any chart card with a download button in the card header
- Uses `html-to-image` (or native canvas `toBlob`) to capture the chart container as PNG
- Also offers SVG export option
- Implementation: use a `ref` on the chart container, then `HTMLCanvasElement.toBlob()` via the recharts `<ResponsiveContainer>` inner SVG element — convert SVG to canvas to PNG using a small utility function (no new dependency needed — use native browser APIs: serialize SVG → draw on canvas → export)

### 2. Dashboard (`src/pages/Dashboard.tsx`)
- **Pipeline funnel**: Convert from horizontal bars to a **vertical stepped funnel** — each stage is a column with a colored bar growing upward, labels below. This is more intuitive and visually distinct
- **7-Day Activity chart**: Increase height from 220px to 300px, add more padding inside CardContent (`p-6` instead of default)
- **Spacing**: Change outer `space-y-6` to `space-y-8`, increase card content padding
- Wrap both charts with `ExportableChart`

### 3. Reports (`src/pages/Reports.tsx`)
- **"Leads by Category" bar chart**: Convert from `layout="vertical"` (horizontal bars) to standard **vertical bars** with categories on X-axis (rotated labels if needed). Increase height to 320px
- **Daily Activity area chart**: Increase height to 300px
- **Conversion Funnel**: Convert from horizontal progress bars to a **vertical bar chart** using Recharts BarChart with funnel-colored bars
- Increase spacing: `space-y-8`, card padding `p-6`
- Make charts full-width (single column) instead of 2-col grid for more breathing room
- Wrap all charts with `ExportableChart`

### 4. Deliverability (`src/pages/Deliverability.tsx`)
- Bar chart and pie chart heights: increase from 240px to 300px
- Add more spacing between sections
- Wrap charts with `ExportableChart`

### 5. Export Implementation (inside `ExportableChart`)
- Use a `ref` to grab the chart's SVG element
- Serialize SVG → create Image → draw on Canvas → `canvas.toBlob()` → download as PNG
- Button label: small download icon in card header, tooltip "Export as PNG"
- No new npm dependencies required

## Files to Create/Edit
1. **Create** `src/components/ExportableChart.tsx` — reusable wrapper with export button
2. **Edit** `src/pages/Dashboard.tsx` — vertical funnel, taller chart, better spacing, export buttons
3. **Edit** `src/pages/Reports.tsx` — vertical bars for categories, vertical funnel, taller charts, full-width layout, export buttons
4. **Edit** `src/pages/Deliverability.tsx` — taller charts, better spacing, export buttons

