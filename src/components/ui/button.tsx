"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { press, springs } from "@/lib/motion";

/**
 * Buttons on the neutral shell (docs/DESIGN.md). Hover and active are
 * lightness shifts, never a hue. 44 px tall on phones, a little denser on
 * larger screens. Every button presses in with the snappy spring.
 */
const buttonVariants = cva(
  "focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap select-none transition-[background-color,color,border-color] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklch,var(--primary),var(--background)_16%)]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        outline: "border border-input bg-card text-foreground hover:bg-accent",
        ghost: "text-foreground hover:bg-accent",
        destructive: "chip-tint text-destructive hover:bg-[color-mix(in_oklch,var(--destructive),transparent_76%)]",
        link: "h-auto px-0 text-foreground underline underline-offset-4 hover:text-muted-foreground",
      },
      size: {
        default: "min-h-11 px-4 sm:min-h-9",
        sm: "min-h-11 px-3 sm:min-h-8",
        lg: "min-h-11 px-5 text-base",
        icon: "size-11 sm:size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, ...props }: ButtonProps) {
  const reduce = useReducedMotion();
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      render={<motion.button whileTap={reduce ? undefined : press} transition={springs.snappy} />}
      {...props}
    />
  );
}

const MotionLink = motion.create(Link);

/** A link that looks like a button (navigation stays a real link). */
function ButtonLink({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  const reduce = useReducedMotion();
  return (
    <MotionLink
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      whileTap={reduce ? undefined : press}
      transition={springs.snappy}
      {...(props as React.ComponentProps<typeof MotionLink>)}
    />
  );
}

/** An external or tel/mailto link that looks like a button. */
function ButtonAnchor({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"a"> & VariantProps<typeof buttonVariants>) {
  const reduce = useReducedMotion();
  return (
    <motion.a
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      whileTap={reduce ? undefined : press}
      transition={springs.snappy}
      {...(props as React.ComponentProps<typeof motion.a>)}
    />
  );
}

export { Button, ButtonLink, ButtonAnchor, buttonVariants };
