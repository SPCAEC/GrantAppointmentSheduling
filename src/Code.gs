/**
 * Grant Appointment Scheduling — Main Entry Point
 * Serves the standalone web app UI and includes shared partials.
 *
 * Notes:
 * - Uses createHtmlOutputFromFile() to keep the same sandbox context
 *   so google.script.run calls work reliably.
 * - The include() helper is used by index.html to inline CSS and JS.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('ui/index')
    .evaluate()
    .setTitle('Grant Appointment Scheduling')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Utility to include sub-files (CSS, JS, partial views)
 * Called from within HTML using: <?!= include('ui/file.html'); ?>
 */
function include(filename) {
  try {
    const file = HtmlService.createHtmlOutputFromFile(filename);
    if (!file) throw new Error('Include file not found: ' + filename);
    return file.getContent();
  } catch (err) {
    Logger.log('include() ERROR: ' + err);
    return `<!-- include error: ${err} -->`;
  }
}