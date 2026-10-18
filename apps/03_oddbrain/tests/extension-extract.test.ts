// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { oddExtractPage } = require("../../../extension/lib/page-extract.js");
beforeEach(() => {
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
});
describe("page previews exclude secrets and preserve plain text", () => {
  it("omits form fields, contenteditable drafts, scripts and excluded UI", () => {
    document.body.innerHTML =
      '<article><h1>Public title</h1><p>Public prose</p><form>SECRET_FORM<input value="SECRET_VALUE"></form><textarea>SECRET_DRAFT</textarea><div contenteditable="true">SECRET_EDITOR</div><div hidden>SECRET_HIDDEN</div><div style="display:none">SECRET_CSS</div><div data-private>SECRET_PRIVATE</div><div data-oddbrain>SECRET_UI</div><script>SECRET_SCRIPT</script></article>';
    const result = oddExtractPage("page");
    expect(result.ok).toBe(true);
    expect(result.content).toContain("Public prose");
    expect(result.content).not.toContain("SECRET");
  });
  it("refuses a selection inside an unsent draft", () => {
    document.body.innerHTML =
      '<div contenteditable="true">Do not capture this</div>';
    const range = document.createRange();
    range.selectNodeContents(document.body.firstChild!);
    window.getSelection()!.addRange(range);
    expect(oddExtractPage("selection").ok).toBe(false);
  });
  it("keeps only a selected passage, without hidden form text in the range", () => {
    document.body.innerHTML =
      '<p>Keep this <input value="SECRET"><textarea>SECRET</textarea> passage.</p>';
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("p")!);
    window.getSelection()!.addRange(range);
    expect(oddExtractPage("selection").content).toBe("Keep this  passage.");
  });
  it("filters CSS-hidden text from a selection and retains partial text offsets", () => {
    document.body.innerHTML =
      '<p>Before <span>choose this</span><i style="display:none">SECRET</i> after</p>';
    const range = document.createRange();
    range.setStart(document.querySelector("span")!.firstChild!, 2);
    range.setEnd(document.querySelector("p")!.lastChild!, 3);
    window.getSelection()!.addRange(range);
    const result = oddExtractPage("selection");
    expect(result.content).toBe("oose this af");
    expect(result.content).not.toContain("SECRET");
  });
  it("reports truncation rather than claiming complete capture", () => {
    document.body.innerHTML = "<article>" + "a".repeat(61000) + "</article>";
    const result = oddExtractPage("page");
    expect(result.content).toHaveLength(60000);
    expect(result.completeness).toContain("limited");
  });
});
