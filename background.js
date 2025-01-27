chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureScreenshot') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      sendResponse({ dataUrl, clickX: message.clickX, clickY: message.clickY });
    });
    return true; // Keeps the message channel open for sendResponse
  } else if (message.action === 'generatePDF') {
    generatePDF(message.screenshots);
  }
});

function generatePDF(screenshots) {
  const pdf = new jsPDF();
  screenshots.forEach((screenshot, index) => {
    if (index > 0) pdf.addPage();
    pdf.addImage(screenshot.dataUrl, 'PNG', 10, 10, 180, 0);
    pdf.circle(screenshot.clickX, screenshot.clickY, 5, 'F');
  });
  pdf.save('TTL_Recording.pdf');
}
