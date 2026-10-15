import type en from "../../messages/en.json";

// Types the keys of `t()` against the reference translation file.
declare module "next-intl" {
  interface AppConfig {
    Locale: string;
    Messages: typeof en;
  }
}
