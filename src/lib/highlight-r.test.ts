import { tokenizeRLine } from "./highlight-r";

const joined = (line: string) => tokenizeRLine(line).map(t => t.text).join("");

describe("tokenizeRLine", () => {
  it("round-trips text exactly (tokens are lossless)", () => {
    const lines = [
      "mammals <- mammals |>  filter(!(case_id %in% c(4, 5)))",
      "p1 <- ggplot(pets) + aes(x = count)",
      "# You deleted 2 cases.",
      "mutate(`Heart Rate` = mean(rate) * 2.5e3)"
    ];
    for (const line of lines) expect(joined(line)).toBe(line);
  });

  it("classifies functions, identifiers, strings, numbers, keywords, comments", () => {
    const tokens = tokenizeRLine('if (x > 1) filter(df, name == "a") # note');
    const byText = new Map(tokens.map(t => [t.text, t.type]));
    expect(byText.get("if")).toBe("keyword");
    expect(byText.get("filter")).toBe("function");
    expect(byText.get("df")).toBe("identifier");
    expect(byText.get('"a"')).toBe("string");
    expect(byText.get("1")).toBe("number");
    expect(byText.get("# note")).toBe("comment");
  });

  it("treats the pipe and %in% as single operator tokens", () => {
    const tokens = tokenizeRLine("a |> b %in% c");
    const ops = tokens.filter(t => t.type === "operator").map(t => t.text);
    expect(ops).toEqual(["|>", "%in%"]);
  });
});
