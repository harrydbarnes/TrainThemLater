// harrydbarnes/trainthemlater/TrainThemLater-main/content.js
let isRecording = false;
let audioSettingForNextStart = false;
let overlayContainer;

function initOverlay() {
    if (document.getElementById('ttlOverlayContainer')) {
        overlayContainer = document.getElementById('ttlOverlayContainer');
    } else {
        overlayContainer = document.createElement('div');
        overlayContainer.id = 'ttlOverlayContainer';
        if (document.body) { // Ensure body is available
            document.body.appendChild(overlayContainer);
        } else { // Fallback if body isn't ready (e.g. on very early script injection)
            window.addEventListener('DOMContentLoaded', () => document.body.appendChild(overlayContainer));
        }
    }
    
    overlayContainer.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
      display: none; background-color: rgba(0, 0, 0, 0.7); padding: 12px 15px;
      border-radius: 12px; box-shadow: 0px 4px 15px rgba(0,0,0,0.3); font-family: Arial, sans-serif;
    `;

    // Ensure buttons are (re)created or obtained correctly
    let startButton = document.getElementById('ttlOverlayStartButton');
    if (!startButton) {
        startButton = document.createElement('button');
        startButton.id = 'ttlOverlayStartButton';
        overlayContainer.appendChild(startButton);
    }
    startButton.textContent = 'Start Record';

    let stopButton = document.getElementById('ttlOverlayStopButton');
    if (!stopButton) {
        stopButton = document.createElement('button');
        stopButton.id = 'ttlOverlayStopButton';
        overlayContainer.appendChild(stopButton);
    }
    stopButton.textContent = 'Stop Record';
    
    const commonButtonStyle = `
      padding: 10px 18px; color: white; border: none; border-radius: 8px;
      cursor: pointer; margin: 0 8px; font-size: 15px; font-weight: bold;
      transition: background-color 0.2s ease-in-out, transform 0.1s ease;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    `;
    startButton.style.cssText = commonButtonStyle + `background-color: #28a745;`;
    // (Add hover/active styles as before if desired)
     startButton.onmouseover = () => { startButton.style.backgroundColor = '#218838'; startButton.style.transform = 'scale(1.03)';};
    startButton.onmouseout = () => { startButton.style.backgroundColor = '#28a745'; startButton.style.transform = 'scale(1)';};

    stopButton.style.cssText = commonButtonStyle + `background-color: #dc3545;`;
    // (Add hover/active styles as before if desired)
    stopButton.onmouseover = () => { stopButton.style.backgroundColor = '#c82333'; stopButton.style.transform = 'scale(1.03)';};
    stopButton.onmouseout = () => { stopButton.style.backgroundColor = '#dc3545'; stopButton.style.transform = 'scale(1)';};


    startButton.removeEventListener('click', handleStartClick);
    startButton.addEventListener('click', handleStartClick);
    stopButton.removeEventListener('click', handleStopClick);
    stopButton.addEventListener('click', handleStopClick);
    
    updateOverlayButtons(isRecording);
}

function handleStartClick() {
    console.log("Content.js: Overlay Start Button clicked. Audio pref:", audioSettingForNextStart);
    chrome.runtime.sendMessage({ action: 'startRecording', recordAudio: audioSettingForNextStart }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Content.js: Error from startRecording message to background:", chrome.runtime.lastError.message);
            // Potentially update UI to show error, or allow retry
        } else if (response && response.success) {
            console.log("Content.js: startRecording message acknowledged by background.");
            // UI update (button text change) will be handled by 'recordingActuallyStarted' listener
        } else {
            console.error("Content.js: Failed to start recording (background response):", response ? response.error : "No response or error");
            // Update UI to reflect failure if needed
            updateOverlayButtons(false); // Ensure it's back to "Start"
        }
        audioSettingForNextStart = false; // Reset after attempt
    });
}

function handleStopClick() {
    console.log("Content.js: Overlay Stop Button clicked.");
    chrome.runtime.sendMessage({ action: 'stopRecording' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Content.js: Error from stopRecording message:", chrome.runtime.lastError.message);
        } else if (response && response.success) {
            console.log("Content.js: stopRecording message acknowledged by background.");
            if (overlayContainer) overlayContainer.style.display = 'none';
        } else {
            console.error("Content.js: Failed to stop recording (background response):", response ? response.error : "No error message");
        }
    });
}

function updateOverlayButtons(isRec) {
    const startBtn = document.getElementById('ttlOverlayStartButton');
    const stopBtn = document.getElementById('ttlOverlayStopButton');
    if (startBtn) startBtn.style.display = isRec ? 'none' : 'inline-block';
    if (stopBtn) stopBtn.style.display = isRec ? 'inline-block' : 'none';
    console.log("Content.js: Overlay buttons updated. isRecording now:", isRec);
}

if (document.readyState === "complete" || document.readyState === "interactive") {
    initOverlay();
} else {
    document.addEventListener("DOMContentLoaded", initOverlay);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let responded = false;
  const ensureResponse = (responseValue) => {
    if (!responded) {
      try { sendResponse(responseValue); } catch (e) { console.warn("Content.js: sendResponse failed", e); }
      responded = true;
    }
  };

  console.log("Content.js: Received message:", message.action);
  switch (message.action) {
    case 'showOverlayButtons':
      if (overlayContainer) overlayContainer.style.display = 'block';
      else initOverlay(); // Ensure overlay exists if not already
      chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
        if (chrome.runtime.lastError) { ensureResponse({success: false, error: chrome.runtime.lastError.message}); return; }
        if (response) { isRecording = !!response.isRecording; updateOverlayButtons(isRecording); }
        ensureResponse({success: true});
      });
      return true;
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
      // if (overlayContainer) overlayContainer.style.display = 'none'; // Optionally hide here too
      ensureResponse({success: true});
      break;
    case 'recordingStateChanged': // Can be used by background to force UI update
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
      ensureResponse({error: "Unknown action in content.js"});
      return false; // Not handled by this listener
  }
  return true; // Indicate async response if any path uses it
});

// Initial query for recording state for robustness
chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
  if (chrome.runtime.lastError) { /* console.error("Content.js: Initial getRecordingState failed:", chrome.runtime.lastError.message); */ return; }
  if (response) {
    isRecording = !!response.isRecording;
    if (overlayContainer && overlayContainer.style.display === 'block') { // Update only if visible
        updateOverlayButtons(isRecording);
    }
  }
});

document.addEventListener('click', (event) => {
  if (overlayContainer && overlayContainer.contains(event.target)) return;
  if (isRecording) {
    const clickX = event.clientX; const clickY = event.clientY;
    chrome.runtime.sendMessage({ action: 'captureScreenshot', clickX, clickY }, (response) => {
      if (chrome.runtime.lastError) console.error("Content.js: Error sending captureScreenshot:", chrome.runtime.lastError.message);
    });
  }
});

console.log("TrainThemLater content script (vX.Y) loaded."); // Add a version if you iterate
