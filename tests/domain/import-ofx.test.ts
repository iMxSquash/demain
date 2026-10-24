import { describe, expect, it } from "vitest";

import { parseOfx } from "../../src/domain/import-ofx";
import { ImportParseError } from "../../src/domain/import-row";

const SGML_STATEMENT = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>EUR
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260201120000[+1:CET]
<TRNAMT>-12.50
<FITID>2026020100001
<NAME>CARD SHOP
<MEMO>PARIS 75
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260205
<TRNAMT>1143.88
<FITID>2026020500002
<NAME>SALARY
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

const XML_STATEMENT = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="220"?>
<OFX>
  <BANKMSGSRSV1><STMTTRNRS><STMTRS>
    <CURDEF>EUR</CURDEF>
    <BANKTRANLIST>
      <STMTTRN>
        <DTPOSTED>20260210</DTPOSTED>
        <TRNAMT>-3,20</TRNAMT>
        <FITID>A1</FITID>
        <NAME>BAKERY &amp; CO</NAME>
      </STMTTRN>
    </BANKTRANLIST>
  </STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

describe("parseOfx", () => {
  it("reads the transactions of an OFX 1.x (SGML) statement", () => {
    expect(parseOfx(SGML_STATEMENT, "EUR")).toEqual([
      {
        date: "2026-02-01",
        amount: -1_250,
        label: "CARD SHOP PARIS 75",
        externalId: "2026020100001",
      },
      {
        date: "2026-02-05",
        amount: 114_388,
        label: "SALARY",
        externalId: "2026020500002",
      },
    ]);
  });

  it("reads an OFX 2.x (XML) statement and decodes entities", () => {
    expect(parseOfx(XML_STATEMENT, "EUR")).toEqual([
      {
        date: "2026-02-10",
        amount: -320,
        label: "BAKERY & CO",
        externalId: "A1",
      },
    ]);
  });

  it("keeps markup in a label as plain text", () => {
    const text = XML_STATEMENT.replace("BAKERY &amp; CO", "&lt;b&gt;X&lt;/b&gt;");

    expect(parseOfx(text, "EUR")[0]?.label).toBe("<b>X</b>");
  });

  it("does not expand entities declared by the file", () => {
    const text = `<?xml version="1.0"?>
<!DOCTYPE OFX [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
${XML_STATEMENT.replace("BAKERY &amp; CO", "&xxe;")}`;

    expect(parseOfx(text, "EUR")[0]?.label).toBe("&xxe;");
  });

  it("leaves the identifier empty when the bank gives none", () => {
    const text = SGML_STATEMENT.replace("<FITID>2026020500002\n", "");

    expect(parseOfx(text, "EUR")[1]?.externalId).toBeNull();
  });

  it("rejects a statement in another currency than the account", () => {
    expect(() => parseOfx(SGML_STATEMENT, "USD")).toThrow(ImportParseError);
  });

  it("rejects a file with no transaction", () => {
    expect(() => parseOfx("<OFX><BANKTRANLIST></BANKTRANLIST></OFX>", "EUR")).toThrow(
      ImportParseError,
    );
  });

  it("rejects text that is not OFX", () => {
    expect(() => parseOfx("Date;Label;Amount", "EUR")).toThrow(ImportParseError);
  });

  it("rejects a transaction with an invalid amount or date", () => {
    const badAmount = SGML_STATEMENT.replace("-12.50", "twelve");
    const badDate = SGML_STATEMENT.replace("20260201120000[+1:CET]", "2026-02");

    expect(() => parseOfx(badAmount, "EUR")).toThrow(ImportParseError);
    expect(() => parseOfx(badDate, "EUR")).toThrow(ImportParseError);
  });
});
