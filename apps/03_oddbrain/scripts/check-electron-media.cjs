// Executes actual packaged decoder dependencies in Electron's Node runtime.
// No windows/microphone/provider credentials and no writes to user preferences.
const { app } = require('electron');
app.whenReady().then(async () => {
  try { await require('./check-media-native.cjs')(); app.exit(0) }
  catch (error) { console.error(error); app.exit(1) }
}).catch(error => { console.error(error); app.exit(1) });
