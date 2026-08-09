import { translateFormula, UntranslatableFormulaError } from "./formula-translator";

describe("translateFormula", () => {
  it.each([
    ["mass * 2 + 1", "mass * 2 + 1"],
    ["mass^2", "mass^2"],
    ['diet = "meat"', 'diet == "meat"'],
    ["mass ≠ 5", "mass != 5"],
    ["mass >= 10", "mass >= 10"],
    ['mass > 10 and diet = "meat"', 'mass > 10 & diet == "meat"'],
    ['diet = "meat" or diet = "fish"', 'diet == "meat" | diet == "fish"'],
    // CODAP's ln is natural log; CODAP's log is base 10.
    ["ln(mass)", "log(mass)"],
    ["log(mass)", "log10(mass)"],
    ["round(mean(mass))", "round(mean(mass))"],
    ['if(mass > 100, "big", "small")', 'ifelse(mass > 100, "big", "small")'],
    ["count()", "n()"],
    ["caseIndex()", "row_number()"],
    ['concat(species, " (", diet, ")")', 'paste0(species, " (", diet, ")")'],
    ["not(mass > 5)", "!(mass > 5)"],
    ["true", "TRUE"],
    ["false", "FALSE"],
    // Backticked (non-syntactic) attribute names survive.
    ["`Heart Rate` * 2", "`Heart Rate` * 2"],
    // Single-quoted CODAP strings become double-quoted R strings.
    ["if(diet = 'meat', 1, 0)", 'ifelse(diet == "meat", 1, 0)']
  ])("%s -> %s", (codap, r) => {
    expect(translateFormula(codap)).toBe(r);
  });

  const getError = (fn: () => unknown): unknown => {
    let caught: unknown;
    try {
      fn();
    } catch (error) {
      caught = error;
    }
    return caught;
  };

  it.each([
    ["lookupByKey(ds, key, val)", /lookupByKey/],
    ["random()", /random/],
    ["wordListMatches(text)", /wordListMatches/]
  ])("rejects unsupported function %s with a learner-readable reason", (formula, reason) => {
    const error = getError(() => translateFormula(formula));
    expect(error).toBeInstanceOf(UntranslatableFormulaError);
    expect((error as UntranslatableFormulaError).reason).toMatch(reason);
  });

  it("rejects unrecognized syntax rather than passing it through", () => {
    expect(() => translateFormula("mass @ 2")).toThrow(UntranslatableFormulaError);
  });
});
