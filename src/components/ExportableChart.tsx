import { useRef, useCallback, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface ExportableChartProps {
  title: string;
  titleIcon?: ReactNode;
  children: ReactNode;
  fileName?: string;
}

const ExportableChart = ({ title, titleIcon, children, fileName }: ExportableChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);

  const exportAsPNG = useCallback(() => {
    if (!chartRef.current) return;

    const svg = chartRef.current.querySelector("svg");
    if (!svg) return;

    const svgClone = svg.cloneNode(true) as SVGElement;
    const bbox = svg.getBoundingClientRect();
    svgClone.setAttribute("width", String(bbox.width));
    svgClone.setAttribute("height", String(bbox.height));

    // Inline computed styles for export fidelity
    const allEls = svgClone.querySelectorAll("*");
    const origEls = svg.querySelectorAll("*");
    allEls.forEach((el, i) => {
      const computed = window.getComputedStyle(origEls[i]);
      (el as HTMLElement).style.fill = computed.fill;
      (el as HTMLElement).style.stroke = computed.stroke;
      (el as HTMLElement).style.fontSize = computed.fontSize;
      (el as HTMLElement).style.fontFamily = computed.fontFamily;
    });

    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgClone);
    const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const scale = 2; // retina quality
      const canvas = document.createElement("canvas");
      canvas.width = bbox.width * scale;
      canvas.height = bbox.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue("--background")
        ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue("--background").trim()})`
        : "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${fileName || title.replace(/\s+/g, "_").toLowerCase()}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, "image/png");

      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [title, fileName]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {titleIcon}
            {title}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={exportAsPNG}
            title="Export as PNG"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div ref={chartRef}>{children}</div>
      </CardContent>
    </Card>
  );
};

export default ExportableChart;
