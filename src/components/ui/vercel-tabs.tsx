"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

interface Tab {
  id: string;
  label: string;
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  tabs: Tab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ className, tabs, activeTab, onTabChange, ...props }, ref) => {
    const fallbackTab = tabs[0]?.id ?? "";
    const [internalActiveTab, setInternalActiveTab] = React.useState(fallbackTab);
    const selectedTab = activeTab ?? internalActiveTab;
    const selectedIndex = Math.max(
      0,
      tabs.findIndex((tab) => tab.id === selectedTab),
    );
    const hoverRef = React.useRef<HTMLDivElement | null>(null);
    const activeRef = React.useRef<HTMLDivElement | null>(null);
    const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

    const positionElement = React.useCallback((element: HTMLElement | null, target: HTMLDivElement | null) => {
      if (!element || !target) return;
      target.style.left = `${element.offsetLeft}px`;
      target.style.width = `${element.offsetWidth}px`;
    }, []);

    const positionActive = React.useCallback(() => {
      positionElement(tabRefs.current[selectedIndex] ?? null, activeRef.current);
    }, [positionElement, selectedIndex]);

    React.useEffect(() => {
      const frame = window.requestAnimationFrame(positionActive);
      window.addEventListener("resize", positionActive);
      return () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener("resize", positionActive);
      };
    }, [positionActive, tabs]);

    return (
      <div ref={ref} className={cn("relative", className)} {...props}>
        <div className="relative">
          <div
            ref={hoverRef}
            className="absolute flex h-[30px] items-center rounded-[6px] bg-[#0e0f1114] opacity-0 transition-all duration-300 ease-out dark:bg-[#ffffff1a]"
            aria-hidden
          />
          <div
            ref={activeRef}
            className="absolute bottom-[-6px] h-[2px] bg-orange-500 transition-all duration-300 ease-out"
            aria-hidden
          />
          <div className="relative flex items-center space-x-[6px]" role="tablist">
            {tabs.map((tab, index) => (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                type="button"
                role="tab"
                aria-selected={index === selectedIndex}
                className={cn(
                  "h-[30px] cursor-pointer rounded-[6px] px-3 py-2 text-sm font-medium leading-5 transition-colors duration-300",
                  index === selectedIndex
                    ? "text-orange-700 dark:text-orange-300"
                    : "text-[#0e0f1199] dark:text-[#ffffff99]",
                )}
                onMouseEnter={(event) => {
                  positionElement(event.currentTarget, hoverRef.current);
                  if (hoverRef.current) hoverRef.current.style.opacity = "1";
                }}
                onMouseLeave={() => {
                  if (hoverRef.current) hoverRef.current.style.opacity = "0";
                }}
                onFocus={(event) => {
                  positionElement(event.currentTarget, hoverRef.current);
                  if (hoverRef.current) hoverRef.current.style.opacity = "1";
                }}
                onBlur={() => {
                  if (hoverRef.current) hoverRef.current.style.opacity = "0";
                }}
                onClick={() => {
                  setInternalActiveTab(tab.id);
                  onTabChange?.(tab.id);
                }}
              >
                <span className="flex h-full items-center justify-center whitespace-nowrap">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  },
);
Tabs.displayName = "Tabs";

export { Tabs };
