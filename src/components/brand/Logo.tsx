import logoAsset from "@/assets/logo-encontre.png.asset.json";
import { cn } from "@/lib/utils";

/** Official Encontre + wordmark. Never redraw — always render the supplied asset. */
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src={logoAsset.url}
      alt="Encontre +"
      width={1757}
      height={502}
      className={cn("h-9 w-auto select-none", className)}
      draggable={false}
    />
  );
}
