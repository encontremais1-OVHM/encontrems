import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertCircle, ArrowRight, ChevronDown, LayoutGrid, Target, UsersRound } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { describeApiError } from "@/lib/api/client";
import { publicCommunitiesQuery } from "@/lib/api/endpoints";
import type { PublicCommunity } from "@/lib/api/types";
import { isApiConfigured } from "@/lib/config";
import { cn } from "@/lib/utils";

const VISIBLE_SUBGROUPS = 4;

export function CommunityCard({ community }: { community: PublicCommunity }) {
  const [expanded, setExpanded] = useState(false);
  const subgroups = expanded ? community.subgroups : community.subgroups.slice(0, VISIBLE_SUBGROUPS);
  const hidden = community.subgroups.length - VISIBLE_SUBGROUPS;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card transition-shadow hover:shadow-elevated">
      <div className="relative aspect-[16/9] overflow-hidden bg-accent">
        {community.image_url ? (
          <img
            src={community.image_url}
            alt={community.name}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="surface-grid flex size-full items-center justify-center">
            <span className="font-display text-5xl font-black text-accent-foreground/70">
              {community.name.charAt(0)}
            </span>
          </div>
        )}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/95 px-2.5 py-1 text-xs font-semibold text-foreground shadow-card">
          <LayoutGrid className="size-3.5 text-primary" />
          {community.subgroups.length} {community.subgroups.length === 1 ? "subgrupo" : "subgrupos"}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-xl font-extrabold text-foreground">{community.name}</h3>
        {community.description && (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{community.description}</p>
        )}

        {community.purpose && (
          <div className="mt-4 flex gap-2.5 rounded-xl bg-muted/70 p-3">
            <Target className="mt-0.5 size-4 shrink-0 text-brand-teal" />
            <p className="text-sm text-foreground">
              <span className="font-semibold">Finalidade: </span>
              <span className="text-muted-foreground">{community.purpose}</span>
            </p>
          </div>
        )}

        {community.subgroups.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Subgrupos</p>
            <ul className="mt-2 divide-y rounded-xl border">
              {subgroups.map((s) => (
                <li key={s.id} className="px-3 py-2.5">
                  <p className="text-sm font-semibold text-foreground">{s.name}</p>
                  {s.description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.description}</p>
                  )}
                </li>
              ))}
            </ul>
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                aria-expanded={expanded}
              >
                {expanded ? "Mostrar menos" : `Ver mais ${hidden} ${hidden === 1 ? "subgrupo" : "subgrupos"}`}
                <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
              </button>
            )}
          </div>
        )}

        <div className="mt-auto pt-6">
          <Button asChild className="w-full font-semibold">
            <Link to="/inscricao" search={{ comunidade: community.slug }}>
              Quero entrar <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

function CatalogSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="A carregar comunidades">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border bg-card">
          <Skeleton className="aspect-[16/9] rounded-none" />
          <div className="space-y-3 p-5">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Public catalogue of communities, always loaded from the Laravel API. */
export function CommunityCatalog({ limit }: { limit?: number }) {
  const configured = isApiConfigured();
  const query = useQuery(publicCommunitiesQuery());

  if (!configured) {
    return (
      <div className="rounded-2xl border border-dashed bg-card">
        <EmptyState
          icon={UsersRound}
          title="Catálogo de comunidades em preparação"
          description="As comunidades e os subgrupos são publicados a partir do painel. Vão aparecer aqui assim que o servidor estiver ligado."
        />
      </div>
    );
  }

  if (query.isPending) return <CatalogSkeleton count={limit ?? 3} />;

  if (query.isError) {
    return (
      <div className="rounded-2xl border bg-card">
        <EmptyState
          icon={AlertCircle}
          title="Não foi possível carregar as comunidades"
          description={describeApiError(query.error)}
          action={
            <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
              Tentar novamente
            </Button>
          }
        />
      </div>
    );
  }

  const communities = limit ? query.data.data.slice(0, limit) : query.data.data;

  if (communities.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-card">
        <EmptyState
          icon={UsersRound}
          title="Ainda não há comunidades publicadas"
          description="Volte em breve — novas comunidades e subgrupos estão a ser preparados."
        />
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {communities.map((c) => (
        <CommunityCard key={c.id} community={c} />
      ))}
    </div>
  );
}
