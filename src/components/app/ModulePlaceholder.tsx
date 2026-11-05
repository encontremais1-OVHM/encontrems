import type { LucideIcon } from "lucide-react";
import { Check, Construction } from "lucide-react";

import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";

/**
 * Honest placeholder for modules scheduled in later phases: shows what the
 * module will do and the API contract it will consume. No fake data, no
 * decorative buttons.
 */
export function ModulePlaceholder({
  icon,
  title,
  description,
  phase,
  features,
  endpoints,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  phase: number;
  features: string[];
  endpoints: string[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        eyebrow={<Badge variant="accent">Fase {phase}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="rounded-xl border bg-card shadow-card lg:col-span-3">
          <EmptyState
            className="h-full"
            icon={icon}
            title={`Módulo em preparação — Fase ${phase}`}
            description="A interface deste módulo será ligada ao backend Laravel nesta fase. Até lá, não são apresentados dados."
          />
        </section>

        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-xl border bg-card p-5 shadow-card">
            <h2 className="text-sm font-bold text-foreground">Funcionalidades previstas</h2>
            <ul className="mt-3 space-y-2">
              {features.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-teal" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-card">
            <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Construction className="size-4 text-muted-foreground" />
              Contrato de API (Laravel)
            </h2>
            <ul className="mt-3 space-y-1.5">
              {endpoints.map((e) => (
                <li
                  key={e}
                  className="rounded-md bg-muted px-2.5 py-1.5 font-mono text-[0.72rem] text-secondary-foreground"
                >
                  {e}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
