let screenshots = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureScreenshot') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      screenshots.push({ dataUrl, clickX: message.clickX, clickY: message.clickY });
      sendResponse({ dataUrl, clickX: message.clickX, clickY: message.clickY });
    });
    return true; // Keeps the message channel open for sendResponse
  } else if (message.action === 'stopRecording') {
    sendResponse({ screenshots });
    screenshots = []; // Reset for the next recording
  }
});
