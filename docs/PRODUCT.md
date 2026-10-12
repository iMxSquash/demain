# Product

This document explains why Demain exists, who it is for, how it is meant to be used, and how we will know it succeeded. Vocabulary is defined in [DOMAIN.md](DOMAIN.md), milestones in [ROADMAP.md](ROADMAP.md).

## Problem statement

Demain replaces a personal budget kept in a Google Sheet. The sheet works, but its structure creates recurring friction:

| Pain point | Consequence |
| --- | --- |
| **One tab per month** | The file grows forever, cross-month questions ("how much did I spend on food this year?") need manual formulas, and the structure does not scale. |
| **A template that goes stale** | Each new month is copied from a template. When a subscription is added or changes price, the template and every already-copied future tab must be fixed by hand, and some are forgotten. |
| **Dates edited by hand** | Future tabs contain copied rows whose dates are wrong until someone edits them. The sheet does not know that "rent" happens on the 5th of every month. |
| **Simulations done by hand** | Questions like "should I pay this subscription yearly?" or "can I afford this purchase in March?" require duplicating tabs and editing numbers, with no way to compare options side by side. |

The underlying need is simple: see ahead, compare possible futures, and keep the data on your own machine.

## Vision and essence

Demain is a budget app that looks forward, not only backward. Three ideas define it:

1. **See ahead, without guessing.** The main views show what is real and what you have explicitly planned and dated: your balances, your recurring income and expenses, your one-off events. They never guess, for instance, that you might go out this month. The estimation of your usual spending lives in simulations only, where it belongs.
2. **Compare possible futures.** Express a decision as a scenario (monthly vs yearly subscription vs none, a loan, a raise, moving out) and compare 2 to 4 scenarios side by side, on the same real history, with the indicators that matter: final balance, lowest balance and when it happens, savings at a date, total cost.
3. **Stay at home.** Demain runs on your own server. Data is stored locally and nothing is sent anywhere by default. Every feature that needs an outbound connection (exchange rate fetch, bank sync) is optional, disabled by default, and documented with what it sends.

## Target user

- **Primary:** the project owner, a single person managing a checking account and regulated savings accounts (Livret A, Livret Jeune) in euros, who imports bank statements and wants to stop maintaining a spreadsheet.
- **Secondary:** anyone comfortable running a Docker container who wants a private, forward-looking budget tool. They may use any bank, any language supported by the community, and any currency.

