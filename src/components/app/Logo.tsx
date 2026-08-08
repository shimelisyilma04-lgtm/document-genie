import { Link } from "@tanstack/react-router";
import { ScanText } from "lucide-react";

import { cn } from "@/lib/utils";

export function Logo({
  compact = false,
  onInk = false,
  className,
}: {
  compact?: boolean;
  onInk?: boolean;
  className?: string;
}) {
  return (
    <Link to="/" className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-gold text-gold-foreground shadow-soft">
        <ScanText className="size-[18px]" />
      </span>
      {!compact && (
        <span
          className={cn(
            "font-display text-[15px] font-semibold tracking-tight",
            onInk ? "text-ink-foreground" : "text-foreground",
          )}
        >
          OmniParse<span className="text-gold"> AI</span>
        </span>
      )}
    </Link>
  );
}
