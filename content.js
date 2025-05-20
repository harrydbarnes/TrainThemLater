let isRecording = false; // Local state for UI, actual state in background.js
let screenshots = []; // This might be redundant here if all screenshot handling is in background/popup

const overlayContainer = document.createElement('div');
overlayContainer.id = 'ttlOverlayContainer';
overlayContainer.style.cssText = `
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 10000; /* Ensure it's on top */
  display: none; /* Initially hidden */
  background-color: rgba(0, 0, 0, 0.6); /* Semi-transparent background */
  padding: 10px;
  border-radius: 10px;
  box-shadow: 0px 0px 10px rgba(0,0,0,0.5);
`;
document.body.appendChild(overlayContainer);


const startButton = document.createElement('button');
startButton.id = 'ttlOverlayStartButton';
startButton.textContent = 'Start Recording';
overlayContainer.appendChild(startButton);

const stopButton = document.createElement('button');
stopButton.id = 'ttlOverlayStopButton';
stopButton.textContent = 'Stop Recording';
overlayContainer.appendChild(stopButton);

// Style buttons
const commonButtonStyle = `
  padding: 10px 15px;
  color: white;
  border: none;
  border-radius: 8px; /* More rounded */
  cursor: pointer;
  margin: 5px;
  font-size: 14px;
  transition: background-color 0.2s ease-in-out, opacity 0.2s ease-in-out;
  opacity: 0.9; /* Slightly transparent */
`;

startButton.style.cssText = commonButtonStyle + `
  background-color: #28a745; /* Green for start */
`;
startButton.onmouseover = () => startButton.style.opacity = '1';
startButton.onmouseout = () => startButton.style.opacity = '0.9';


stopButton.style.cssText = commonButtonStyle + `
  background-color: #dc3545; /* Red for stop */
`;
stopButton.onmouseover = () => stopButton.style.opacity = '1';
stopButton.onmouseout = () => stopButton.style.opacity = '0.9';


// Initial button state logic (will be controlled by messages)
function updateOverlayButtons(isRec) {
    startButton.style.display = isRec ? 'none' : 'inline-block';
    stopButton.style.display = isRec ? 'inline-block' : 'none';
}
updateOverlayButtons(false); // Default to not recording


// Event Handlers for overlay buttons
startButton.addEventListener('click', () => {
  // Tell background to start recording. Popup should reflect this change too.
  const recordAudioCheckbox = document.getElementById('recordAudioCheckbox'); // This needs to be in popup.html
  const shouldRecordAudio = recordAudioCheckbox ? recordAudioCheckbox.checked : false; // Safely check
  
  chrome.runtime.sendMessage({ action: 'startRecording', recordAudio: shouldRecordAudio }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error msg from startRecording in background:", chrome.runtime.lastError.message);
      // Potentially inform user via an alert or a status message in the overlay
      return;
    }
    if (response && response.success) {
      isRecording = true;
      updateOverlayButtons(isRecording);
    } else {
      console.error("Failed to start recording:", response ? response.error : "No response");
      // Handle error, e.g., alert user or update UI
    }
  });
});

stopButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopRecording' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error msg from stopRecording in background:", chrome.runtime.lastError.message);
      return;
    }
    if (response) { // response will be { screenshots, audioAvailable }
      isRecording = false;
      updateOverlayButtons(isRecording);
      // Send screenshots to popup for editing
      chrome.runtime.sendMessage({ action: 'showEditInterfaceMessage', data: response });
      overlayContainer.style.display = 'none'; // Hide overlay after stopping
    }
  });
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showOverlayButtons') {
    overlayContainer.style.display = 'block';
    // Query current recording state to set buttons correctly
    chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
      if (response && response.isRecording !== undefined) {
        isRecording = response.isRecording;
        updateOverlayButtons(isRecording);
      }
    });
  } else if (message.action === 'hideOverlayButtons') {
    overlayContainer.style.display = 'none';
  } else if (message.action === 'recordingStateChanged') {
    // This message comes from background.js when the recording state *actually* changes
    isRecording = message.newIsRecordingState;
    updateOverlayButtons(isRecording);
    if (!isRecording && overlayContainer.style.display === 'block') {
        // If recording stopped from popup, and overlay is visible,
        // it implies we should now fetch screenshots and show editor via popup.
        // However, the popup will initiate the fetch of screenshots after its own stop button.
        // Consider if content script needs to do anything else here.
        // For now, just update its local state.
    }
  } else if (message.action === 'triggerStartRecording') {
    // This message comes from popup.js if user clicks start in popup instead of overlay
    if (!isRecording) { // Prevent starting if already recording
        startButton.click(); // Simulate click on overlay's start button
    }
  } else if (message.action === 'triggerStopRecording') {
     // This message comes from popup.js if user clicks stop in popup instead of overlay
    if (isRecording) {
        stopButton.click(); // Simulate click on overlay's stop button
    }
  }
});


// Initial query for recording state to set buttons correctly if overlay is made visible later
// This is more of a safety check, as 'showOverlayButtons' will also query the state.
chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
  if (response && response.isRecording !== undefined) {
    isRecording = response.isRecording;
    updateOverlayButtons(isRecording); // Update buttons but container remains hidden initially
  }
});

document.addEventListener('click', (event) => {
  if (event.target.id === 'ttlOverlayStartButton' || event.target.id === 'ttlOverlayStopButton' || event.target.id === 'ttlOverlayContainer' || overlayContainer.contains(event.target)) {
    return; // Ignore clicks on the overlay itself
  }

  if (isRecording) {
    const clickX = event.clientX;
    const clickY = event.clientY;

    chrome.runtime.sendMessage({ action: 'captureScreenshot', clickX, clickY }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error capturing screenshot:", chrome.runtime.lastError.message);
        return;
      }
      // screenshot data is handled by background.js
    });
  }
});
