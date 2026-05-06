export const PREDICATES = ["eq", "neq", "lt", "lte", "gt", "gte", "in", "not_in"] as const;

export const PREDICATE_LABELS: Record<string, string> = {
  eq: "=", neq: "!=", lt: "<", lte: "<=", gt: ">", gte: ">=",
  in: "in", not_in: "not in",
};
