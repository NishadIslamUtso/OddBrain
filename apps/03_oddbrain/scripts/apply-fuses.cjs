/**
 * afterPack: flip the Electron fuses on the packaged binary (win/mac/linux).
 * Config-as-code rather than config-as-yaml because fuses are binary patches,
 * not metadata — and the packaged app must refuse the classic abuse paths:
 * ELECTRON_RUN_AS_NODE (arbitrary Node in the app's privileges), NODE_OPTIONS
 * injection, and --inspect on the production binary.
 */
const path = require('node:path')
const { flipFuses, FuseV1Options, FuseVersion } = require('@electron/fuses')

/** @param {import('app-builder-lib').AfterPackContext} context */
module.exports = async function afterPack(context) {
  // The TARGET platform decides the suffix, not the build host: a Linux
  // machine building for Windows still patches OddBrain.exe.
  const exe = path.join(
    context.appOutDir,
    context.packager.appInfo.productFilename + (context.electronPlatformName === 'win32' ? '.exe' : ''),
  )
  await flipFuses(exe, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
  })
  console.log(`[fuses] flipped for ${exe}`)
}
