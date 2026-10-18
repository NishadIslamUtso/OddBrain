// Poll from the driver, independently of the page's animation-frame scheduler.
// Check the actual mounted renderer and completed opening, not a fixed sleep.
module.exports = async function ready(page, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(() => !!document.querySelector('.ob-app-root') && !document.querySelector('.ob-launch'))) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('The renderer did not finish its opening within ten seconds.');
};
