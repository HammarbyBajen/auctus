import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/**
 * Buttons in Tegen's style: Abel uppercase labels, at least 44 px tall so they are
 * easy to hit on a phone, a clear focus ring, and only colour and transform animate.
 */
const buttonVariants = cva(
  "label-caps inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-base whitespace-nowrap transition-[background-color,color,border-color,box-shadow,transform] duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[#2f382f]",
        outline: "border-input bg-card text-foreground hover:border-foreground/40 hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "text-foreground hover:bg-accent",
        destructive: "bg-danger-surface text-danger-text hover:bg-[#fbd9d5]",
        link: "h-auto px-0 text-foreground underline underline-offset-4 hover:text-tegen-mid-green",
      },
      size: {
        default: "min-h-11 px-4 py-2",
        sm: "min-h-9 px-3 text-sm",
        lg: "min-h-12 px-6 text-lg",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
