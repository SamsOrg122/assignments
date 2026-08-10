/**
 * The small amount of OOXML this needs, written by hand.
 *
 * A `.docx` is a ZIP of XML parts. Nothing here tries to be a general Word
 * library — it emits the handful of parts a document from this app actually
 * uses, and it emits them in the order Word is fussy about. The alternative
 * was a dependency an order of magnitude larger than the feature.
 *
 * Namespaces are declared once, on the document element, because Word rejects
 * a part that uses a prefix it has not been told about — and the failure is a
 * dialog saying the file is corrupt, with no hint which prefix.
 */

export const xmlEscape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Half-points. Word measures type in them, so 12pt is 24. */
export const halfPoints = (pt: number) => Math.round(pt * 2);

/** Twentieths of a point — Word's unit for everything spatial. */
export const twips = (mm: number) => Math.round((mm / 25.4) * 1440);

/** English Metric Units, for anything inside a drawing. */
export const emu = (px: number) => Math.round(px * 9525);

export const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/**
 * Every namespace the document part uses, including the ones Word only needs
 * when a feature appears — tracked changes and drawings both bring their own.
 */
export const DOC_NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
].join(" ");

export const contentTypes = (media: Array<{ path: string; type: string }>) => {
  const seen = new Set<string>();
  const defaults = [
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
  ];
  for (const m of media) {
    const ext = m.path.split(".").pop() ?? "png";
    if (seen.has(ext)) continue;
    seen.add(ext);
    defaults.push(`<Default Extension="${ext}" ContentType="${m.type}"/>`);
  }
  return `${HEAD}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
${defaults.join("")}
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;
};

export const packageRels = `${HEAD}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

/**
 * Styles.
 *
 * Only the ones the converter names. Word will render a document with no
 * styles part, but every heading comes out as body text — which is exactly
 * what breaks a contents page and a navigation pane on the other side.
 */
export const styles = (bodyPt: number, family: string) => `${HEAD}
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="${xmlEscape(family)}" w:hAnsi="${xmlEscape(family)}"/>
      <w:sz w:val="${halfPoints(bodyPt)}"/>
    </w:rPr></w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  ${[1, 2, 3]
    .map(
      (level) => `<w:style w:type="paragraph" w:styleId="Heading${level}">
    <w:name w:val="heading ${level}"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:outlineLvl w:val="${level - 1}"/><w:keepNext/>
      <w:spacing w:before="${240 - level * 40}" w:after="${120 - level * 20}"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="${halfPoints(bodyPt + (4 - level) * 3)}"/></w:rPr>
  </w:style>`,
    )
    .join("")}
  <w:style w:type="paragraph" w:styleId="Quote">
    <w:name w:val="Quote"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="720"/></w:pPr>
    <w:rPr><w:i/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Caption">
    <w:name w:val="caption"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:after="200"/></w:pPr>
    <w:rPr><w:i/><w:sz w:val="${halfPoints(bodyPt - 2)}"/></w:rPr>
  </w:style>
  <w:style w:type="character" w:styleId="FootnoteReference">
    <w:name w:val="footnote reference"/>
    <w:rPr><w:vertAlign w:val="superscript"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="FootnoteText">
    <w:name w:val="footnote text"/><w:basedOn w:val="Normal"/>
    <w:rPr><w:sz w:val="${halfPoints(bodyPt - 2)}"/></w:rPr>
  </w:style>
  <w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/></w:style>
</w:styles>`;

/**
 * Numbering for bulleted and ordered lists.
 *
 * Two definitions, referenced by `numId` 1 and 2. Word needs a numbering part
 * for `w:numPr` to mean anything; without it a list is a stack of paragraphs
 * with no markers at all.
 */
export const numbering = `${HEAD}
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    ${Array.from({ length: 3 }, (_, i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`).join("")}
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    ${Array.from({ length: 3 }, (_, i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${i + 1}."/><w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`).join("")}
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;
