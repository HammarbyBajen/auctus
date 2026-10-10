"use client";

import { useEffect, useRef } from "react";

/**
 * A horizontal scroller that brings its `aria-current` item into view when the
 * current item changes (`current`), so the chosen stage tab is never hidden
 * past the edge on a phone, and a user's own scrolling is left alone otherwise.
 */
export function ScrollCurrent({ current, className, children, ...props }: React.ComponentProps<"nav"> & { current?: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    const item = el?.querySelector<HTMLElement>("[aria-current]");
    if (!el || !item) return;
    el.scrollLeft = item.offsetLeft - (el.clientWidth - item.offsetWidth) / 2;
  }, [current]);
  return (
    <nav ref={ref} className={className} {...props}>
      {children}
    </nav>
  );
}
