import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Served from /public so it works on every host (Netlify, Lovable, local).
 * Lovable-only asset URLs (/__l5e/...) do not exist on Netlify.
 */
const LOGO_SRC = "/images/logo-encontre.png";

/** Shows the official wordmark, with a clean text fallback if the image cannot load. */
export function Logo({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // The image may fail during server rendering, before React attaches onError.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  return failed ? (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-display text-xl font-black tracking-tight text-foreground",
        className,
      )}
      aria-label="Encontre +"
    >
      Encontre <span className="text-primary">+</span>
    </span>
  ) : (
    <img
      ref={imgRef}
      src={LOGO_SRC}
      alt="Encontre +"
      width={1757}
      height={502}
      className={cn("h-9 w-auto select-none", className)}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
