/**
 * Grant Appointment Scheduling — Main Entry Point
 * Serves the standalone web app and includes UI partials.
 *
 * Structure:
 *  - doGet(): main entry, serves ui/index.html
 *  - include(): safely inlines CSS/JS partials using <?!= include('path/file'); ?>
 */

/**
 * Serves the main HTML interface.
 */
function doGet() {
  try {
    Logger.log('🚀 Serving Grant Appointment Scheduling web app...');
    return HtmlService.createTemplateFromFile('ui/index')
      .evaluate()
      .setTitle('Grant Appointment Scheduling')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setSandboxMode(HtmlService.SandboxMode.IFRAME);
  } catch (err) {
    Logger.log(`❌ doGet() ERROR: ${err.message || err}`);
    return HtmlService.createHtmlOutput('<p>Error loading web app.</p>');
  }
}

/**
 * include(filename)
 * Safely inlines UI partials into HtmlService templates.
 * Accepts paths like "ui/js.utils" or "ui/js.utils.html".
 *
 * Example:
 *   <?!= include('ui/js.utils'); ?>
 */
function include(filename) {
  try {
    // Normalize path and ensure extension
    let path = filename.trim().replace(/^\/*/, ''); // remove leading slashes
    if (!path.endsWith('.html')) path += '.html';

    // Try to load file content from project
    const file = HtmlService.createHtmlOutputFromFile(path);
    const content = file.getContent();

    if (!content) throw new Error('File found but empty');
    return content;

  } catch (err) {
    Logger.log(`❌ include() failed for "${filename}": ${err.message || err}`);
    // Return harmless comment instead of raw include tag
    return `<!-- include error: ${filename} (${err.message || err}) -->`;
  }
}

function forceReauth_send() {
  GmailApp.sendEmail(
    'yourspcaoutreachteam@gmail.com',
    'Pet Helper Pro OAuth Test',
    'If you received this, Gmail send permission is working.'
  );
}