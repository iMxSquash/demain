import { describe, expect, it } from "vitest";

import { loanSchedule } from "../../src/domain/loan";

const RECEIVED_ON = "2027-01-15";

function principalTotal(principal: number, months: number, annualRateBp: number): number {
  return loanSchedule(principal, months, annualRateBp, RECEIVED_ON).reduce(
    (total, payment) => total + payment.principal,
    0,
  );
}

describe("loanSchedule", () => {
  it("a zero rate splits 120000 over 12 months into 12 payments of 10000", () => {
    const schedule = loanSchedule(120000, 12, 0, RECEIVED_ON);

    expect(schedule).toHaveLength(12);
    for (const payment of schedule) {
      expect(payment).toMatchObject({ amount: 10000, interest: 0, principal: 10000 });
    }
  });

  it("a zero rate gives 33333, 33333 and 33334 for 100000 over 3 months", () => {
    const schedule = loanSchedule(100000, 3, 0, RECEIVED_ON);

    expect(schedule.map((payment) => payment.amount)).toEqual([33333, 33333, 33334]);
    expect(schedule.map((payment) => payment.principal)).toEqual([33333, 33333, 33334]);
  });

  it("1000000 at 500 basis points over 12 months gives 11 payments of 85607 and a last one that closes the principal", () => {
    const schedule = loanSchedule(1000000, 12, 500, RECEIVED_ON);

    // Worked example of DOMAIN, rounding rule 3, computed independently with decimal arithmetic.
    expect(
      schedule.map(({ amount, interest, principal }) => [amount, interest, principal]),
    ).toEqual([
      [85607, 4167, 81440],
      [85607, 3827, 81780],
      [85607, 3487, 82120],
      [85607, 3144, 82463],
      [85607, 2801, 82806],
      [85607, 2456, 83151],
      [85607, 2109, 83498],
      [85607, 1761, 83846],
      [85607, 1412, 84195],
      [85607, 1061, 84546],
      [85607, 709, 84898],
      [85612, 355, 85257],
    ]);
  });

  it("the principal parts add up to the principal exactly", () => {
    for (const principal of [1, 999, 100000, 1234567, 50000000]) {
      for (const annualRateBp of [0, 1, 350, 500, 1999, 10000]) {
        for (const months of [1, 7, 12, 60, 240, 600]) {
          const schedule = loanSchedule(principal, months, annualRateBp, RECEIVED_ON);
          expect(schedule).toHaveLength(months);
          expect(principalTotal(principal, months, annualRateBp)).toBe(principal);
          for (const { amount, interest, principal: part } of schedule) {
            expect(amount).toBe(interest + part);
            expect(Math.min(amount, interest, part)).toBeGreaterThanOrEqual(0);
            expect(Number.isSafeInteger(amount)).toBe(true);
          }
        }
      }
    }
  });

  it("the regular payment never falls below the interest of the first month", () => {
    // In float64, 7764 / 10000 / 12 and (1 + r) ** -600 round the annuity to 8087, below the exact
    // first interest of 125000 x 7764 / 120000 = 8087.5, rounded to 8088.
    const schedule = loanSchedule(125000, 600, 7764, RECEIVED_ON);

    expect(schedule[0]).toMatchObject({ amount: 8088, interest: 8088, principal: 0 });
    expect(schedule.every(({ principal }) => principal >= 0)).toBe(true);
    expect(principalTotal(125000, 600, 7764)).toBe(125000);
  });

  it("no payment goes past what remains, so a rounded-up payment never overpays", () => {
    // 59 payments of 17 would repay 1003 of a principal of 999.
    const schedule = loanSchedule(999, 60, 1, RECEIVED_ON);

    expect(schedule.reduce((total, { amount }) => total + amount, 0)).toBe(999);
    expect(schedule.at(-1)).toMatchObject({ amount: 0, interest: 0, principal: 0 });
    expect(schedule.every(({ amount }) => amount >= 0)).toBe(true);
  });

  it("a principal whose interest product leaves the safe integer range keeps exact integer interest", () => {
    // 10^12 x 10000 = 10^16, above Number.MAX_SAFE_INTEGER (about 9.007 x 10^15).
    const principal = 1_000_000_000_000;
    expect(principal * 10000).toBeGreaterThan(Number.MAX_SAFE_INTEGER);

    const schedule = loanSchedule(principal, 600, 10000, RECEIVED_ON);

    expect(schedule).toHaveLength(600);
    // 10^12 x 10000 / 120000 = 83333333333.33, rounded to the nearest minor unit.
    expect(schedule[0]?.interest).toBe(83333333333);
    expect(schedule.reduce((total, payment) => total + payment.principal, 0)).toBe(principal);
    for (const payment of schedule) expect(Number.isSafeInteger(payment.amount)).toBe(true);
  });

  it("payments follow the day of the date received, clamped to shorter months", () => {
    const dates = loanSchedule(90000, 3, 0, "2027-01-31").map((payment) => payment.date);

    expect(dates).toEqual(["2027-02-28", "2027-03-31", "2027-04-30"]);
  });

  it("the first payment comes the month after the date received", () => {
    const dates = loanSchedule(20000, 2, 500, "2027-12-05").map((payment) => payment.date);

    expect(dates).toEqual(["2028-01-05", "2028-02-05"]);
  });
});
