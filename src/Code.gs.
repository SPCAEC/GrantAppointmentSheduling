/**
 * Grant Appointment Scheduling — Main Entry Point
 * Serves the standalone web app UI.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('ui/index')
    .evaluate()
    .setTitle('Grant Appointment Scheduling')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}