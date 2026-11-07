import logoAsset from "@/assets/logo-encontre.png.asset.json";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Shows the supplied wordmark when available and a clean text fallback if the source asset is unavailable. */
export function Logo({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className={cn("inline-flex items-center gap-1 font-display text-xl font-black tracking-tight text-foreground",className)} aria-label="Encontre +">
      Encontre <span className="text-primary">+</span>
    </span>
  ) : (
    <img src={logoAsset.url} alt="Encontre +" width={1757} height={502}
      className={cn("h-9 w-auto select-none",className)} draggable={false}
      onError={() => setFailed(true)} />
  );
}
