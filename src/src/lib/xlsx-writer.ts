// Minimal, real .xlsx (OOXML) writer — builds the handful of XML parts a
// workbook needs by hand and zips them with `fflate` (already a dependency,
// used the same way by build-project-backup-zip.ts) instead of pulling in a
// new spreadsheet library. Deliberately narrow: multiple sheets, per-cell
// bold + a single "0.00" number format, and per-column widths — exactly what
// the Hours Report needs, nothing more.

import { strToU8, zipSync } from "fflate";

export interface XlsxCell {
  value: string | number;
  bold?: boolean;
  /** Two-decimal numeric display ("0.00") — the cell's underlying value is
   *  still stored at full precision; this only controls how Excel renders
   *  it, so no accuracy is lost. */
  decimal?: boolean;
}

export type XlsxRow = XlsxCell[];

export interface XlsxSheet {
  name: string;
  rows: XlsxRow[];
  /** Character-unit width per column, same convention Excel itself uses. */
  columnWidths?: number[];
}

const XML_INVALID_CONTROL_CHARS = new RegExp(
  "[" +
    String.fromCharCode(0) + "-" + String.fromCharCode(8) +
    String.fromCharCode(11) +
    String.fromCharCode(12) +
    String.fromCharCode(14) + "-" + String.fromCharCode(31) +
  "]",
  "g"
);

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Strip control characters invalid in XML 1.0 (everything except tab/LF/CR).
    .replace(XML_INVALID_CONTROL_CHARS, "");
}

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

// Style indices below must match the cellXfs order written in STYLES_XML.
const STYLE_PLAIN = 0;
const STYLE_BOLD = 1;
const STYLE_DECIMAL = 2;
const STYLE_BOLD_DECIMAL = 3;

function styleIndexFor(cell: XlsxCell): number {
  if (cell.decimal) return cell.bold ? STYLE_BOLD_DECIMAL : STYLE_DECIMAL;
  return cell.bold ? STYLE_BOLD : STYLE_PLAIN;
}

function sheetToXml(sheet: XlsxSheet): string {
  const colsXml = sheet.columnWidths?.length
    ? `<cols>${sheet.columnWidths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";

  const rowsXml = sheet.rows
    .map((row, rowIndex) => {
      const rowNum = rowIndex + 1;
      const cellsXml = row
        .map((cell, colIndex) => {
          const ref = `${columnLetter(colIndex)}${rowNum}`;
          const styleAttr = ` s="${styleIndexFor(cell)}"`;
          if (typeof cell.value === "number") {
            const v = Number.isFinite(cell.value) ? cell.value : 0;
            return `<c r="${ref}"${styleAttr}><v>${v}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNum}">${cellsXml}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${colsXml}<sheetData>${rowsXml}</sheetData></worksheet>`;
}

const CONTENT_TYPES_XML = (sheetCount: number) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${Array.from({ length: sheetCount }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

function workbookXml(sheets: XlsxSheet[]): string {
  const sheetEls = sheets
    .map((sheet, i) => `<sheet name="${escapeXml(sheet.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheetEls}</sheets></workbook>`;
}

function workbookRelsXml(sheetCount: number): string {
  const sheetRels = Array.from(
    { length: sheetCount },
    (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  ).join("");
  const stylesRel = `<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}${stylesRel}</Relationships>`;
}

// numFmtId 164 is the first id OOXML reserves for custom formats.
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts>
<fonts count="2">
<font><sz val="10"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><name val="Calibri"/></font>
</fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Pure function: same sheets always produce the same workbook bytes. */
export function buildXlsxWorkbook(sheets: XlsxSheet[]): Uint8Array {
  if (sheets.length === 0) {
    throw new Error("[buildXlsxWorkbook] at least one sheet is required.");
  }

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(CONTENT_TYPES_XML(sheets.length)),
    "_rels/.rels": strToU8(ROOT_RELS_XML),
    "xl/workbook.xml": strToU8(workbookXml(sheets)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelsXml(sheets.length)),
    "xl/styles.xml": strToU8(STYLES_XML),
  };

  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetToXml(sheet));
  });

  return zipSync(files, { level: 6 });
}
