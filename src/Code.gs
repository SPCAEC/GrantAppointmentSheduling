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
  try {
    Logger.log('doGet() called — serving ui/index.html');
    return HtmlService.createHtmlOutputFromFile('ui/index')
      .setTitle('Grant Appointment Scheduling')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    Logger.log('doGet() ERROR: ' + err);
    throw err;
  }
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