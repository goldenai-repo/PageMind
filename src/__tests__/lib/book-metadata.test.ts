// @vitest-environment node
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
  cleanAuthorName,
  extractEpubAuthor,
  extractPdfAuthor,
  parseCreatorsFromOpf,
} from "@/lib/book-metadata";

describe("cleanAuthorName", () => {
  it("strips nationality wrappers and 著", () => {
    expect(cleanAuthorName("〔英〕阿·柯南道尔 著")).toBe("阿·柯南道尔");
  });

  it("strips leading by:", () => {
    expect(cleanAuthorName("by Arthur Conan Doyle")).toBe("Arthur Conan Doyle");
  });
});

describe("parseCreatorsFromOpf", () => {
  it("prefers opf:role=aut over other creators", () => {
    const opf = `
      <metadata>
        <dc:creator opf:role="edt">An Editor</dc:creator>
        <dc:creator opf:role="aut">Arthur Conan Doyle</dc:creator>
      </metadata>`;
    expect(parseCreatorsFromOpf(opf)).toBe("Arthur Conan Doyle");
  });
});

describe("extractEpubAuthor", () => {
  it("reads dc:creator from the OPF", async () => {
    const zip = new JSZip();
    zip.file(
      "META-INF/container.xml",
      `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    );
    zip.file(
      "OEBPS/content.opf",
      `<?xml version="1.0"?><package><metadata><dc:creator>阿瑟·柯南·道尔</dc:creator></metadata></package>`,
    );
    const bytes = await zip.generateAsync({ type: "nodebuffer" });
    expect(await extractEpubAuthor(bytes)).toBe("阿瑟·柯南·道尔");
  });
});

describe("extractPdfAuthor", () => {
  it("reads /Author from the Info dictionary", () => {
    const pdf = Buffer.from(
      "%PDF-1.1\n1 0 obj<< /Author (Arthur Conan Doyle) >>\nendobj\n%%EOF\n",
      "latin1",
    );
    expect(extractPdfAuthor(pdf)).toBe("Arthur Conan Doyle");
  });
});
