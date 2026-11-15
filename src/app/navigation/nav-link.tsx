"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { isCurrentPath } from "./is-current-path";

type NavLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
};

// A client component only for the pathname: the root layout does not render again on a
// navigation inside the app, so the current item cannot be decided on the server.
export function NavLink({ href, className, children, "aria-label": label }: NavLinkProps) {
  const isCurrent = isCurrentPath(usePathname(), href);

  return (
    <Link
      href={href}
      className={className}
      aria-label={label}
      aria-current={isCurrent ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
