import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCells, parseBatch, resultsCSV } from "../lib/csv.ts";
const header = "sample_id,volatile acidity,sulphates,alcohol";

test("CSV supports quotes, BOM, CRLF, sample names, and semicolons", () => {
  assert.equal(parseBatch('\uFEFF'+header+'\r\n"Lot, A",.7,.56,9.4\r\n').rows[0].id, "Lot, A");
  assert.equal(parseBatch("volatile_acidity;sulphates;alcohol\n.7;.56;9.4").rows.length, 1);
  assert.deepEqual(parseCells('a,b\n"one\nline","a""b"'), [["a", "b"], ["one\nline", 'a"b']]);
});
test("full dataset columns are ignored explicitly; observed quality stays separate", () => {
  const parsed = parseBatch("volatile acidity,sulphates,alcohol,pH,quality\n.7,.56,9.4,3.5,5");
  assert.deepEqual(parsed.ignored, ["pH"]);
  assert.equal(parsed.rows[0].observed, 5);
  assert.equal(Object.keys(parsed.rows[0].measurements).length, 3);
});
test("all 1,599 dataset rows are supported for chunked inference", () => {
  const parsed = parseBatch(header+"\n"+Array.from({ length: 1599 }, (_, i) => `Lot${i},.7,.56,9.4`).join("\n"));
  assert.equal(parsed.rows.length, 1599);
});
test("CSV downloads escape spreadsheet formulas and quoted IDs", () => {
  const rows = parseBatch(header+'\n"=SUM(1,2)",.7,.56,9.4').rows;
  const text = resultsCSV(rows.map(r => ({ ...r, predicted: 5.1, warnings: [] })));
  assert.ok(text.includes('"\'=SUM(1,2)"'));
  assert.ok(text.includes("5.1"));
});
for (const text of ["", header, "unknown,sulphates,alcohol\n1,2,3", header+"\nx,,.5,9", header+"\nx,nan,.5,9", header+"\nx,-1,.5,9", header+"\nx,1,.5,9,10", header+"\nx,1,.5,9\nx,1,.5,9", header+'\n"broken,1,.5,9', "alcohol,alcohol,sulphates,volatile acidity\n9,9,.5,.7", header+",quality\nx,.7,.5,9,5.5", header+",extra\nx,.7,.5,9,1", header+'\n"x"oops,.7,.5,9']) {
  test(`reject invalid CSV ${text.slice(0, 55)}`, () => assert.throws(() => parseBatch(text)));
}
