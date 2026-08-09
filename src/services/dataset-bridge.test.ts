import { itemsToCsv } from "./dataset-bridge";

describe("itemsToCsv", () => {
  it("puts case_id first and unions headers across items", () => {
    const csv = itemsToCsv([
      { animal: "dog", case_id: 1, count: 5 },
      { case_id: 2, animal: "cat", count: 4, size: 25 }
    ]);
    expect(csv).toBe("case_id,animal,count,size\n1,dog,5,NA\n2,cat,4,25\n");
  });

  it("renders null/empty as NA and escapes quotes/commas", () => {
    const csv = itemsToCsv([
      { case_id: 1, note: 'says "hi", loudly', value: null },
      { case_id: 2, note: "", value: 3.5 }
    ]);
    expect(csv).toBe('case_id,note,value\n1,"says ""hi"", loudly",NA\n2,NA,3.5\n');
  });

  it("renders booleans as R logicals and non-finite numbers as NA", () => {
    const csv = itemsToCsv([{ case_id: 1, ok: true, bad: Number.NaN }]);
    expect(csv).toBe("case_id,ok,bad\n1,TRUE,NA\n");
  });

  it("handles an empty item list", () => {
    expect(itemsToCsv([])).toBe("\n");
  });
});
