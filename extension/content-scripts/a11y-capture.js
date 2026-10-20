// a11y-capture.js — Prophet (A.7): accessibility-tree capture.
// Structure over screenshots: faster, cheaper, more private. The tree carries
// ROLES and NAMES — what a page IS — never its full text. On demand only
// (context menu), never an ambient capture.
//
// Honest caps: 400 nodes, depth 12, names cut at 120 characters. Anything cut
// is counted, not hidden: the capture reports nodes/depth so the vault record
// says what it holds.
(function () {
  'use strict';

  var MAX_NODES = 400;
  var MAX_DEPTH = 12;
  var MAX_NAME = 120;

  function isExtensionValid() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }

  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, SVG: 1, HEAD: 1, META: 1, LINK: 1 };

  function roleOf(el) {
    var explicit = el.getAttribute && el.getAttribute('role');
    if (explicit) return explicit;
    var tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'a' && el.hasAttribute('href')) return 'link';
    if (tag === 'button' || (tag === 'input' && (el.type === 'button' || el.type === 'submit'))) return 'button';
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') return 'heading';
    if (tag === 'img') return 'image';
    if (tag === 'ul' || tag === 'ol') return 'list';
    if (tag === 'li') return 'listitem';
    if (tag === 'table') return 'table';
    if (tag === 'form') return 'form';
    if (tag === 'nav') return 'navigation';
    if (tag === 'main') return 'main';
    if (tag === 'header') return 'banner';
    if (tag === 'footer') return 'contentinfo';
    if (tag === 'aside') return 'complementary';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'textbox';
    if (tag === 'section' || tag === 'article') return 'region';
    return '';
  }

  function nameOf(el, role) {
    var name = '';
    var labelled = el.getAttribute && el.getAttribute('aria-label');
    if (labelled) name = labelled;
    else if (role === 'image') name = el.getAttribute('alt') || '';
    else if (role === 'heading' || role === 'link' || role === 'button' || role === 'listitem') {
      name = (el.innerText || el.textContent || '').trim().slice(0, MAX_NAME);
    } else if (role === 'textbox') {
      name = el.getAttribute('placeholder') || el.getAttribute('name') || '';
    }
    name = String(name).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    return name;
  }

  /**
   * Walk the real DOM once, in document order. Only elements with an
   * accessibility role are recorded — layout wrappers are invisible to an
   * assistive tree, so they are invisible here too.
   * Returns { tree, nodes, depth } — tree is indented text, fenced by the caller.
   */
  function buildA11yTree(root) {
    var lines = [];
    var nodes = 0;
    var depth = 0;
    var truncated = false;

    function walk(el, level) {
      if (truncated || !el || level > MAX_DEPTH) {
        if (level > MAX_DEPTH && !truncated) {
          lines.push(new Array(level).join('  ') + '… (deeper levels cut at depth ' + MAX_DEPTH + ')');
          truncated = true;
        }
        return;
      }
      for (var child = el.firstElementChild; child; child = child.nextElementSibling) {
        if (truncated) return;
        var tag = child.tagName ? child.tagName.toUpperCase() : '';
        if (SKIP[tag]) continue;
        if (child.getAttribute && child.getAttribute('aria-hidden') === 'true') continue;
        if (child.getAttribute && child.getAttribute('hidden') !== null) continue;
        var style = null;
        try { style = window.getComputedStyle(child); } catch (e) {}
        if (style) {
          var rect = child.getBoundingClientRect();
          var clipped = style.clipPath === 'inset(100%)' || /rect\(0(?:px)?[, ]+0(?:px)?[, ]+0(?:px)?[, ]+0(?:px)?\)/i.test(style.clip || '');
          var transparentText = style.color === 'transparent' || /rgba?\([^)]*,\s*0\s*\)$/i.test(style.color || '') || style.webkitTextFillColor === 'transparent';
          var collapsedTransform = /(?:scale(?:X|Y)?\(0(?:[),])|matrix\(0,\s*0,\s*0,\s*0,)/i.test(style.transform || '');
          if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.contentVisibility === 'hidden' || style.opacity !== '' && Number(style.opacity) === 0 || parseFloat(style.fontSize || '16') < 2 || clipped || transparentText || collapsedTransform || ((rect.width <= 1 || rect.height <= 1) && [style.overflow, style.overflowX, style.overflowY].some(function (value) { return value === 'hidden' || value === 'clip'; }))) continue;
        }
        var role = roleOf(child);
        if (!role) {
          walk(child, level);
          continue;
        }
        if (nodes >= MAX_NODES) {
          lines.push('… (cut at ' + MAX_NODES + ' nodes)');
          truncated = true;
          return;
        }
        nodes += 1;
        if (level > depth) depth = level;
        var name = nameOf(child, role);
        lines.push(new Array(level).join('  ') + role + (name ? ': ' + name : ''));
        walk(child, level + 1);
      }
    }

    walk(root, 1);
    return { tree: lines.join('\n'), nodes: nodes, depth: Math.min(depth, MAX_DEPTH), truncated: truncated };
  }

  async function capture() {
    if (!isExtensionValid()) return;
    try {
      var url = location.href;
      if (await checkBlacklist(url)) return;
      var built = buildA11yTree(document);
      if (!built.nodes) return;
      var payload = {
        type: 'a11y_tree',
        url: url,
        title: document.title || '',
        tree: built.tree,
        nodes: built.nodes,
        depth: built.depth,
        completeness: built.truncated ? 'partial' : 'full'
      };
      try {
        await postCapture(payload);
      } catch (e) {
        try { await postCapture({ type: 'wasnt_accessible', url: url, reason: 'app offline or structure capture failed' }); } catch (err) {}
      }
    } catch (e) {}
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildA11yTree: buildA11yTree, roleOf: roleOf, nameOf: nameOf, MAX_NODES: MAX_NODES, MAX_DEPTH: MAX_DEPTH, MAX_NAME: MAX_NAME };
  } else {
    capture();
  }
})();
