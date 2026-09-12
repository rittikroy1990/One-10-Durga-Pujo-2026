import React from "react";
import { cn } from "../lib/utils";

/**
 * Official ONE 10 wordmark — orange ONE + oversized serif 1 + 0 + smile.
 */
export default function BrandLogo({
  className,
  imgClassName,
  alt = "ONE 10",
}) {
  return (
    <img
      src="/images/brand/one10-logo.png"
      alt={alt}
      className={cn("h-9 w-auto object-contain object-left sm:h-10", imgClassName, className)}
    />
  );
}
