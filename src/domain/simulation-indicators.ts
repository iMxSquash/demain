// Indicators of one evaluated simulation (DOMAIN, Scenario evaluation pipeline, steps 3 and 4,
// D10), in the reference currency. They read a SimulationResult only, so nothing here reaches the
// real views (ADR-011). Pure: "today", the rates and the data are arguments.

import { convertAmount, type ExchangeRate } from "./exchange-rate";
import type { DailyBalance } from "./projection";
import type { DateRange } from "./recurrence";
import type { SimulationResult } from "./simulation";

export interface IndicatorAccount {
  id: number;
  currency: string;
  kind: "checking" | "savings" | "other";
  archived: boolean;
}

export interface IndicatorOptions {
  referenceCurrency: string;
  rates: readonly ExchangeRate[];
  today: string;
  range: DateRange;
  /** Date of the "savings at a date" indicator, inside the range. */
  savingsDate: string;
}

export interface MonthEnd {
  month: string;
  checking: number;
  savings: number;
}

export interface SimulationIndicators {
  finalBalance: number;
  minimum: { amount: number; date: string };
  savingsAt: { date: string; amount: number };
  /** One row per month of the range; a partial last month ends on the range end. */
  monthEnds: MonthEnd[];
  /** Outflows to outside the user's accounts, from today to the end, as a positive sum. */
  externalOutflows: number;
  /** Currencies without a known rate: their accounts are left out of every total. */
  missingRates: string[];
}

type Kind = IndicatorAccount["kind"];
/** Converts an amount of one counted account to the reference currency. */
type Converter = (amount: number) => number;

function assertInRange(label: string, date: string, range: DateRange): void {
  if (date < range.from || date > range.to) {
    throw new RangeError(`${label} ${date} is outside the range ${range.from} to ${range.to}`);
  }
}

/**
 * The active accounts whose currency has a rate on today, each with its converter, and the
 * currencies left out. Every account converts at the same date, so a missing rate is the same
 * for all its amounts.
 */
function countedAccounts(
  accounts: readonly IndicatorAccount[],
  { referenceCurrency, rates, today }: IndicatorOptions,
): { counted: Map<number, { kind: Kind; convert: Converter }>; missingRates: string[] } {
  const counted = new Map<number, { kind: Kind; convert: Converter }>();
  const missing = new Set<string>();
  for (const account of accounts) {
    if (account.archived) continue;
    const convert = (amount: number): number | null =>
      convertAmount(amount, account.currency, referenceCurrency, today, rates);
    if (convert(0) === null) {
      missing.add(account.currency);
      continue;
    }
    counted.set(account.id, { kind: account.kind, convert: (amount) => convert(amount) ?? 0 });
  }
  return { counted, missingRates: [...missing] };
}

export function computeIndicators(
  result: SimulationResult,
  accounts: readonly IndicatorAccount[],
  options: IndicatorOptions,
): SimulationIndicators {
  const { range, today, savingsDate } = options;
  assertInRange("Today", today, range);
  assertInRange("Savings date", savingsDate, range);
  const { counted, missingRates } = countedAccounts(accounts, options);

  // An account absent from a day (not open yet) adds nothing to that day.
  const total = (day: DailyBalance, kind?: Kind): number => {
    let sum = 0;
    for (const [accountId, balance] of day.balances) {
      const account = counted.get(accountId);
      if (account === undefined || (kind !== undefined && account.kind !== kind)) continue;
      sum += account.convert(balance);
    }
    return sum;
  };

  const days = result.days.filter((day) => day.date >= range.from && day.date <= range.to);
  const ahead = days.filter((day) => day.date >= today);
  const last = ahead.at(-1);
  if (last === undefined) throw new RangeError(`The simulation has no day from today ${today}`);

  let minimum = { amount: total(ahead[0] ?? last), date: (ahead[0] ?? last).date };
  for (const day of ahead) {
    const amount = total(day);
    // Strictly lower only: the first day of the low is kept.
    if (amount < minimum.amount) minimum = { amount, date: day.date };
  }

  const savingsDay = days.find((day) => day.date === savingsDate);
  const monthEnds = new Map<string, MonthEnd>();
  for (const day of days) {
    // Days come in date order: the last day of each month overwrites the earlier ones.
    const month = day.date.slice(0, 7);
    monthEnds.set(month, {
      month,
      checking: total(day, "checking"),
      savings: total(day, "savings"),
    });
  }

  let externalOutflows = 0;
  for (const flow of result.flows) {
    if (!flow.external || flow.amount >= 0 || flow.date < today || flow.date > range.to) continue;
    const account = counted.get(flow.accountId);
    if (account !== undefined) externalOutflows += account.convert(-flow.amount);
  }

  return {
    finalBalance: total(last),
    minimum,
    savingsAt: {
      date: savingsDate,
      amount: savingsDay === undefined ? 0 : total(savingsDay, "savings"),
    },
    monthEnds: [...monthEnds.values()],
    externalOutflows,
    missingRates,
  };
}

/** Scenario minus reference: positive means the scenario costs more (D10). */
export function totalCost(scenario: SimulationIndicators, reference: SimulationIndicators): number {
  return scenario.externalOutflows - reference.externalOutflows;
}
