import { useLayoutEffect, useRef } from "react";

import { Breadcrumbs } from "@/components/Breadcrumbs";

export interface PathBarProps {
  folder: string;
  rootLabel: string;
  onNavigate: (path: string) => void;
}

export function PathBar({ folder, rootLabel, onNavigate }: PathBarProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null) return;
    scroller.scrollLeft = scroller.scrollWidth;
  }, [folder]);

  return (
    <div
      className="relative flex min-w-0 flex-1 items-center"
      data-testid="vault-path-bar"
      title={folder === "" ? rootLabel : `${rootLabel}/${folder}`}
    >
      <div
        ref={scrollerRef}
        className="flex h-8 min-w-0 flex-1 items-center overflow-x-auto overscroll-x-contain [scrollbar-width:thin]"
      >
        <Breadcrumbs folder={folder} rootLabel={rootLabel} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
