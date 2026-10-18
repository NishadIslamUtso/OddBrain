/**
 * Per-instance namespacing for kit SVGs.
 *
 * The kit's scenes each carry their own `<style>` block: a root id
 * (`#ob-idle`), element ids (`ob-idle-title`), keyframe names
 * (`ob-idle-k1`), `url(#…)` clips and `aria-labelledby` — all one consistent
 * `ob-…` token family. Two live instances of the same scene would fight over
 * one id and one keyframe set, so every instance gets a unique suffix applied
 * to the WHOLE token family at mount. The pristine source is never mutated,
 * so re-mounting can never double-suffix.
 *
 * The optional duration scale bakes the appearance mode (Calm slows a scene
 * to 1.6×) into the instance's own styles — the shipped .svg files stay
 * byte-exact, exactly as the brief demands.
 */

const TOKEN = /ob-[a-z0-9]+(?:-[a-z0-9]+)*/g

/** Suffix every ob- token (ids, keyframes, url refs, labelledby) with the uid. */
export function namespaceMotionSvg(svg: string, uid: string): string {
  if (!/^[a-z0-9-]+$/i.test(uid)) throw new Error(`bad motion uid: ${uid}`)
  return svg.replace(TOKEN, (token) => `${token}-${uid}`)
}

/** Scale every `3.2s`-style duration inside the instance's <style> blocks. */
export function scaleMotionDurations(svg: string, scale: number): string {
  if (scale === 1) return svg
  const scaleStyles = (block: string): string =>
    block.replace(/(\d+(?:\.\d+)?)s\b/g, (_all, num: string) => `${Math.round(parseFloat(num) * scale * 1000) / 1000}s`)
  return svg.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (_all, open: string, body: string, close: string) => open + scaleStyles(body) + close)
}

/** Both steps, in the order the renderer needs. */
export function prepareMotionSvg(svg: string, uid: string, durationScale = 1): string {
  const namespaced = namespaceMotionSvg(svg, uid)
  return durationScale === 1 ? namespaced : scaleMotionDurations(namespaced, durationScale)
}
