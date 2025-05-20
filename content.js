// harrydbarnes/trainthemlater/TrainThemLater-main/content.js
let isRecording = false;
let audioSettingForNextStart = false;
let overlayContainer; // Declare globally for potential removal later

function initOverlay() {
    if (document.getElementById('ttlOverlayContainer')) {
        overlayContainer = document.getElementById('ttlOverlayContainer');
        // Make sure buttons exist or are recreated if needed
        if (!document.getElementById('ttlOverlayStartButton')) {
             const startButton = document.createElement('button');
             startButton.id = 'ttlOverlayStartButton';
             overlayContainer.appendChild(startButton);
        }
        if (!document.getElementById('ttlOverlayStopButton')) {
            const stopButton = document.createElement('button');
            stopButton.id = 'ttlOverlayStopButton';
            overlayContainer.appendChild(stopButton);
        }
    } else {
        overlayContainer = document.createElement('div');
        overlayContainer.id = 'ttlOverlayContainer';
        document.body.appendChild(overlayContainer);

        const startButton = document.createElement('button');
        startButton.id = 'ttlOverlayStartButton';
        overlayContainer.appendChild(startButton);

        const stopButton = document.createElement('button');
        stopButton.id = 'ttlOverlayStopButton';
        overlayContainer.appendChild(stopButton);
    }
    
    overlayContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      display: none;
      background-color: rgba(0, 0, 0, 0.7);
      padding: 12px 15px;
      border-radius: 12px;
      box-shadow: 0px 4px 15px rgba(0,0,0,0.3);
      font-family: Arial, sans-serif;
    `;

    const startButton = document.getElementById('ttlOverlayStartButton');
    const stopButton = document.getElementById('ttlOverlayStopButton');
    
    startButton.textContent = 'Start Record';
    stopButton.textContent = 'Stop Record';

    const commonButtonStyle = `
      padding: 10px 18px; color: white; border: none; border-radius: 8px;
      cursor: pointer; margin: 0 8px; font-size: 15px; font-weight: bold;
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

    startButton.removeEventListener('click', handleStartClick); // Remove previous if any
    startButton.addEventListener('click', handleStartClick);

    stopButton.removeEventListener('click', handleStopClick); // Remove previous if any
    stopButton.addEventListener('click', handleStopClick);
    
    updateOverlayButtons(isRecording);
}

function handleStartClick() {
    console.log("Content.js: Overlay Start Button clicked. Audio pref:", audioSettingForNextStart);
    chrome.runtime.sendMessage({ action: 'startRecording', recordAudio: audioSettingForNextStart }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Content.js: Error response from startRecording message:", chrome.runtime.lastError.message);
        } else if (response && response.success) {
            console.log("Content.js: startRecording message acknowledged by background.");
        } else {
            console.error("Content.js: Failed to start recording (background response):", response ? response.error : "No specific error");
        }
        audioSettingForNextStart = false; // Reset after attempt
    });
}

function handleStopClick() {
    console.log("Content.js: Overlay Stop Button clicked.");
    chrome.runtime.sendMessage({ action: 'stopRecording' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Content.js: Error response from stopRecording message:", chrome.runtime.lastError.message);
        } else if (response && response.success) {
            console.log("Content.js: stopRecording message acknowledged by background.");
            if (overlayContainer) overlayContainer.style.display = 'none';
        } else {
            console.error("Content.js: Failed to stop recording (background response):", response ? response.error : "No specific error");
        }
    });
}

function updateOverlayButtons(isRec) {
    const startBtn = document.getElementById('ttlOverlayStartButton');
    const stopBtn = document.getElementById('ttlOverlayStopButton');
    if (startBtn) startBtn.style.display = isRec ? 'none' : 'inline-block';
    if (stopBtn) stopBtn.style.display = isRec ? 'inline-block' : 'none';
    console.log("Content.js: Overlay buttons updated. isRecording:", isRec);
}

if (document.body) { // Ensure body exists before trying to append/init
    initOverlay();
} else {
    window.addEventListener('DOMContentLoaded', initOverlay);
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content.js: Received message:", message.action, message);
  let responded = false; // Flag to ensure sendResponse is called once

  const ensureResponse = (response) => {
    if (!responded) {
      sendResponse(response);
      responded = true;
    }
  };

  switch (message.action) {
    case 'showOverlayButtons':
      if (overlayContainer) overlayContainer.style.display = 'block';
      chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Content.js: Error getting state for showOverlay:", chrome.runtime.lastError.message);
            ensureResponse({success: false, error: chrome.runtime.lastError.message});
            return;
        }
        if (response) {
          isRecording = !!response.isRecording; // Ensure boolean
          updateOverlayButtons(isRecording);
        }
        ensureResponse({success: true});
      });
      return true; // Indicate async response
    case 'hideOverlayButtons':
      if (overlayContainer) overlayContainer.style.display = 'none';
      ensureResponse({success: true});
      break;
    case 'recordingActuallyStarted':
      isRecording = true;
      updateOverlayButtons(true);
      ensureResponse({success: true});
      break;
    case 'recordingActuallyStopped':
      isRecording = false;
      updateOverlayButtons(false);
      ensureResponse({success: true});
      break;
    case 'recordingStateChanged':
      isRecording = message.newIsRecordingState;
      updateOverlayButtons(isRecording);
      ensureResponse({success: true});
      break;
    case 'triggerStartRecording':
      const startBtn = document.getElementById('ttlOverlayStartButton');
      if (!isRecording && startBtn) {
        audioSettingForNextStart = message.recordAudio;
        startBtn.click();
      }
      ensureResponse({success: true});
      break;
    case 'triggerStopRecording':
      const stopBtn = document.getElementById('ttlOverlayStopButton');
      if (isRecording && stopBtn) {
        stopBtn.click();
      }
      ensureResponse({success: true});
      break;
    default:
      ensureResponse({error: "Unknown action for content script"});
      return false; // Let other listeners try
  }
  return true; // Keep true if any path could be async.
});

// Initial query for recording state
chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
  if (chrome.runtime.lastError) {
    console.error("Content.js: Error on initial getRecordingState:", chrome.runtime.lastError.message);
    return;
  }
  if (response) {
    isRecording = !!response.isRecording;
    if (overlayContainer && overlayContainer.style.display === 'block') {
        updateOverlayButtons(isRecording);
    }
  }
});

document.addEventListener('click', (event) => {
  if (overlayContainer && overlayContainer.contains(event.target)) {
    return;
  }
  if (isRecording) {
    const clickX = event.clientX;
    const clickY = event.clientY;
    chrome.runtime.sendMessage({ action: 'captureScreenshot', clickX, clickY }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Content.js: Error sending captureScreenshot:", chrome.runtime.lastError.message);
      }
    });
  }
});

console.log("TrainThemLater content script loaded.");
