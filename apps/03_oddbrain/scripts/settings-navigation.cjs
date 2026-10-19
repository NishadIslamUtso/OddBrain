// Browser checks use the same visible search a person can use for a moved setting.
const ALL_SETTINGS = ['Appearance', 'Engine', 'Models & API keys', 'Performance', 'Agent access', 'Connectors', 'Plugins', 'Voice & attachments', 'Vault', 'Memory', 'House rules', 'Skills', 'Recipes', 'Hooks', 'System', 'Windows & shortcuts', 'About & help'];
async function openSettingsSection(page, title) {
  const search = page.getByRole('textbox', { name: 'Search settings', exact: true });
  await search.fill(title);
  await page.getByRole('button', { name: 'Section: ' + title, exact: true }).click();
  await search.fill('');
}
module.exports = { openSettingsSection, ALL_SETTINGS };
