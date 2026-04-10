"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

interface DatePickerProps {
  date: string; // YYYY-MM-DD
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00"); // noon to avoid timezone shifts
  const today = new Date();
  const todayStr = today.toLocaleDateString("en-CA"); // YYYY-MM-DD in local tz
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString("en-CA");

  if (dateStr === todayStr) return "Today";
  if (dateStr === yesterdayStr) return "Yesterday";

  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function DatePicker({ date }: DatePickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  function navigate(newDate: string) {
    const params = new URLSearchParams(searchParams.toString());
    const today = new Date().toISOString().split("T")[0];
    if (newDate === today) {
      params.delete("date");
    } else {
      params.set("date", newDate);
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => navigate(shiftDate(date, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button variant="outline" className="min-w-[140px] justify-start gap-2" />
          }
        >
          <CalendarIcon className="h-4 w-4" />
          {formatDisplayDate(date)}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={new Date(date + "T12:00:00")}
            onSelect={(day) => {
              if (day) {
                navigate(day.toISOString().split("T")[0]);
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>

      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => navigate(shiftDate(date, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
