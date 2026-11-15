/**
 * Whether the navigation item `href` is the current page: the item's own path or a page
 * under it. The overview ("/") matches only itself, since no path starts with "//".
 */
export function isCurrentPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
