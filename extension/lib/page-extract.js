/* Serialized by chrome.scripting: deliberately self-contained, no page code. */
function oddExtractPage(mode = "page") {
  const privateSelector =
    'script,style,noscript,template,iframe,form,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"],[data-private],[data-oddbrain]';
  const selection = window.getSelection();
  const visuallyHidden = (element, style) => {
    const rect = element.getBoundingClientRect();
    const clipped = style.clipPath === "inset(100%)" || /rect\(0(?:px)?[, ]+0(?:px)?[, ]+0(?:px)?[, ]+0(?:px)?\)/i.test(style.clip || "");
    const color = style.color || "";
    const transparentText = color === "transparent" || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(color) || /^rgba?\([^)]*\/\s*0(?:\.0+)?%?\s*\)$/i.test(color) || style.webkitTextFillColor === "transparent";
    const collapsedTransform = /(?:scale(?:X|Y)?\(0(?:[),])|matrix\(0,\s*0,\s*0,\s*0,)/i.test(style.transform || "");
    return style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.contentVisibility === "hidden" || style.opacity !== "" && Number(style.opacity) === 0 || Number.parseFloat(style.fontSize || "16") < 2 || clipped || transparentText || collapsedTransform || ((rect.width <= 1 || rect.height <= 1) && [style.overflow, style.overflowX, style.overflowY].some((value) => ["hidden", "clip"].includes(value)));
  };
  const cleanText = (element) => {
    if (element.closest?.(privateSelector)) return "";
    const ownStyle = element.isConnected ? getComputedStyle(element) : null;
    if (ownStyle && visuallyHidden(element, ownStyle)) return "";
    const copy = element.cloneNode(true);
    if (element.isConnected) {
      const originals = element.querySelectorAll("*"),
        clones = copy.querySelectorAll("*");
      originals.forEach((original, index) => {
        const style = getComputedStyle(original);
        if (visuallyHidden(original, style)) clones[index]?.remove();
      });
    }
    copy
      .querySelectorAll(privateSelector + ",nav,footer")
      .forEach((el) => el.remove());
    return (copy.textContent || "")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };
  let text = "",
    completeness = "readable excerpt";
  if (mode === "selection") {
    if (!selection || !selection.rangeCount || selection.isCollapsed)
      return {
        ok: false,
        error:
          "Select some page text first. Text inside forms and draft editors is excluded.",
      };
    const range = selection.getRangeAt(0),
      node = range.commonAncestorContainer;
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (element?.closest(privateSelector))
      return {
        ok: false,
        error: "Form fields and unsent drafts are never captured.",
      };
    // Work against the original DOM: a detached range fragment loses computed
    // visibility, and can otherwise include CSS-hidden text inside the range.
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const parts = [];
    let leaf;
    while ((leaf = walker.nextNode())) {
      if (
        !range.intersectsNode(leaf) ||
        leaf.parentElement?.closest(privateSelector)
      )
        continue;
      let hidden = false;
      for (
        let parent = leaf.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        const style = getComputedStyle(parent);
        if (visuallyHidden(parent, style)) {
          hidden = true;
          break;
        }
      }
      if (hidden) continue;
      const start = leaf === range.startContainer ? range.startOffset : 0;
      const end =
        leaf === range.endContainer ? range.endOffset : leaf.textContent.length;
      parts.push(leaf.textContent.slice(start, end));
    }
    text = parts.join("").trim();
    completeness = "selected excerpt";
  } else if (mode === "structure") {
    const nodes = [];
    for (const el of document.querySelectorAll("h1,h2,h3,h4,a,button,[role]")) {
      if (el.closest(privateSelector) || !el.getClientRects().length) continue;
      const role =
        el.getAttribute("role") ||
        { A: "link", BUTTON: "button" }[el.tagName] ||
        "heading";
      nodes.push({ role, name: cleanText(el).slice(0, 120) });
      if (nodes.length >= 400) break;
    }
    if (!nodes.length)
      return { ok: false, error: "No visible page structure was found." };
    const tree = nodes.map((n) => n.role + ": " + n.name).join("\n");
    return {
      ok: true,
      url: location.href,
      title: document.title,
      content: tree,
      tree,
      nodes: nodes.length,
      depth: 1,
      completeness: "flat visible outline, at most 400 nodes",
      type: "a11y_tree",
    };
  } else {
    const main =
      document.querySelector("article") ||
      document.querySelector("main") ||
      document.body;
    if (main) text = cleanText(main);
  }
  if (!text)
    return {
      ok: false,
      error:
        "No readable text was found. Try selecting a passage, or use Page structure.",
    };
  const truncated = text.length > 60000;
  return {
    ok: true,
    url: location.href,
    title: document.title,
    content: text.slice(0, 60000),
    completeness:
      completeness + (truncated ? ", limited to 60,000 characters" : ""),
    type: "web_page",
  };
}
if (typeof module !== "undefined") module.exports = { oddExtractPage };
