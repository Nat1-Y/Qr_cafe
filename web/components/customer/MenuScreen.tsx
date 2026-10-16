"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { XIcon } from "lucide-react";
import { SearchInput } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { matchesSearch } from "@/lib/ordering/menu";
import { useI18n } from "@/lib/customer/i18n";
import type { Landing, Menu, MenuItem } from "@/lib/customer/types";
import { GuestHeader } from "./GuestHeader";
import { MenuItemCard } from "./MenuItemCard";

const DRINK_SECTION = /barista|drink|coffee|juice|tea|bar\b|ቡና|መጠጥ|ሻይ|ጭማቂ/i;

export function isDrinkSection(key: string, name: string): boolean {
  return DRINK_SECTION.test(key) || DRINK_SECTION.test(name);
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function MenuScreen({
  landing,
  menu,
  canOrder,
  cartQtyById,
  ordersCount,
  onOpenItem,
  onQuickAdd,
  onOrders,
  bottomSpace,
}: {
  landing: Landing;
  menu: Menu;
  canOrder: boolean;
  cartQtyById: Map<string, number>;
  ordersCount: number;
  onOpenItem: (item: MenuItem, drink: boolean) => void;
  onQuickAdd: (item: MenuItem, drink: boolean) => void;
  onOrders: () => void;
  bottomSpace: boolean;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const groups = useMemo(
    () =>
      menu.sections.flatMap((s) =>
        s.groups.map((g) => ({ ...g, sectionKey: s.key, sectionName: s.name, drink: isDrinkSection(s.key, s.name) })),
      ),
    [menu],
  );
  const [active, setActive] = useState<string | null>(null);
  const activeKey = active ?? groups[0]?.key ?? null;
  const railRef = useRef<HTMLDivElement>(null);
  const programmatic = useRef(0);

  const searching = query.trim().length > 0;
  const results = useMemo(() => {
    if (!searching) return [];
    return groups.flatMap((g) =>
      g.items.filter((i) => matchesSearch(query, i.name, i.description, g.name, g.sectionName)).map((item) => ({ item, drink: g.drink })),
    );
  }, [groups, query, searching]);

  // Scroll-spy: the group nearest the top (under the sticky header) is active.
  useEffect(() => {
    if (searching) return;
    const sections = groups
      .map((g) => document.getElementById(`group-${g.key}`))
      .filter((el): el is HTMLElement => el != null);
    if (sections.length === 0) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const key = e.target.getAttribute("data-key") ?? "";
          if (e.isIntersecting) visible.set(key, e.boundingClientRect.top);
          else visible.delete(key);
        }
        if (Date.now() < programmatic.current) return;
        let best: string | null = null;
        let bestTop = Infinity;
        for (const [key, top] of visible) {
          if (top < bestTop) {
            bestTop = top;
            best = key;
          }
        }
        if (best) setActive(best);
      },
      { rootMargin: "-140px 0px -55% 0px", threshold: 0 },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [groups, searching]);

  // Keep the active chip in view inside the rail.
  useEffect(() => {
    if (!activeKey || !railRef.current) return;
    const chip = railRef.current.querySelector<HTMLElement>(`[data-chip="${CSS.escape(activeKey)}"]`);
    chip?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", inline: "center", block: "nearest" });
  }, [activeKey]);

  const jumpTo = useCallback((key: string) => {
    const el = document.getElementById(`group-${key}`);
    if (!el) return;
    programmatic.current = Date.now() + 800;
    setActive(key);
    el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }, []);

  return (
    <div className={cn("min-h-dvh", bottomSpace && "pb-32")}>
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <GuestHeader landing={landing} ordersCount={ordersCount} onOrders={onOrders} />
        {!searching ? (
          <nav aria-label={t("categories")} className="relative">
            <div ref={railRef} className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {groups.map((g) => {
                const on = g.key === activeKey;
                return (
                  <button
                    key={g.key}
                    type="button"
                    data-chip={g.key}
                    aria-current={on ? "true" : undefined}
                    onClick={() => jumpTo(g.key)}
                    className={cn(
                      "h-11 shrink-0 rounded-full border px-4 text-meta font-semibold whitespace-nowrap transition-colors focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:bg-row-hover",
                    )}>
                    {g.name}
                  </button>
                );
              })}
            </div>
          </nav>
        ) : null}
      </header>

      <div className="px-4 pt-4">
        <div className="relative">
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="h-12"
            enterKeyHint="search"
          />
          {searching ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("clearSearch")}
              className="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none">
              <XIcon className="size-4" />
            </button>
          ) : null}
        </div>
        {!landing.options.show_prices ? <p className="mt-2 text-meta text-muted-foreground">{t("pricesHidden")}</p> : null}
      </div>

      {searching ? (
        <section aria-live="polite" className="px-4 pt-4">
          {results.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">{t("noResults", { q: query.trim() })}</p>
          ) : (
            <ul className="space-y-3">
              {results.map(({ item, drink }) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  drink={drink}
                  canOrder={canOrder}
                  inCart={cartQtyById.get(item.id) ?? 0}
                  onOpen={(i) => onOpenItem(i, drink)}
                  onQuickAdd={(i) => onQuickAdd(i, drink)}
                />
              ))}
            </ul>
          )}
        </section>
      ) : (
        menu.sections.map((section) => (
          <div key={section.key} className="pt-2">
            {menu.sections.length > 1 ? (
              <h2 className="px-4 pt-4 text-eyebrow tracking-wide text-accent uppercase">{section.name}</h2>
            ) : null}
            {section.groups.map((g) => {
              const drink = isDrinkSection(section.key, section.name);
              return (
                <section
                  key={g.key}
                  id={`group-${g.key}`}
                  data-key={g.key}
                  aria-labelledby={`group-title-${g.key}`}
                  className="scroll-mt-[136px] px-4 pt-3">
                  <h3 id={`group-title-${g.key}`} className="pb-3 text-section text-foreground">
                    {g.name}
                  </h3>
                  <ul className="space-y-3">
                    {g.items.map((item) => (
                      <MenuItemCard
                        key={item.id}
                        item={item}
                        drink={drink}
                        canOrder={canOrder}
                        inCart={cartQtyById.get(item.id) ?? 0}
                        onOpen={(i) => onOpenItem(i, drink)}
                        onQuickAdd={(i) => onQuickAdd(i, drink)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
