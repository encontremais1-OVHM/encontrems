import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

import { HERO_COLUMNS, type HeroGroup } from "./hero-groups";

function Tile({ group, eager }: { group: HeroGroup; eager: boolean }) {
  return (
    <figure className="relative overflow-hidden rounded-2xl bg-muted shadow-elevated ring-1 ring-foreground/5">
      <img
        src={group.image}
        alt=""
        width={736}
        height={912}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="aspect-[4/5] w-full object-cover"
        draggable={false}
      />
      <figcaption className="tile-overlay absolute inset-0 flex items-end p-2.5 sm:p-3">
        <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-background/95 py-1 pl-1 pr-2.5 shadow-card backdrop-blur">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground sm:size-6">
            <group.icon className="size-3 sm:size-3.5" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-[0.55rem] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[0.6rem]">
              Grupo de
            </span>
            <span className="block truncate text-[0.68rem] font-bold text-foreground sm:text-xs">
              {group.label}
            </span>
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

const DIRECTIONS = ["up", "down", "up"] as const;
const DURATIONS = ["46s", "54s", "50s"];

/**
 * Three vertical columns of group tiles scrolling infinitely in alternating
 * directions. Each column renders its tiles twice and translates by exactly
 * -50%; spacing lives in each item's bottom padding so both halves are
 * identical and the loop has no visible seam. Static under reduced motion.
 */
export function HeroColumns({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "mask-fade-y relative grid grid-cols-3 gap-3 overflow-hidden sm:gap-4",
        className,
      )}
      role="img"
      aria-label="Exemplos de grupos da comunidade: salão de beleza, imobiliárias, pastelarias, empreendedores, emprego, tecnologia, serviços, comércio, formação e negócios."
    >
      {HERO_COLUMNS.map((column, colIndex) => {
        const direction = DIRECTIONS[colIndex] ?? "up";
        return (
          <div
            key={colIndex}
            className={cn("relative", colIndex === 1 && "-mt-10 sm:-mt-16")}
          >
            <div
              className={cn(
                "flex flex-col will-change-transform motion-reduce:animate-none",
                direction === "up" ? "animate-scroll-up" : "animate-scroll-down",
              )}
              style={{ "--scroll-duration": DURATIONS[colIndex] } as CSSProperties}
            >
              {[0, 1].map((copy) =>
                column.map((group, i) => (
                  <div
                    key={`${copy}-${group.label}`}
                    className="pb-3 sm:pb-4"
                    aria-hidden="true"
                  >
                    <Tile group={group} eager={copy === 0 && i < 2} />
                  </div>
                )),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
