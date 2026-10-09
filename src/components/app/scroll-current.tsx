"use client";

import { useEffect, useRef } from "react";

/**
 * A horizontal scroller that brings its `aria-current` item into view, so the
 * chosen stage tab is never hidden past the edge on a phone.
 */
export function ScrollCurrent({ className, children, ...props }: React.ComponentProps<"nav">) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    const current = el?.querySelector<HTMLElement>("[aria-current]");
    if (!el || !current) return;
    el.scrollLeft = current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2;
  });
  return (
    <nav ref={ref} className={className} {...props}>
      {children}
    </nav>
  );
}
