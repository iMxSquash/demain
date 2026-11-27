// Amortization schedule of a loan or of instalments (DOMAIN, Inputs of each modification type,
// type 3, and Rounding of the engine, D4 rule 3). Pure: the dates and amounts are arguments.

import { addMonths, parseDate } from "./calendar-date";
import { divideRound, divideRoundBig } from "./money";
import { nominalDates } from "./recurrence";

export interface LoanPayment {
  date: string;
  /** Positive minor units: interest plus principal. */
  amount: number;
  interest: number;
  principal: number;
}

/** Basis points over a year to a monthly rate: 10000 basis points x 12 months. */
const MONTHLY_RATE_DENOMINATOR = 120000;

/** Monthly on the day of the date received, from the month after it, clamped to shorter months. */
function paymentDates(months: number, receivedOn: string): string[] {
  const repetition = { kind: "monthly_on_day", day: parseDate(receivedOn).day } as const;
  const range = { from: receivedOn, to: addMonths(receivedOn, months + 1) };
  return nominalDates(repetition, receivedOn, range)
    .filter((date) => date > receivedOn)
    .slice(0, months);
}

function monthlyInterest(remaining: number, annualRateBp: number): number {
  const product = remaining * annualRateBp;
  if (Number.isSafeInteger(product)) return divideRound(product, MONTHLY_RATE_DENOMINATOR);
  // divideRound refuses a product outside the safe range: the exact product needs BigInt.
  return Number(
    divideRoundBig(BigInt(remaining) * BigInt(annualRateBp), BigInt(MONTHLY_RATE_DENOMINATOR)),
  );
}

/** The regular payment: the single floating-point step of the engine, rounded once (D4 rule 3). */
function annuity(principal: number, months: number, annualRateBp: number): number {
  const rate = annualRateBp / 10000 / 12;
  return Math.round((principal * rate) / (1 - (1 + rate) ** -months));
}

/**
 * The payments of `principal` minor units over `months`, at `annualRateBp`. The last payment takes
 * what remains, so that the principal parts add up to `principal` exactly.
 */
export function loanSchedule(
  principal: number,
  months: number,
  annualRateBp: number,
  receivedOn: string,
): LoanPayment[] {
  // The exact annuity is never below the first interest; the float64 result can be, by one unit.
  const payment =
    annualRateBp === 0
      ? Math.floor(principal / months)
      : Math.max(
          annuity(principal, months, annualRateBp),
          monthlyInterest(principal, annualRateBp),
        );
  let remaining = principal;
  return paymentDates(months, receivedOn).map((date, index) => {
    const interest = monthlyInterest(remaining, annualRateBp);
    const payoff = remaining + interest;
    // Rounded up over many months, the regular payment could repay more than remains.
    const amount = index === months - 1 ? payoff : Math.min(payment, payoff);
    const principalPart = amount - interest;
    remaining -= principalPart;
    return { date, amount, interest, principal: principalPart };
  });
}
