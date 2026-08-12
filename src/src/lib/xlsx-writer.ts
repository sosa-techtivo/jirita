// Minimal, real .xlsx (OOXML) writer — builds the handful of XML parts a
// workbook needs by hand and zips them with `fflate` (already a dependency,
// used the same way by build-project-backup-zip.ts) instead of pulling in a
// new spreadsheet library. Deliberately narrow: multiple sheets, per-cell
// bold + a single "0.00" number format, per-column widths, and (per sheet)
// one floating logo image anchored at A1 — exactly what the Hours Report
// needs, nothing more.

import { strToU8, zipSync } from "fflate";

export interface XlsxCell {
  value: string | number;
  bold?: boolean;
  /** Two-decimal numeric display ("0.00") — the cell's underlying value is
   *  still stored at full precision; this only controls how Excel renders
   *  it, so no accuracy is lost. */
  decimal?: boolean;
  /** Two-decimal currency display ("$#,##0.00") — same full-precision
   *  underlying value as `decimal`, just with a "$" prefix and thousands
   *  separators. Mutually exclusive with `decimal` (currency wins if both
   *  are set). */
  currency?: boolean;
}

export type XlsxRow = XlsxCell[];

export interface XlsxImage {
  /** Raw image bytes — PNG only (the one format this writer declares in
   *  [Content_Types].xml). */
  data: Uint8Array;
  /** Display size in pixels, converted internally to EMU. A *floating*
   *  drawing anchored at A1 (oneCellAnchor) — Excel never resizes any row
   *  or column to fit it, so a fixed size here can't distort the sheet's
   *  own row heights/column widths/layout; it simply overlays whatever
   *  sits underneath (which is why callers should leave the first couple
   *  of rows empty, same as a real header banner). */
  widthPx: number;
  heightPx: number;
}

export interface XlsxSheet {
  name: string;
  rows: XlsxRow[];
  /** Character-unit width per column, same convention Excel itself uses. */
  columnWidths?: number[];
  /** A single floating image anchored at this sheet's A1 — omitted
   *  entirely for a sheet with no image (e.g. Details), so no drawing/
   *  media parts are ever written for it. */
  image?: XlsxImage;
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
const STYLE_CURRENCY = 4;
const STYLE_BOLD_CURRENCY = 5;

function styleIndexFor(cell: XlsxCell): number {
  if (cell.currency) return cell.bold ? STYLE_BOLD_CURRENCY : STYLE_CURRENCY;
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

  // The <drawing> element (only present when this sheet has an image) must
  // come after <sheetData> per the worksheet schema's fixed child order —
  // `r:id` requires the relationships namespace, declared here regardless
  // of whether this particular sheet uses it (harmless on a sheet with no
  // drawing).
  const drawingXml = sheet.image ? `<drawing r:id="rId1"/>` : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${colsXml}<sheetData>${rowsXml}</sheetData>${drawingXml}</worksheet>`;
}

// `imageSheetIndexes` — 0-based indexes (into `sheets`) of every sheet that
// carries an image, in order. One drawing part per entry, numbered
// consecutively (drawing1.xml, drawing2.xml, ...) regardless of which
// sheet it belongs to.
const CONTENT_TYPES_XML = (sheetCount: number, imageSheetIndexes: number[]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${imageSheetIndexes.length > 0 ? `<Default Extension="png" ContentType="image/png"/>` : ""}
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${Array.from({ length: sheetCount }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${imageSheetIndexes.map((_, drawingIndex) => `<Override PartName="/xl/drawings/drawing${drawingIndex + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join("\n")}
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

// ── Drawings (floating images) ───────────────────────────────────────────────
// One PNG per sheet at most, anchored at A1 with an absolute pixel size —
// exactly what the Hours Report's Summary-sheet logo needs, nothing more
// general (no cell-to-cell stretch, no multiple images per sheet).

// 96 DPI (Excel/OOXML's own default) — 1 pixel = 9525 EMU.
const EMU_PER_PIXEL = 9525;

// A worksheet's own relationship to its one drawing part — always rId1
// since a sheet here has at most one relationship of any kind.
function sheetRelsXml(drawingFileName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/${drawingFileName}"/>
</Relationships>`;
}

// The drawing's own relationship to the actual image bytes in xl/media/.
function drawingRelsXml(mediaFileName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaFileName}"/>
</Relationships>`;
}

// A single oneCellAnchor floating picture, sized in EMU from the image's
// own real pixel dimensions — Excel never resizes a row/column to fit a
// floating drawing, so this can't distort the sheet's own layout; it only
// ever overlays whatever cells happen to sit underneath it.
function drawingXml(image: XlsxImage): string {
  const cx = Math.round(image.widthPx * EMU_PER_PIXEL);
  const cy = Math.round(image.heightPx * EMU_PER_PIXEL);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<xdr:oneCellAnchor>
<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:ext cx="${cx}" cy="${cy}"/>
<xdr:pic>
<xdr:nvPicPr><xdr:cNvPr id="1" name="Logo"/><xdr:cNvPicPr/></xdr:nvPicPr>
<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
</xdr:pic>
<xdr:clientData/>
</xdr:oneCellAnchor>
</xdr:wsDr>`;
}

// numFmtId 164+ are the ids OOXML reserves for custom formats.
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="0.00"/><numFmt numFmtId="165" formatCode="&quot;$&quot;#,##0.00"/></numFmts>
<fonts count="2">
<font><sz val="10"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><name val="Calibri"/></font>
</fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Pure function: same sheets always produce the same workbook bytes. */
export function buildXlsxWorkbook(sheets: XlsxSheet[]): Uint8Array {
  if (sheets.length === 0) {
    throw new Error("[buildXlsxWorkbook] at least one sheet is required.");
  }

  const imageSheetIndexes: number[] = [];
  sheets.forEach((sheet, i) => {
    if (sheet.image) imageSheetIndexes.push(i);
  });

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(CONTENT_TYPES_XML(sheets.length, imageSheetIndexes)),
    "_rels/.rels": strToU8(ROOT_RELS_XML),
    "xl/workbook.xml": strToU8(workbookXml(sheets)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelsXml(sheets.length)),
    "xl/styles.xml": strToU8(STYLES_XML),
  };

  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetToXml(sheet));
  });

  // One drawing + one media entry per image-bearing sheet, numbered by
  // their order in `imageSheetIndexes` (never by the sheet's own index —
  // a workbook with an image only on its second sheet still gets
  // drawing1.xml/image1.png, not drawing2.xml/image2.png).
  imageSheetIndexes.forEach((sheetIndex, drawingIndex) => {
    const image = sheets[sheetIndex].image!;
    const n = drawingIndex + 1;
    files[`xl/worksheets/_rels/sheet${sheetIndex + 1}.xml.rels`] = strToU8(sheetRelsXml(`drawing${n}.xml`));
    files[`xl/drawings/drawing${n}.xml`] = strToU8(drawingXml(image));
    files[`xl/drawings/_rels/drawing${n}.xml.rels`] = strToU8(drawingRelsXml(`image${n}.png`));
    files[`xl/media/image${n}.png`] = image.data;
  });

  return zipSync(files, { level: 6 });
}
