const { notarize } = require('@electron/notarize');

/**
 * Called by electron-builder after the app is signed (via afterSign hook).
 * Submits the signed .app to Apple's notarization service and staples the ticket.
 *
 * Required environment variables:
 *   APPLE_ID              – your Apple Developer email
 *   APPLE_APP_SPECIFIC_PASSWORD – an app-specific password (not your account password)
 *   APPLE_TEAM_ID         – your 10-character Apple Developer Team ID
 */
exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Skip notarization in local dev builds unless explicitly opted in
  if (!process.env.CI && !process.env.FORCE_NOTARIZE) {
    console.log('Skipping notarization — not running in CI');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`Notarizing ${appPath} ...`);

  await notarize({
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });

  console.log('Notarization complete');
};
