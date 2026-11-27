// The comparison of simulations (DOMAIN, Comparison and diagrams, D11): the constant-pace
// simulation, always first as the fair reference, and 1 to 3 draft scenarios, all evaluated on the
// same input and the same horizon. Estimation stays inside the simulations (ADR-011). Pure: "today"
// and the data are arguments.

import { isCalendarDate } from "./account";
import { horizonRange, type HorizonChoice } from "./horizon";
import { messageRef, type MessageRef } from "./message";
import type { Modification, ModificationProblem } from "./modification";
import type { DateRange } from "./recurrence";
import {
  evaluateScenario,
  type GoalOutcome,
  type SimulationInput,
  type SimulationResult,
} from "./simulation";
import {
  computeIndicators,
  totalCost,
  type IndicatorAccount,
  type IndicatorOptions,
  type SimulationIndicators,
} from "./simulation-indicators";

export const MAX_COMPARED_SCENARIOS = 3;

export interface ComparedScenario {
  id: number;
  name: string;
  status: "draft" | "validated";
  modifications: readonly Modification[];
}

export interface ComparedSimulation {
  /** null for the constant-pace simulation. */
  scenarioId: number | null;
  name: string | null;
  result: SimulationResult;
  indicators: SimulationIndicators;
  totalCost: number;
  problems: ModificationProblem[];
  goals: GoalOutcome[];
}

export interface Comparison {
  range: DateRange;
  simulations: ComparedSimulation[];
}

export class ComparisonValidationError extends Error {
  constructor(
    /** English text for logs and tests: users read the translation of `ref`. */
    message: string,
    readonly ref: MessageRef,
  ) {
    super(message);
    this.name = "ComparisonValidationError";
  }
}

function assertComparable(scenarios: readonly ComparedScenario[]): void {
  if (scenarios.length === 0 || scenarios.length > MAX_COMPARED_SCENARIOS) {
    throw new ComparisonValidationError(
      `A comparison takes 1 to ${MAX_COMPARED_SCENARIOS} scenarios, got ${scenarios.length}`,
      messageRef("comparisonSize"),
    );
  }
  const validated = scenarios.find(({ status }) => status === "validated");
  if (validated !== undefined) {
    throw new ComparisonValidationError(
      `Scenario ${validated.id} is validated: its effects are already real`,
      messageRef("scenarioValidated"),
    );
  }
}

/** An account without a known kind counts only in the totals (D10). */
function indicatorAccounts(input: Omit<SimulationInput, "range">): IndicatorAccount[] {
  return input.accounts.map(({ id, currency, archived }) => ({
    id,
    currency,
    archived,
    kind: input.accountKinds?.get(id) ?? "other",
  }));
}

/**
 * Evaluates the constant-pace simulation and each scenario on the same input and range, so the
 * real part of every result is identical and each one diverges from today (D11). The savings date
 * defaults to the end of the range and is refused outside it, never clamped (#220). `choice` is
 * trusted: a horizon read from a request goes through `parseHorizon` first.
 */
export function compareSimulations(
  input: Omit<SimulationInput, "range">,
  scenarios: readonly ComparedScenario[],
  choice: HorizonChoice,
  options: Omit<IndicatorOptions, "range" | "savingsDate"> & { savingsDate?: string },
): Comparison {
  assertComparable(scenarios);
  // The indicators read their own today: another day would shift the outflows and the minimum.
  if (options.today !== input.today) {
    throw new RangeError(`Indicator today ${options.today} differs from ${input.today}`);
  }
  const range = horizonRange(choice, input.today);
  const savingsDate = options.savingsDate ?? range.to;
  // Checked before any evaluation, which the indicators would only refuse after it.
  if (!isCalendarDate(savingsDate)) {
    throw new RangeError(`Savings date ${savingsDate} is not a calendar date`);
  }
  if (savingsDate < range.from || savingsDate > range.to) {
    throw new RangeError(
      `Savings date ${savingsDate} is outside the range ${range.from} to ${range.to}`,
    );
  }
  const simulationInput: SimulationInput = { ...input, range };
  const accounts = indicatorAccounts(input);
  const indicatorOptions: IndicatorOptions = { ...options, range, savingsDate };

  const evaluate = (modifications: readonly Modification[]) => {
    const { problems, goals, ...result } = evaluateScenario(simulationInput, modifications);
    return {
      result,
      problems,
      goals,
      indicators: computeIndicators(result, accounts, indicatorOptions),
    };
  };
  const reference = evaluate([]);
  return {
    range,
    simulations: [
      { scenarioId: null, name: null, ...reference, totalCost: 0 },
      ...scenarios.map(({ id, name, modifications }) => {
        const simulation = evaluate(modifications);
        return {
          scenarioId: id,
          name,
          ...simulation,
          totalCost: totalCost(simulation.indicators, reference.indicators),
        };
      }),
    ],
  };
}
