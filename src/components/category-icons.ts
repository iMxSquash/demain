import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
  Airplane,
  Barbell,
  Basket,
  Briefcase,
  Bus,
  Car,
  Coins,
  FirstAid,
  ForkKnife,
  GameController,
  Gift,
  GraduationCap,
  Heart,
  House,
  Lightning,
  PawPrint,
  Phone,
  Tag,
  Ticket,
  TShirt,
} from "@phosphor-icons/react/ssr";

import { DEFAULT_CATEGORY_ICON, type CategoryIcon } from "../domain/category";

// One drawing for each key of the closed set of the domain: a test fails when a key has none.
export const CATEGORY_ICON_COMPONENTS: Record<CategoryIcon, PhosphorIcon> = {
  tag: Tag,
  basket: Basket,
  "fork-knife": ForkKnife,
  house: House,
  bus: Bus,
  car: Car,
  airplane: Airplane,
  ticket: Ticket,
  "game-controller": GameController,
  heart: Heart,
  "first-aid": FirstAid,
  gift: Gift,
  coins: Coins,
  "graduation-cap": GraduationCap,
  "paw-print": PawPrint,
  lightning: Lightning,
  phone: Phone,
  "t-shirt": TShirt,
  barbell: Barbell,
  briefcase: Briefcase,
};

/** The drawing of a stored icon key: the default one for a key this version does not know. */
export function categoryIconOf(icon: string): PhosphorIcon {
  return (
    (CATEGORY_ICON_COMPONENTS as Record<string, PhosphorIcon | undefined>)[icon] ??
    CATEGORY_ICON_COMPONENTS[DEFAULT_CATEGORY_ICON]
  );
}
