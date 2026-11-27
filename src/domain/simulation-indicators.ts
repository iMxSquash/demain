// Indicators of one evaluated simulation (DOMAIN, Scenario evaluation pipeline, steps 3 and 4,
// D10), in the reference currency. They read a SimulationResult only, so nothing here reaches the
// real views (ADR-011). Pure: "today", the rates and the data are arguments.

import { isCalendarDate, type AccountKind } from "./account";
import { addDays } from "./calendar-date";
import { convertAmount, type ExchangeRate } from "./exchange-rate";
import type { DailyBalance } from "./projection";
import type { DateRange } from "./recurrence";
import type { SimulationResult } from "./simulation";
import { monthOf } from "./synthesis";

export interface IndicatorAccount {
  id: number;
  currency: string;
  kind: AccountKind;
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

/** Converts an amount of one counted account to the reference currency. */
type Converter = (amount: number) => number;

function assertCalendarDate(label: string, date: string): void {
  if (!isCalendarDate(date)) throw new RangeError(`${label} expects a calendar date, got ${date}`);
}

function assertDateInRange(label: string, date: string, range: DateRange): void {
  assertCalendarDate(label, date);
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
): { counted: Map<number, { kind: AccountKind; convert: Converter }>; missingRates: string[] } {
  const counted = new Map<number, { kind: AccountKind; convert: Converter }>();
  const missing = new Set<string>();
  for (const account of accounts) {
    if (account.archived) continue;
    const convert = (amount: number): number | null =>
      convertAmount(amount, account.currency, referenceCurrency, today, rates);
    if (convert(0) === null) {
      missing.add(account.currency);
      continue;
    }
    // The probe above proved the rate exists, so the fallback is never taken.
    counted.set(account.id, { kind: account.kind, convert: (amount) => convert(amount) ?? 0 });
  }
  return { counted, missingRates: [...missing] };
}

/** The day of a date, refused when the simulation did not evaluate it. */
function dayLookup(result: SimulationResult): (date: string) => DailyBalance {
  const byDate = new Map(result.days.map((day) => [day.date, day]));
  return (date) => {
    const day = byDate.get(date);
    if (day === undefined) throw new RangeError(`The simulation has no balance on ${date}`);
    return day;
  };
}

export function computeIndicators(
  result: SimulationResult,
  accounts: readonly IndicatorAccount[],
  options: IndicatorOptions,
): SimulationIndicators {
  const { range, today, savingsDate } = options;
  assertCalendarDate("Range start", range.from);
  assertCalendarDate("Range end", range.to);
  assertDateInRange("Today", today, range);
  assertDateInRange("Savings date", savingsDate, range);
  const { counted, missingRates } = countedAccounts(accounts, options);
  const dayOn = dayLookup(result);

  // An account absent from a day (not open yet) adds nothing to that day.
  const total = (day: DailyBalance, kind?: AccountKind): number => {
    let sum = 0;
    for (const [accountId, balance] of day.balances) {
      const account = counted.get(accountId);
      if (account === undefined || (kind !== undefined && account.kind !== kind)) continue;
      sum += account.convert(balance);
    }
    return sum;
  };

  let minimum = { amount: total(dayOn(today)), date: today };
  const lastDayOfMonth = new Map<string, DailyBalance>();
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    const day = dayOn(date);
    lastDayOfMonth.set(monthOf(date), day);
    if (date <= today) continue;
    const amount = total(day);
    // Strictly lower only: the first day of the low is kept.
    if (amount < minimum.amount) minimum = { amount, date };
  }

  let externalOutflows = 0;
  for (const flow of result.flows) {
    if (!flow.external || flow.amount >= 0 || flow.date < today || flow.date > range.to) continue;
    const account = counted.get(flow.accountId);
    if (account !== undefined) externalOutflows += account.convert(-flow.amount);
  }

  return {
    finalBalance: total(dayOn(range.to)),
    minimum,
    savingsAt: { date: savingsDate, amount: total(dayOn(savingsDate), "savings") },
    monthEnds: [...lastDayOfMonth].map(([month, day]) => ({
      month,
      checking: total(day, "checking"),
      savings: total(day, "savings"),
    })),
    externalOutflows,
    missingRates,
  };
}

/** Scenario minus reference: positive means the scenario costs more (D10). */
export function totalCost(scenario: SimulationIndicators, reference: SimulationIndicators): number {
  return scenario.externalOutflows - reference.externalOutflows;
}
