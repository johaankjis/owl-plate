import type { components } from "../api.generated";

/** Generated contracts keep operations views aligned with the composed API. */
export type OperationsPeriod = NonNullable<OperationsResponse["period"]>;
export type OperationsDataset = components["schemas"]["OperationsDataset"];
export type OperationsSummary = components["schemas"]["OperationsSummary"];
export type OperationsOutcomes = components["schemas"]["OperationsOutcomes"];
export type OperationsSeriesPoint =
  components["schemas"]["OperationsSeriesPoint"];
export type OperationsBuilding = components["schemas"]["OperationsBuilding"];
export type OperationsActivity = components["schemas"]["OperationsActivity"];
export type OperationsCategory = components["schemas"]["OperationsCategory"];
export type OperationsListing = components["schemas"]["OperationsListing"];
export type OperationsEstimates = components["schemas"]["OperationsEstimates"];
export type OperationsResponse = components["schemas"]["OperationsResponse"];
