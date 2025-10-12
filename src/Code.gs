/**
 * Grant Appointment Scheduling — Main Entry Point
 * Serves the standalone web app and includes UI partials.
 *
 * Structure:
 *  - doGet(): main entry, serves ui/index.html
 *  - include(): inlines CSS, JS, or partials using <?!= include('path/file'); ?>
 */

function doGet() {
  try {
    return HtmlService.createTemplateFromFile('ui/index')
      .evaluate()
      .setTitle('Grant Appointment Scheduling')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setSandboxMode(HtmlService.SandboxMode.IFRAME);
  } catch (err) {
    Logger.log('doGet() ERROR: ' + err);
    return HtmlService.createHtmlOutput('<p>Error loading web app.</p>');
  }
}

/**
 * Include helper
 * Usage: <?!= include('ui/filename'); ?>
 * Looks for .html automatically if extension omitted.
 */
function include(filename) {
  try {
    const cleanName = filename.endsWith('.html') ? filename : `${filename}.html`;
    const output = HtmlService.createHtmlOutputFromFile(cleanName);
    return output.getContent();
  } catch (err) {
    Logger.log('include() ERROR: ' + err);
    return `<!-- include error: ${err.message || err} -->`;
  }
}