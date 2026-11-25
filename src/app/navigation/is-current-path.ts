import { LINK_ROUTE, TO_PAY_ROUTE } from "../planned/routes";

function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Pages whose path sits under one entry but that belong to another (DESIGN section 18, "Navigation"):
// To pay is an entry of its own, and the Link a transaction page is reached from the calendar.
const OWNERS: readonly { path: string; href: string }[] = [
  { path: TO_PAY_ROUTE, href: TO_PAY_ROUTE },
  { path: LINK_ROUTE, href: "/calendar" },
];

/**
 * Whether the navigation item `href` is the current page: the item's own path or a page
 * under it, unless that page belongs to another item. The overview ("/") matches only itself,
 * since no path starts with "//".
 */
export function isCurrentPath(pathname: string, href: string): boolean {
  const owner = OWNERS.find(({ path }) => isUnder(pathname, path));
  return owner === undefined ? isUnder(pathname, href) : owner.href === href;
}
