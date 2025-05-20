let isRecording = false;
let audioSettingForNextStart = false;

const overlayContainer = document.createElement('div');
overlayContainer.id = 'ttlOverlayContainer';
overlayContainer.style.cssText = `
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 2147483647; /* Max z-index */
  display: none;
  background-color: rgba(0, 0, 0, 0.7);
  padding: 12px 15px;
  border-radius: 12px;
  box-shadow: 0px 4px 15px rgba(0,0,0,0.3);
  font-family: Arial, sans-serif;
`;
try {
  document.body.appendChild(overlayContainer);
} catch (e) {
  console.warn("TrainThemLater: Could not append overlay to document.body. This might be a non-HTML page or a page with strict security policies.", e);
}


const startButton = document.createElement('button');
startButton.id = 'ttlOverlayStartButton';
startButton.textContent = 'Start Record';
overlayContainer.appendChild(startButton);

const stopButton = document.createElement('button');
stopButton.id = 'ttlOverlayStopButton';
stopButton.textContent = 'Stop Record';
overlayContainer.appendChild(stopButton);

const commonButtonStyle = `
  padding: 10px 18px;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  margin: 0 8px;
  font-size: 15px;
  font-weight: bold;
  transition: background-color 0.2s ease-in-out, transform 0.1s ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
`;

startButton.style.cssText = commonButtonStyle + `background-color: #28a745;`;
startButton.onmouseover = () => { startButton.style.backgroundColor = '#218838'; startButton.style.transform = 'scale(1.03)';};
startButton.onmouseout = () => { startButton.style.backgroundColor = '#28a745'; startButton.style.transform = 'scale(1)';};
startButton.onmousedown = () => startButton.style.transform = 'scale(0.98)';
startButton.onmouseup = () => startButton.style.transform = 'scale(1.03)';

stopButton.style.cssText = commonButtonStyle + `background-color: #dc3545;`;
stopButton.onmouseover = () => { stopButton.style.backgroundColor = '#c82333'; stopButton.style.transform = 'scale(1.03)';};
stopButton.onmouseout = () => { stopButton.style.backgroundColor = '#dc3545'; stopButton.style.transform = 'scale(1)';};
stopButton.onmousedown = () => stopButton.style.transform = 'scale(0.98)';
stopButton.onmouseup = () => stopButton.style.transform = 'scale(1.03)';

function updateOverlayButtons(isRec) {
    startButton.style.display = isRec ? 'none' : 'inline-block';
    stopButton.style.display = isRec ? 'inline-block' : 'none';
    console.log("Content.js: Overlay buttons updated. isRecording:", isRec);
}
updateOverlayButtons(false);

startButton.addEventListener('click', () => {
  console.log("Content.js: Overlay Start Button clicked. Audio pref:", audioSettingForNextStart);
  chrome.runtime.sendMessage({ action: 'startRecording', recordAudio: audioSettingForNextStart }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Content.js: Error response from startRecording message:", chrome.runtime.lastError.message);
      audioSettingForNextStart = false;
      return;
    }
    if (response && response.success) {
      console.log("Content.js: startRecording message acknowledged by background.");
      // isRecording and UI will be updated by 'recordingActuallyStarted'
    } else {
      console.error("Content.js: Failed to start recording (background response):", response ? response.error : "No specific error");
    }
    audioSettingForNextStart = false;
  });
});

stopButton.addEventListener('click', () => {
  console.log("Content.js: Overlay Stop Button clicked.");
  chrome.runtime.sendMessage({ action: 'stopRecording' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Content.js: Error response from stopRecording message:", chrome.runtime.lastError.message);
      return;
    }
    if (response && response.success) {
      console.log("Content.js: stopRecording message acknowledged by background.");
      overlayContainer.style.display = 'none';
    } else {
      console.error("Content.js: Failed to stop recording (background response):", response ? response.error : "No specific error");
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content.js: Received message:", message.action, message);
  switch (message.action) {
    case 'showOverlayButtons':
      overlayContainer.style.display = 'block';
      chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Content.js: Error getting recording state for showOverlay:", chrome.runtime.lastError.message);
            return;
        }
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
      console.log("Content.js: recordingActuallyStarted received.");
      isRecording = true;
      updateOverlayButtons(true);
      sendResponse({success: true});
      break;
    case 'recordingActuallyStopped':
      console.log("Content.js: recordingActuallyStopped received.");
      isRecording = false;
      updateOverlayButtons(false);
      sendResponse({success: true});
      break;
    case 'recordingStateChanged':
      console.log("Content.js: recordingStateChanged received, new state:", message.newIsRecordingState);
      isRecording = message.newIsRecordingState;
      updateOverlayButtons(isRecording);
      sendResponse({success: true});
      break;
    case 'triggerStartRecording':
      console.log("Content.js: triggerStartRecording received from popup. Audio pref:", message.recordAudio);
      if (!isRecording) {
        audioSettingForNextStart = message.recordAudio;
        startButton.click();
      }
      sendResponse({success: true});
      break;
    case 'triggerStopRecording':
      console.log("Content.js: triggerStopRecording received from popup.");
      if (isRecording) {
        stopButton.click();
      }
      sendResponse({success: true});
      break;
    default:
      sendResponse({error: "Unknown action for content script"}); // Send a response for unhandled actions
      return false; // Indicate not handled by this listener if we want to allow others
  }
  return true; // Keep true for async sendResponse cases.
});

// Initial query for recording state
console.log("Content.js: Initializing and querying recording state.");
chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
  if (chrome.runtime.lastError) {
    console.error("Content.js: Error on initial getRecordingState:", chrome.runtime.lastError.message);
    return;
  }
  if (response && response.isRecording !== undefined) {
    console.log("Content.js: Initial recording state from background:", response.isRecording);
    isRecording = response.isRecording;
    // Do not call updateOverlayButtons here if overlay is meant to be initially hidden.
    // It will be updated when 'showOverlayButtons' is called.
  }
});

document.addEventListener('click', (event) => {
  if (overlayContainer.contains(event.target)) {
    return;
  }
  if (isRecording) {
    console.log("Content.js: Page clicked while recording. Capturing screenshot.");
    const clickX = event.clientX;
    const clickY = event.clientY;
    chrome.runtime.sendMessage({ action: 'captureScreenshot', clickX, clickY }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Content.js: Error sending captureScreenshot message:", chrome.runtime.lastError.message);
        return;
      }
      // Optional: Handle response if needed, e.g., confirmation or error from background
    });
  }
});

console.log("TrainThemLater content script loaded and running.");
