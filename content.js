let isRecording = false; // Local state for UI, actual state in background.js
let audioSettingForNextStart = false; // To store audio preference from popup

const overlayContainer = document.createElement('div');
overlayContainer.id = 'ttlOverlayContainer';
overlayContainer.style.cssText = `
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 2147483647; /* Max z-index */
  display: none; /* Initially hidden */
  background-color: rgba(0, 0, 0, 0.7);
  padding: 12px 15px;
  border-radius: 12px;
  box-shadow: 0px 4px 15px rgba(0,0,0,0.3);
  font-family: Arial, sans-serif;
`;
document.body.appendChild(overlayContainer);

const startButton = document.createElement('button');
startButton.id = 'ttlOverlayStartButton';
startButton.textContent = 'Start Record'; // Consistent naming
overlayContainer.appendChild(startButton);

const stopButton = document.createElement('button');
stopButton.id = 'ttlOverlayStopButton';
stopButton.textContent = 'Stop Record'; // Consistent naming
overlayContainer.appendChild(stopButton);

const commonButtonStyle = `
  padding: 10px 18px;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  margin: 0 8px; /* Spacing between buttons */
  font-size: 15px;
  font-weight: bold;
  transition: background-color 0.2s ease-in-out, transform 0.1s ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
`;

startButton.style.cssText = commonButtonStyle + `
  background-color: #28a745; /* Green for start */
`;
startButton.onmouseover = () => { startButton.style.backgroundColor = '#218838'; startButton.style.transform = 'scale(1.03)';};
startButton.onmouseout = () => { startButton.style.backgroundColor = '#28a745'; startButton.style.transform = 'scale(1)';};
startButton.onmousedown = () => startButton.style.transform = 'scale(0.98)';
startButton.onmouseup = () => startButton.style.transform = 'scale(1.03)';


stopButton.style.cssText = commonButtonStyle + `
  background-color: #dc3545; /* Red for stop */
`;
stopButton.onmouseover = () => { stopButton.style.backgroundColor = '#c82333'; stopButton.style.transform = 'scale(1.03)';};
stopButton.onmouseout = () => { stopButton.style.backgroundColor = '#dc3545'; stopButton.style.transform = 'scale(1)';};
stopButton.onmousedown = () => stopButton.style.transform = 'scale(0.98)';
stopButton.onmouseup = () => stopButton.style.transform = 'scale(1.03)';

function updateOverlayButtons(isRec) {
    startButton.style.display = isRec ? 'none' : 'inline-block';
    stopButton.style.display = isRec ? 'inline-block' : 'none';
}
updateOverlayButtons(false);

startButton.addEventListener('click', () => {
  // Use audioSettingForNextStart. It's set if triggered by popup,
  // or defaults to false if overlay button clicked directly.
  chrome.runtime.sendMessage({ action: 'startRecording', recordAudio: audioSettingForNextStart }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error from startRecording in background:", chrome.runtime.lastError.message);
      audioSettingForNextStart = false; // Reset on error
      return;
    }
    // isRecording state and button UI will be updated by 'recordingActuallyStarted'
    if (response && !response.success) {
        console.error("Failed to start recording:", response.error || "No specific error from background");
    }
    audioSettingForNextStart = false; // Reset after use
  });
});

stopButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopRecording' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error from stopRecording in background:", chrome.runtime.lastError.message);
      return;
    }
    if (response && response.success) {
      // isRecording state and button UI will be updated by 'recordingActuallyStopped' or 'recordingStateChanged'
      overlayContainer.style.display = 'none'; // Hide overlay after stopping
    } else {
      console.error("Failed to stop recording via background:", response ? response.error : "No specific error");
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content script received message:", message.action);
  switch (message.action) {
    case 'showOverlayButtons':
      overlayContainer.style.display = 'block';
      chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
        if (response && response.isRecording !== undefined) {
          isRecording = response.isRecording;
          updateOverlayButtons(isRecording);
        }
      });
      sendResponse({success: true});
      break;
    case 'hideOverlayButtons':
      overlayContainer.style.display = 'none';
      sendResponse({success: true});
      break;
    case 'recordingActuallyStarted':
      isRecording = true;
      updateOverlayButtons(true);
      sendResponse({success: true, message: "content.js noted recording started"});
      break;
    case 'recordingActuallyStopped':
      isRecording = false;
      updateOverlayButtons(false);
      // overlayContainer.style.display = 'none'; // Optionally hide overlay here too
      sendResponse({success: true, message: "content.js noted recording stopped"});
      break;
    case 'recordingStateChanged': // This might be redundant if the above two are handled
      isRecording = message.newIsRecordingState;
      updateOverlayButtons(isRecording);
      sendResponse({success: true});
      break;
    case 'triggerStartRecording':
      if (!isRecording) {
        audioSettingForNextStart = message.recordAudio;
        startButton.click();
      }
      sendResponse({success: true});
      break;
    case 'triggerStopRecording':
      if (isRecording) {
        stopButton.click();
      }
      sendResponse({success: true});
      break;
    default:
      // console.log("Content script received unhandled message:", message.action);
      break; // No sendResponse for unhandled actions
  }
  // If any path uses sendResponse asynchronously in the future, return true.
  // For now, if all sendResponse calls are synchronous within their blocks, it's not strictly necessary.
  // However, to be safe with multiple async-looking message handlers:
  return true;
});

// Initial query for recording state
chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
  if (response && response.isRecording !== undefined) {
    isRecording = response.isRecording;
    updateOverlayButtons(isRecording);
  }
});

document.addEventListener('click', (event) => {
  if (overlayContainer.contains(event.target)) {
    return; // Ignore clicks on the overlay itself
  }

  if (isRecording) {
    console.log("Content.js: Page clicked while recording. Capturing screenshot.");
    const clickX = event.clientX;
    const clickY = event.clientY;

    chrome.runtime.sendMessage({ action: 'captureScreenshot', clickX, clickY }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error sending captureScreenshot message:", chrome.runtime.lastError.message);
        return;
      }
      if (response && response.success) {
        // console.log("Screenshot capture acknowledged by background:", response.dataUrl);
      } else {
        console.error("Failed to capture screenshot:", response ? response.error : "No response");
      }
    });
  }
});
