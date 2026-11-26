import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { archiveAccount, createAccount } from "../../src/ledger/accounts";
import { type CalendarMonth, getCalendarMonth } from "../../src/ledger/calendar";
import { createCategory } from "../../src/ledger/categories";
import { saveExchangeRate } from "../../src/ledger/exchange-rates";
import { createPlannedItem, saveOccurrenceOverride } from "../../src/ledger/planned-items";
import { linkTransactionToOccurrence } from "../../src/ledger/planned-matching";
import { createTransaction } from "../../src/ledger/transactions";
import { type AppDatabase, migrateDatabase, openDatabase } from "../../src/storage/database";

const TODAY = "2026-11-10";
const NOVEMBER = "2026-11";
const OPENING_BALANCE = 100_000;

const ACCOUNT_DETAILS = { currency: "EUR", openingDate: "2026-01-01" } as const;

describe("monthly line view of real and planned movements", () => {
  let dataDir: string;
  let db: AppDatabase;
  let checkingId: number;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "demain-test-"));
    db = openDatabase(dataDir);
    migrateDatabase(db);
    checkingId = createAccount(db, {
      ...ACCOUNT_DETAILS,
      name: "Checking",
      kind: "checking",
      openingBalance: OPENING_BALANCE,
    }).id;
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function month(
    monthKey: string,
    options: { accountIds?: readonly number[]; currency?: string } = {},
  ): CalendarMonth {
    return getCalendarMonth(db, {
      month: monthKey,
      today: TODAY,
      accountIds: options.accountIds ?? [checkingId],
      currency: options.currency ?? "EUR",
    });
  }

  const dayOf = (result: CalendarMonth, dayOfMonth: number) => {
    const day = result.days[dayOfMonth - 1];
    if (day === undefined) throw new Error(`No day ${dayOfMonth}`);
    return day;
  };

  const balancesOf = (result: CalendarMonth) => result.days.map(({ balance }) => balance);

  function spend(date: string, amount: number, label = "SHOP", categoryId: number | null = null) {
    return createTransaction(db, {
      accountId: checkingId,
      date,
      amount,
      kind: "expense",
      label,
      categoryId,
    });
  }

  function planExpense(
    name: string,
    amount: number,
    day: number,
    categoryId: number | null = null,
  ) {
    return createPlannedItem(db, {
      name,
      kind: "expense",
      accountId: checkingId,
      categoryId,
      startDate: "2026-11-01",
      repetition: { kind: "monthly_on_day", day },
      amount,
    });
  }

  it("a month lists its real transactions and its planned occurrences by day", () => {
    const food = createCategory(db, { name: "Food" });
    const housing = createCategory(db, { name: "Housing" });
    const groceries = spend("2026-11-03", -4_000, "GROCERIES", food.id);
    const rent = planExpense("Rent", -60_000, 15, housing.id);

    const result = month(NOVEMBER);

    expect(result.month).toBe(NOVEMBER);
    expect(result.currency).toBe("EUR");
    expect(result.days).toHaveLength(30);
    expect(result.days[0]?.date).toBe("2026-11-01");
    expect(result.days.at(-1)?.date).toBe("2026-11-30");
    expect(result.days.filter(({ entries }) => entries.length > 0).map(({ date }) => date)).toEqual(
      ["2026-11-03", "2026-11-15"],
    );
    expect(dayOf(result, 3).entries).toEqual([
      {
        id: `t${groceries.id}`,
        date: "2026-11-03",
        kind: "real",
        label: "GROCERIES",
        accountId: checkingId,
        destinationAccountId: null,
        currency: "EUR",
        amount: -4_000,
        status: null,
        categoryId: food.id,
        categoryName: "Food",
        settlesOccurrence: false,
        plannedItemId: null,
        nominalDate: null,
        unplacedSurplus: null,
        routingInvalid: false,
        override: null,
        isEditable: false,
        plannedKind: null,
        canSettle: false,
      },
    ]);
    expect(dayOf(result, 15).entries).toEqual([
      {
        id: `p${rent.id}:2026-11-15`,
        date: "2026-11-15",
        kind: "planned",
        label: "Rent",
        accountId: checkingId,
        destinationAccountId: null,
        currency: "EUR",
        amount: -60_000,
        status: "planned",
        categoryId: housing.id,
        categoryName: "Housing",
        settlesOccurrence: false,
        plannedItemId: rent.id,
        nominalDate: "2026-11-15",
        unplacedSurplus: null,
        routingInvalid: false,
        override: null,
        isEditable: true,
        plannedKind: "expense",
        canSettle: true,
      },
    ]);
  });

  it("returns plain data only, so that it can come out of a cached read", () => {
    spend("2026-11-03", -4_000);
    planExpense("Rent", -60_000, 15);

    const result = month(NOVEMBER);

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("an occurrence settled by a transaction is listed once, as confirmed", () => {
    const salary = createPlannedItem(db, {
      name: "Salary",
      kind: "income",
      accountId: checkingId,
      startDate: "2026-11-01",
      repetition: { kind: "monthly_on_day", day: 5 },
      amount: 200_000,
    });
    const received = createTransaction(db, {
      accountId: checkingId,
      date: "2026-11-06",
      amount: 200_000,
      kind: "income",
      label: "SALARY",
    });
    db.transaction((tx) =>
      linkTransactionToOccurrence(tx, {
        transactionId: received.id,
        plannedItemId: salary.id,
        nominalDate: "2026-11-05",
      }),
    );

    const result = month(NOVEMBER);

    expect(result.days.flatMap(({ entries }) => entries)).toHaveLength(1);
    expect(dayOf(result, 5).entries).toEqual([]);
    expect(dayOf(result, 6).entries).toEqual([
      expect.objectContaining({
        id: `t${received.id}`,
        kind: "real",
        label: "SALARY",
        amount: 200_000,
        status: "confirmed",
        settlesOccurrence: true,
        plannedItemId: salary.id,
        nominalDate: "2026-11-05",
      }),
    ]);
    expect(dayOf(result, 5).balance).toBe(OPENING_BALANCE);
    expect(dayOf(result, 6).balance).toBe(OPENING_BALANCE + 200_000);
  });

  it("an overdue occurrence is listed as overdue and does not lower the balance", () => {
    // Due on 2 November, today is 10 November: past its 5-day match window (7 November).
    planExpense("Gym", -3_000, 2);

    const result = month(NOVEMBER);

    expect(dayOf(result, 2).entries).toEqual([
      expect.objectContaining({
        kind: "planned",
        label: "Gym",
        amount: -3_000,
        status: "overdue",
        settlesOccurrence: false,
        nominalDate: "2026-11-02",
      }),
    ]);
    expect(balancesOf(result)).toEqual(Array(30).fill(OPENING_BALANCE));
  });

  it("flags the occurrences that have an override, moved or skipped", () => {
    const rent = planExpense("Rent", -60_000, 15);
    const gym = planExpense("Gym", -3_000, 20);
    saveOccurrenceOverride(db, rent.id, {
      nominalDate: "2026-11-15",
      status: "modified",
      overrideDate: "2026-11-18",
      overrideAmount: null,
    });
    saveOccurrenceOverride(db, gym.id, {
      nominalDate: "2026-11-20",
      status: "cancelled",
      overrideDate: null,
      overrideAmount: null,
    });
    const groceries = spend("2026-11-03", -4_000);

    const entries = month(NOVEMBER).days.flatMap((day) => day.entries);

    expect(
      entries.map(({ id, date, override }) => ({ id, date, status: override?.status ?? null })),
    ).toEqual([
      { id: `t${groceries.id}`, date: "2026-11-03", status: null },
      { id: `p${rent.id}:2026-11-15`, date: "2026-11-18", status: "modified" },
      { id: `p${gym.id}:2026-11-20`, date: "2026-11-20", status: "cancelled" },
    ]);
  });

  it("gives the stored override values, so that a form shows only what was changed", () => {
    const rent = planExpense("Rent", -60_000, 15);
    const gym = planExpense("Gym", -3_000, 20);
    saveOccurrenceOverride(db, rent.id, {
      nominalDate: "2026-11-15",
      status: "modified",
      overrideDate: null,
      overrideAmount: -62_000,
    });
    saveOccurrenceOverride(db, gym.id, {
      nominalDate: "2026-11-20",
      status: "modified",
      overrideDate: "2026-11-22",
      overrideAmount: null,
    });
    const groceries = spend("2026-11-03", -4_000);

    const entries = month(NOVEMBER).days.flatMap((day) => day.entries);

    expect(entries.map(({ id, override }) => ({ id, override }))).toEqual([
      { id: `t${groceries.id}`, override: null },
      {
        id: `p${rent.id}:2026-11-15`,
        override: {
          nominalDate: "2026-11-15",
          status: "modified",
          overrideDate: null,
          overrideAmount: -62_000,
        },
      },
      {
        id: `p${gym.id}:2026-11-20`,
        override: {
          nominalDate: "2026-11-20",
          status: "modified",
          overrideDate: "2026-11-22",
          overrideAmount: null,
        },
      },
    ]);
  });

  it("a partly settled provision cannot be changed until it is unlinked", () => {
    const groceries = createPlannedItem(db, {
      name: "Groceries",
      kind: "expense",
      accountId: checkingId,
      startDate: "2026-10-30",
      repetition: { kind: "monthly_on_day", day: 30 },
      amount: -40_000,
      acceptsMultipleTransactions: true,
    });
    const rent = planExpense("Rent", -60_000, 15);
    const shopping = spend("2026-11-08", -10_000, "SUPERMARKET");
    db.transaction((tx) =>
      linkTransactionToOccurrence(tx, {
        transactionId: shopping.id,
        plannedItemId: groceries.id,
        nominalDate: "2026-11-30",
      }),
    );

    const entries = month(NOVEMBER).days.flatMap((day) => day.entries);

    expect(
      entries.map(({ id, status, isEditable, canSettle }) => ({
        id,
        status,
        isEditable,
        canSettle,
      })),
    ).toEqual([
      { id: `t${shopping.id}`, status: "confirmed", isEditable: false, canSettle: false },
      { id: `p${rent.id}:2026-11-15`, status: "planned", isEditable: true, canSettle: true },
      // A partial provision cannot be changed, but it still takes one more payment.
      { id: `p${groceries.id}:2026-11-30`, status: "partial", isEditable: false, canSettle: true },
    ]);
  });

  it("an occurrence of an item whose account is archived cannot be changed nor settled", () => {
    const cardId = createAccount(db, {
      ...ACCOUNT_DETAILS,
      name: "Old card",
      kind: "checking",
      openingBalance: 0,
    }).id;
    const subscription = createPlannedItem(db, {
      name: "Subscription",
      kind: "expense",
      accountId: cardId,
      startDate: "2026-11-05",
      endDate: "2026-11-05",
      repetition: { kind: "monthly_on_day", day: 5 },
      amount: -1_000,
    });
    const rent = planExpense("Rent", -60_000, 15);
    archiveAccount(db, cardId, TODAY);

    const entries = month(NOVEMBER, { accountIds: [checkingId, cardId] }).days.flatMap(
      (day) => day.entries,
    );

    expect(entries.map(({ id, isEditable, canSettle }) => ({ id, isEditable, canSettle }))).toEqual(
      [
        { id: `p${subscription.id}:2026-11-05`, isEditable: false, canSettle: false },
        { id: `p${rent.id}:2026-11-15`, isEditable: true, canSettle: true },
      ],
    );
  });

  it("the balance of each day comes from real transactions and planned occurrences only", () => {
    spend("2026-10-20", -20_000);
    spend("2026-11-03", -4_000);
    createTransaction(db, {
      accountId: checkingId,
      date: "2026-11-08",
      amount: 10_000,
      kind: "income",
      label: "REFUND",
    });
    planExpense("Rent", -60_000, 15);
    createPlannedItem(db, {
      name: "Gift",
      kind: "income",
      accountId: checkingId,
      startDate: "2026-11-20",
      repetition: null,
      amount: 5_000,
    });

    const result = month(NOVEMBER);

    // 100 000 - 20 000 in October, then days 1-2, 3-7, 8-14, 15-19 and 20-30.
    expect(balancesOf(result)).toEqual([
      ...Array(2).fill(80_000),
      ...Array(5).fill(76_000),
      ...Array(7).fill(86_000),
      ...Array(5).fill(26_000),
      ...Array(11).fill(31_000),
    ]);
    expect(result.days.every(({ isBelowZero }) => !isBelowZero)).toBe(true);
    expect(result.firstDayBelowZero).toBeNull();
  });

  describe("first day below zero", () => {
    it("finds the first day of the month below zero", () => {
      planExpense("Rent", -150_000, 15);

      const result = month(NOVEMBER);

      expect(result.firstDayBelowZero).toBe("2026-11-15");
      expect(dayOf(result, 14)).toMatchObject({ balance: 100_000, isBelowZero: false });
      expect(dayOf(result, 15)).toMatchObject({ balance: -50_000, isBelowZero: true });
      expect(dayOf(result, 30)).toMatchObject({ balance: -50_000, isBelowZero: true });
    });

    it("is null for a month that stays at or above zero, even when a later month does not", () => {
      planExpense("Rent", -150_000, 15);

      expect(month("2026-10").firstDayBelowZero).toBeNull();
    });

    it("names day 1 of a month that starts below zero, even when day 1 has no entry", () => {
      planExpense("Rent", -150_000, 15);

      const result = month("2026-12");

      expect(dayOf(result, 1).entries).toEqual([]);
      expect(dayOf(result, 1)).toMatchObject({ balance: -50_000, isBelowZero: true });
      expect(result.firstDayBelowZero).toBe("2026-12-01");
    });
  });

  describe("a planned transfer along the overflow chain", () => {
    let savingsId: number;

    // Savings holds 40 000 under a ceiling of 50 000: of the 30 000 transferred, 10 000 fit and
    // 20 000 stay in Checking.
    beforeEach(() => {
      savingsId = createAccount(db, {
        ...ACCOUNT_DETAILS,
        name: "Savings",
        kind: "savings",
        openingBalance: 40_000,
        depositCeiling: 50_000,
      }).id;
      createPlannedItem(db, {
        name: "Monthly saving",
        kind: "transfer",
        accountId: checkingId,
        destinationAccountId: savingsId,
        startDate: "2026-11-20",
        repetition: null,
        amount: -30_000,
      });
    });

    it("reports the unplaced surplus and the account that keeps it", () => {
      const result = month(NOVEMBER, { accountIds: [checkingId, savingsId] });

      expect(dayOf(result, 20).entries).toEqual([
        expect.objectContaining({
          kind: "planned",
          label: "Monthly saving",
          accountId: checkingId,
          destinationAccountId: savingsId,
          amount: -30_000,
          status: "planned",
          unplacedSurplus: { amount: 20_000, accountId: checkingId },
          routingInvalid: false,
        }),
      ]);
      expect(dayOf(result, 19).balance).toBe(140_000);
      expect(dayOf(result, 20).balance).toBe(140_000);
    });

    it("lowers the source by what was placed only", () => {
      const result = month(NOVEMBER, { accountIds: [checkingId] });

      expect(dayOf(result, 19).balance).toBe(100_000);
      expect(dayOf(result, 20).balance).toBe(90_000);
      expect(dayOf(result, 20).entries).toEqual([
        expect.objectContaining({ unplacedSurplus: { amount: 20_000, accountId: checkingId } }),
      ]);
    });

    it("shows on its day when only its destination is selected, listed once", () => {
      const result = month(NOVEMBER, { accountIds: [savingsId] });

      expect(dayOf(result, 20).entries).toEqual([
        expect.objectContaining({
          kind: "planned",
          label: "Monthly saving",
          accountId: checkingId,
          destinationAccountId: savingsId,
        }),
      ]);
      expect(dayOf(result, 19).balance).toBe(40_000);
      expect(dayOf(result, 20).balance).toBe(50_000);
    });
  });

  describe("no estimation of unplanned spending (ADR-011)", () => {
    it("a category with past spending and no planned item adds no row to a future month", () => {
      const food = createCategory(db, { name: "Food" });
      spend("2026-08-10", -5_000, "SHOP", food.id);
      spend("2026-09-10", -5_000, "SHOP", food.id);
      spend("2026-10-10", -5_000, "SHOP", food.id);

      const result = month("2026-12");

      expect(result.days).toHaveLength(31);
      expect(result.days.every(({ entries }) => entries.length === 0)).toBe(true);
      expect(balancesOf(result)).toEqual(Array(31).fill(OPENING_BALANCE - 15_000));
    });

    it("a month before any data has no row", () => {
      spend("2026-11-03", -4_000);

      const result = month("2026-06");

      expect(result.days).toHaveLength(30);
      expect(result.days.every(({ entries }) => entries.length === 0)).toBe(true);
      expect(balancesOf(result)).toEqual(Array(30).fill(OPENING_BALANCE));
    });
  });

  describe("accounts in several currencies", () => {
    let dollarsId: number;

    beforeEach(() => {
      dollarsId = createAccount(db, {
        ...ACCOUNT_DETAILS,
        name: "Dollars",
        kind: "checking",
        currency: "USD",
        openingBalance: 10_000,
      }).id;
      createTransaction(db, {
        accountId: dollarsId,
        date: "2026-11-05",
        amount: -2_000,
        kind: "expense",
        label: "DOLLAR SHOP",
      });
    });

    it("converts each account with the stored rates", () => {
      saveExchangeRate(db, { date: "2026-01-01", base: "USD", quote: "EUR", rate: "0.5" });

      const result = month(NOVEMBER, { accountIds: [checkingId, dollarsId] });

      // 10 000 USD opening is 5 000 EUR, and 8 000 USD after the expense is 4 000 EUR.
      expect(balancesOf(result)).toEqual([...Array(4).fill(105_000), ...Array(26).fill(104_000)]);
      expect(result.unconvertedCurrencies).toEqual([]);
      expect(dayOf(result, 5).entries).toEqual([
        expect.objectContaining({ label: "DOLLAR SHOP", currency: "USD", amount: -2_000 }),
      ]);
    });

    it("keeps the amount of an account in its own currency when it is the reference of the balance", () => {
      const result = month(NOVEMBER, { accountIds: [dollarsId], currency: "USD" });

      expect(balancesOf(result)).toEqual([...Array(4).fill(10_000), ...Array(26).fill(8_000)]);
    });

    it("leaves out an account with no rate and reports its currency", () => {
      const result = month(NOVEMBER, { accountIds: [checkingId, dollarsId] });

      expect(balancesOf(result)).toEqual(Array(30).fill(OPENING_BALANCE));
      expect(result.unconvertedCurrencies).toEqual(["USD"]);
    });

    it("has no balance, and is not below zero, when no selected account can be converted", () => {
      const result = month(NOVEMBER, { accountIds: [dollarsId] });

      expect(balancesOf(result)).toEqual(Array(30).fill(null));
      expect(result.days.every(({ isBelowZero }) => !isBelowZero)).toBe(true);
      expect(result.firstDayBelowZero).toBeNull();
      expect(result.unconvertedCurrencies).toEqual(["USD"]);
    });
  });
});
