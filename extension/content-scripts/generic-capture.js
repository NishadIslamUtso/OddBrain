/* Optional broad-access capture. Manual saves use the same safe extractor. */
(async () => {
  try {
    if (chrome.extension?.inIncognitoContext || !chrome.runtime?.id) return;
    if (await checkBlacklist(location.href)) return;
    const prefs = await chrome.storage.local.get({ autoCapturePages: false });
    if (!prefs.autoCapturePages) return;
    const read = oddExtractPage("page");
    if (read.ok && read.content.length >= 100)
      await postCapture({
        type: "web_page",
        url: read.url,
        title: read.title,
        content: read.content,
        completeness: read.completeness,
      });
  } catch {
    /* Extension reloads invalidate existing page scripts. */
  }
})();
