// Listen for messages from the popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received in background.js:', message);

  // Handle different actions
  switch (message.action) {
    case 'startRecording':
      // Initialize recording state and clear previous screenshots
      chrome.storage.local.set({ isRecording: true, screenshots: [] }, () => {
        console.log('Recording started. State updated.');
        sendResponse({ success: true });
      });
      return true; // Indicates async response

    case 'captureScreenshot':
      // Capture a screenshot of the visible tab
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error('Error capturing screenshot:', chrome.runtime.lastError);
          sendResponse({ error: 'Failed to capture screenshot' });
        } else {
          console.log('Screenshot captured:', dataUrl);
          // Add the screenshot and click coordinates to storage
          chrome.storage.local.get(['screenshots'], (result) => {
            const screenshots = result.screenshots || [];
            screenshots.push({
              dataUrl: dataUrl,
              clickX: message.clickX,
              clickY: message.clickY,
            });
            chrome.storage.local.set({ screenshots }, () => {
              sendResponse({ dataUrl, clickX: message.clickX, clickY: message.clickY });
            });
          });
        }
      });
      return true; // Indicates async response

    case 'stopRecording':
      // Stop recording and send screenshots to the popup
      chrome.storage.local.get(['screenshots'], (result) => {
        const screenshots = result.screenshots || [];
        console.log('Recording stopped. Sending screenshots to popup:', screenshots);
        sendResponse({ screenshots });
        // Reset recording state
        chrome.storage.local.set({ isRecording: false, screenshots: [] });
      });
      return true; // Indicates async response

    case 'getRecordingState':
      // Get the current recording state
      chrome.storage.local.get(['isRecording'], (result) => {
        sendResponse({ isRecording: result.isRecording || false });
      });
      return true; // Indicates async response

    default:
      console.warn('Unknown action:', message.action);
      sendResponse({ error: 'Unknown action' });
  }
});
