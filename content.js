// harrydbarnes/trainthemlater/TrainThemLater-main/content.js
let isRecording = false;
let audioSettingForNextStart = false; // This will store the preference
let overlayContainer;

function initOverlay() {
    if (document.getElementById('ttlOverlayContainer')) {
        overlayContainer = document.getElementById('ttlOverlayContainer');
    } else {
        overlayContainer = document.createElement('div');
        overlayContainer.id = 'ttlOverlayContainer';
        if (document.body) {
            document.body.appendChild(overlayContainer);
        } else {
            window.addEventListener('DOMContentLoaded', () => document.body.appendChild(overlayContainer));
            return; 
        }
    }
    
    overlayContainer.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
      display: none; background-color: rgba(0, 0, 0, 0.7); padding: 12px 15px;
      border-radius: 12px; box-shadow: 0px 4px 15px rgba(0,0,0,0.3); font-family: Arial, sans-serif;
    `;

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
    startButton.onmouseover = () => { startButton.style.backgroundColor = '#218838'; startButton.style.transform = 'scale(1.03)'; };
    startButton.onmouseout = () => { startButton.style.backgroundColor = '#28a745'; startButton.style.transform = 'scale(1)'; };

    stopButton.style.cssText = commonButtonStyle + `background-color: #dc3545;`;
    stopButton.onmouseover = () => { stopButton.style.backgroundColor = '#c82333'; stopButton.style.transform = 'scale(1.03)'; };
    stopButton.onmouseout = () => { stopButton.style.backgroundColor = '#dc3545'; stopButton.style.transform = 'scale(1)'; };

    startButton.removeEventListener('click', handleStartClick);
    startButton.addEventListener('click', handleStartClick);
    stopButton.removeEventListener('click', handleStopClick);
    stopButton.addEventListener('click', handleStopClick);
    
    updateOverlayButtons(isRecording);
}

function handleStartClick() {
    console.log("Content.js: Overlay Start Button clicked. Audio pref for this start:", audioSettingForNextStart);
    chrome.runtime.sendMessage({ action: 'startRecording', recordAudio: audioSettingForNextStart }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Content.js: Error from 'startRecording' message to background:", chrome.runtime.lastError.message);
            updateOverlayButtons(false); 
        } else if (response && response.success) {
            console.log("Content.js: 'startRecording' message acknowledged by background. Waiting for 'recordingActuallyStarted'.");
        } else {
            console.error("Content.js: Failed to start recording (background response):", response ? response.error : "No response or error");
            updateOverlayButtons(false); 
        }
        // audioSettingForNextStart is typically reset by popup logic when it triggers this.
        // If start is initiated purely by overlay, ensure it's reset or managed appropriately.
        // For now, we assume popup sets it before overlay interaction.
    });
}

function handleStopClick() {
    console.log("Content.js: Overlay Stop Button clicked.");
    chrome.runtime.sendMessage({ action: 'stopRecording' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Content.js: Error from 'stopRecording' message:", chrome.runtime.lastError.message);
        } else if (response && response.success) {
            console.log("Content.js: 'stopRecording' message acknowledged by background.");
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
    console.log(`Content.js: Overlay buttons updated. isRecording is now: ${isRec}`);
}

if (document.body) {
    initOverlay();
} else {
    document.addEventListener("DOMContentLoaded", initOverlay);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let responded = false;
  const ensureResponse = (responseValue) => {
    if (!responded) {
      try { sendResponse(responseValue); } catch (e) { console.warn("Content.js: sendResponse failed for action '"+message.action+"':", e.message); }
      responded = true;
    }
  };

  console.log("Content.js: Received message:", message.action);
  switch (message.action) {
    case 'showOverlayButtons':
      if (!overlayContainer && document.body) initOverlay(); 
      if (overlayContainer) overlayContainer.style.display = 'block';
        
      chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
        if (chrome.runtime.lastError) { ensureResponse({success: false, error: chrome.runtime.lastError.message}); return; }
        if (response) { isRecording = !!response.isRecording; updateOverlayButtons(isRecording); }
        ensureResponse({success: true});
      });
      return true; 

    case 'hideOverlayButtons':
      if (overlayContainer) overlayContainer.style.display = 'none';
      ensureResponse({success: true});
      return false; 

    case 'setAudioPreference': // New case to handle audio preference from popup
      audioSettingForNextStart = message.recordAudio;
      console.log("Content.js: Audio preference set to", audioSettingForNextStart);
      ensureResponse({success: true});
      return false; // Sync

    case 'recordingActuallyStarted':
      console.log("Content.js: 'recordingActuallyStarted' received from background.");
      isRecording = true;
      updateOverlayButtons(true);
      ensureResponse({success: true});
      return false; 

    case 'recordingActuallyStopped':
      console.log("Content.js: 'recordingActuallyStopped' received from background.");
      isRecording = false;
      updateOverlayButtons(false);
      ensureResponse({success: true});
      return false; 

    case 'recordingStateChanged':
      isRecording = message.newIsRecordingState;
      updateOverlayButtons(isRecording);
      ensureResponse({success: true});
      return false; 

    case 'triggerStartRecording': // This is called by popup.js
      const startBtn = document.getElementById('ttlOverlayStartButton');
      if (!isRecording && startBtn) {
        audioSettingForNextStart = message.recordAudio; // Set audio pref from popup
        console.log("Content.js: Triggering overlay start button click. Audio pref:", audioSettingForNextStart);
        startBtn.click(); // This will call handleStartClick which uses audioSettingForNextStart
      } else {
        console.warn("Content.js: triggerStartRecording received but already recording or no start button.");
      }
      ensureResponse({success: true});
      return false; 

    case 'triggerStopRecording': // This is called by popup.js
      const stopBtn = document.getElementById('ttlOverlayStopButton');
      if (isRecording && stopBtn) {
        console.log("Content.js: Triggering overlay stop button click.");
        stopBtn.click();
      } else {
         console.warn("Content.js: triggerStopRecording received but not recording or no stop button.");
      }
      ensureResponse({success: true});
      return false; 

    default:
      console.log("Content.js: Unknown action received:", message.action);
      ensureResponse({error: "Unknown action in content.js"});
      return false;
  }
});

// Initial query for recording state
chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
  if (chrome.runtime.lastError) { return; }
  if (response) {
    isRecording = !!response.isRecording;
    if (overlayContainer && overlayContainer.style.display === 'block') {
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

console.log("TrainThemLater content script loaded.");
