import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth, format } from "date-fns";

export type DateRange = { from: Date; to: Date };

type Preset = "today" | "yesterday" | "this_week" | "this_month" | "all";

const presets: { value: Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "all", label: "All Time" },
];

function getRange(preset: Preset): DateRange | null {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday":
      return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
    case "this_week":
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfDay(now) };
    case "this_month":
      return { from: startOfMonth(now), to: endOfDay(now) };
    case "all":
      return null;
  }
}

interface DateFilterProps {
  defaultPreset?: Preset;
  onChange: (range: DateRange | null) => void;
}

export const DateFilter = ({ defaultPreset = "today", onChange }: DateFilterProps) => {
  const [active, setActive] = useState<Preset | "custom">(defaultPreset);
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});

  const handlePreset = (preset: Preset) => {
    setActive(preset);
    onChange(getRange(preset));
  };

  const handleCustomSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (!range) return;
    setCustomRange(range);
    setActive("custom");
    if (range.from && range.to) {
      onChange({ from: startOfDay(range.from), to: endOfDay(range.to) });
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {presets.map((p) => (
        <Button
          key={p.value}
          size="sm"
          variant={active === p.value ? "default" : "outline"}
          onClick={() => handlePreset(p.value)}
          className="text-xs h-8"
        >
          {p.label}
        </Button>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant={active === "custom" ? "default" : "outline"} className="text-xs h-8">
            <CalendarIcon className="h-3.5 w-3.5 mr-1" />
            {active === "custom" && customRange.from && customRange.to
              ? `${format(customRange.from, "MMM d")} – ${format(customRange.to, "MMM d")}`
              : "Custom"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={customRange as any}
            onSelect={handleCustomSelect as any}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};
