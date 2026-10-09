import { cn } from "@/lib/utils";

const tones = {
  destructive: "text-destructive",
  warning: "text-warning",
  success: "text-success",
  neutral: "text-muted-foreground",
} as const;

/**
 * A status chip: text in the status colour on a 12 % (light) or 16 % (dark)
 * tint of the same colour, never a solid fill. At most one tinted chip per row.
 * Always carries a word, so colour is never the only signal.
 */
export function Chip({
  tone = "neutral",
  icon: Icon,
  children,
  className,
}: {
  tone?: keyof typeof tones;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("chip-tint inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-2xs font-medium", tones[tone], className)}>
      {Icon && <Icon aria-hidden="true" className="size-3" />}
      {children}
    </span>
  );
}
