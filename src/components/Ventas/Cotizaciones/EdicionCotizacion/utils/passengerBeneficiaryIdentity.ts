// Historical Biblia keys may start at zero or one. Recognize their type while
// retaining the exact key; only the quotation roster can resolve its position.
export const isAdultPassengerId = (value: unknown): value is string =>
  typeof value === "string" && /^adult(?::|-\d+$)/.test(value);
export const isChildPassengerId = (value: unknown): value is string =>
  typeof value === "string" && /^child(?::|-\d+$)/.test(value);
