// Array to store screenshots
let screenshots = [];

// Listen for messages from the popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received in background.js:', message);

  // Handle different actions
  switch (message.action) {
    case 'startRecording':
      // Reset screenshots array when recording starts
      screenshots = [];
      console.log('Recording started. Screenshots array reset.');
      break;

    case 'captureScreenshot':
      // Capture a screenshot of the visible tab
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error('Error capturing screenshot:', chrome.runtime.lastError);
          sendResponse({ error: 'Failed to capture screenshot' });
        } else {
          console.log('Screenshot captured:', dataUrl);
          // Add the screenshot and click coordinates to the screenshots array
          screenshots.push({
            dataUrl: dataUrl,
            clickX: message.clickX,
            clickY: message.clickY,
          });
          sendResponse({ dataUrl, clickX: message.clickX, clickY: message.clickY });
        }
      });
      // Return true to indicate that sendResponse will be called asynchronously
      return true;

    case 'stopRecording':
      // Send the collected screenshots back to the popup
      console.log('Recording stopped. Sending screenshots to popup:', screenshots);
      sendResponse({ screenshots });
      // Reset the screenshots array for the next recording
      screenshots = [];
      break;

    default:
      console.warn('Unknown action:', message.action);
      sendResponse({ error: 'Unknown action' });
  }
});
