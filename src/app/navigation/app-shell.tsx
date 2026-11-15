import { getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  ArrowsDownUp,
  ChartLine,
  GearSix,
  Plus,
  Tray,
  TrayArrowDown,
  Wallet,
} from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";

import { Icon } from "../../components/icon";
import { Logo } from "../../components/logo";
import styles from "./app-shell.module.css";
import { NavLink } from "./nav-link";

// The interim tab bar (DESIGN section 6): Calendar replaces Transactions in M2, Simulations
// replaces Imports in M3. The sidebar shows the same four, then the queue and Settings.
const TABS = [
  { href: "/", key: "overview", icon: ChartLine },
  { href: "/transactions", key: "transactions", icon: ArrowsDownUp },
  { href: "/accounts", key: "accounts", icon: Wallet },
  { href: "/imports", key: "imports", icon: TrayArrowDown },
] as const;

const QUEUE_HREF = "/categories";
const SETTINGS_HREF = "/settings";
const ADD_TRANSACTION_HREF = "/transactions#new-heading";

const ICON_BUTTON =
  "inline-flex size-11 items-center justify-center rounded-pill transition-colors";

type AppShellProps = {
  /** Size of the to-categorize queue, shown next to its item on wide containers. */
  toCategorizeCount: number;
  children: ReactNode;
};

/**
 * The frame of every signed-in page. One header and one navigation serve both widths: a
 * container query on the frame turns them into a sidebar (900 px and more) or into a top
 * bar and a floating tab bar. Only Settings has two links, one for each width.
 */
export async function AppShell({ toCategorizeCount, children }: AppShellProps) {
  const [t, common] = await Promise.all([
    getTranslations("navigation"),
    getTranslations("common"),
  ]);

  return (
    <div className={styles.frame}>
      <div className={styles.shell}>
        <div className={styles.side}>
          <header className={styles.bar}>
            <Logo label={common("appName")} />
            <div className={styles.narrowOnly}>
              <NavLink
                href={SETTINGS_HREF}
                aria-label={t("settings")}
                className={`${ICON_BUTTON} hover:bg-control`}
              >
                <Icon icon={GearSix} />
              </NavLink>
              <Link
                href={ADD_TRANSACTION_HREF}
                aria-label={t("addTransaction")}
                className={`${ICON_BUTTON} bg-primary text-on-primary hover:bg-primary-hover`}
              >
                <Icon icon={Plus} />
              </Link>
            </div>
          </header>
          <nav aria-label={t("label")} className={styles.nav}>
            <ul className={styles.tabs}>
              {TABS.map(({ href, key, icon }) => (
                <li key={href}>
                  <NavLink href={href} className={styles.item}>
                    <Icon icon={icon} />
                    {t(key)}
                  </NavLink>
                </li>
              ))}
              <li className={styles.wideOnly}>
                <NavLink href={QUEUE_HREF} className={styles.item}>
                  <Icon icon={Tray} />
                  {t("toCategorize")}
                  <span aria-hidden="true" className={styles.count}>
                    {toCategorizeCount}
                  </span>
                  <span className="sr-only">, {t("queueCount", { count: toCategorizeCount })}</span>
                </NavLink>
              </li>
            </ul>
            <ul className={`${styles.foot} ${styles.wideOnly}`}>
              <li>
                <NavLink href={SETTINGS_HREF} className={styles.item}>
                  <Icon icon={GearSix} />
                  {t("settings")}
                </NavLink>
              </li>
            </ul>
          </nav>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