Demain is **single-user per instance**. A household that wants separate budgets runs separate instances. Shared budgets between several people are out of scope (see [ROADMAP.md](ROADMAP.md#out-of-scope-for-now)).

## User journeys

Each journey names the milestone that makes it possible.

### 1. Monthly routine with import (M1, enriched by M2)

1. The user downloads a CSV or OFX export from their bank website.
2. They upload it into Demain and pick the target account. Demain detects duplicates of already imported transactions.
3. Categorization rules assign a category to known labels (for example, a label containing `MONOPRIX` goes to Food). Unrecognized transactions land in the **to categorize** queue.
4. The user processes the queue. When they categorize a transaction by hand, Demain suggests creating a rule so the next import is automatic.
5. From M2, imported transactions are matched against planned items. Confident matches confirm the planned item; ambiguous ones are shown for validation.
6. Optionally, the user records the real balance shown by the bank as a **balance assertion**. Demain shows any unexplained gap.
7. The user reads the monthly synthesis (net of the month, savings of the month, end-of-month balances per account) and the main chart: the month-end curves of the checking and savings accounts, real values only.

### 2. Adding a subscription (M2)

1. The user creates a planned item: "Music streaming", amount, account, category, monthly on day 12, starting next month, no end date.
2. The occurrence appears on every future month of the calendar, without copying anything.
3. Months later the price changes. The user adds a new version with an effective date. Past occurrences keep the old price, future ones use the new one. No template to fix.
4. The merchant delays one payment by a few days. From the calendar or the monthly line view, the user moves that single occurrence. The rest of the subscription is untouched.
5. To move all future payments to another day, the user changes the schedule from a given date, in one action.

### 3. Planning an event in the calendar (M2)

1. The user navigates the calendar to a future month, for example to a known car insurance payment or a planned trip.
2. They add a one-off planned item at that date with an amount.
3. The daily balance updates immediately, computed from real transactions and dated planned items only. If the balance goes below zero on some day, it is visible on the calendar grid and in the monthly line view.
4. When the real transaction is imported, it is matched with the planned item, which becomes confirmed.

### 4. Comparing monthly vs yearly subscription (M3)

1. The user creates three scenarios on top of the constant-pace simulation: "Monthly" (the current subscription), "Yearly" (remove the monthly item, add a yearly payment), "None" (remove the subscription).
2. They select a 24-month horizon and compare the three side by side. The real months are shared and drawn once; each simulation diverges from today.
3. Demain shows, for each scenario: the month-end checking and savings curves, final balance, minimum balance and its date, and total cost over the horizon. The yearly option may cost less in total but create a lower minimum balance in the month it is paid; both facts are visible at once.

### 5. Validating a scenario (M3)

1. After comparing, the user decides to switch to the yearly plan.
2. They validate the "Yearly" scenario. Its modifications become real planned items (the monthly item gets an end date, the yearly item is created).
3. The calendar and the real trajectory now reflect the decision. The scenario is kept for reference.

### 6. Providing for a variable expense (M2)

1. The user creates a planned item "Fuel": 90 EUR on the 15th of each month, as a provision linked to its fill-ups by category and a label filter (`carburant`), with the amount mode set to the rolling average of the previous 3 occurrences and 90 as the starting estimate.
2. During the month, the fill-ups are imported and settle the provision. The calendar shows only what remains of the 90 until the 15th, never a negative amount.
3. After a few months, the amount of the next occurrences follows the real payments, with no manual repricing. The user can freeze it to a fixed amount at any time.

### 7. Saving into a capped account (M1, M2)

1. The user declares the Livret Jeune with a ceiling of 1 600 EUR and the Livret A as its overflow account.
2. They enter a transfer of 200 EUR from checking to the Livret Jeune, which holds 1 550. The app shows the split (50 to the Livret Jeune, 150 to the Livret A) and lets them accept it, deposit only the 50, or pick another account for the 150.
3. A planned monthly transfer follows the same chain on its own once the ceiling is reached, and the calendar shows where each part goes.
4. If the user tries to make two accounts overflow into each other, directly or through several accounts, the app refuses and explains why.

## Out of scope

These are deliberate exclusions for now, not oversights. The full list and reasons are in [ROADMAP.md](ROADMAP.md#out-of-scope-for-now).

- Multi-user and shared budgets.
- A native mobile app (the web app should remain usable on a phone browser).
- Reminders and notifications.
- Machine-learning features such as learned categorization or automated advice. Categorization is deterministic and rule-based.
- Investment and PEA tracking (these could later be modeled as generic accounts).
- Tax features.

## Success criteria

| Criterion | How it is checked |
| --- | --- |
| **The owner stops using the sheet after M2.** | The owner runs a full month (import, categorize, check synthesis, plan next months) in Demain only, without opening the sheet. |
| **History is preserved.** | After the one-time migration, the monthly figures computed by Demain for January to October 2026 match the sheet's Summary tab (see the worked example in [DOMAIN.md](DOMAIN.md#worked-example-from-the-sheet)). |
| **The main chart replaces the sheet's.** | After M1, the month-end checking and savings curves show the real values of the Summary tab, with no estimation. |
| **No template maintenance.** | Adding or repricing a subscription is one action, and every future month reflects it. Moving one payment is one action on one day. |
| **A decision can be simulated in minutes.** | After M3, comparing monthly vs yearly vs none for a subscription takes a few minutes and requires no copying of data. |
| **Self-hosting is approachable.** | Someone other than the owner can install Demain from the README on their own machine without help. |
| **Nothing leaves the server by default.** | With default settings, the app makes no outbound network call. |
