// harrydbarnes/trainthemlater/TrainThemLater-main/content.js
let isRecording = false;
let audioSettingForNextStart = false;
let pageUrlForNextStart = ''; 
let overlayContainer;
let startButton; 
let stopButton; 

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

    startButton = document.getElementById('ttlOverlayStartButton'); 
    if (!startButton) {
        startButton = document.createElement('button');
        startButton.id = 'ttlOverlayStartButton';
        overlayContainer.appendChild(startButton);
    }
    startButton.textContent = 'Start Record';

    stopButton = document.getElementById('ttlOverlayStopButton'); 
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
    
    updateOverlayButtonsUI(isRecording);
}

function handleStartClick() {
    if (isRecording || (startButton && startButton.disabled)) { 
        console.warn("Content.js: Start clicked, but already recording or start is in progress.");
        return;
    }
    if (startButton) {
        startButton.disabled = true;
        startButton.textContent = 'Starting...';
    }
    if (stopButton) {
        stopButton.style.display = 'none'; 
    }

    console.log("Content.js: Overlay Start Button clicked. Audio pref:", audioSettingForNextStart, "URL:", pageUrlForNextStart);
    chrome.runtime.sendMessage({ 
        action: 'startRecording', 
        recordAudio: audioSettingForNextStart,
        pageUrl: pageUrlForNextStart // Send the URL
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Content.js: Error sending 'startRecording' message to background:", chrome.runtime.lastError.message);
            if (startButton) {
                startButton.disabled = false;
                startButton.textContent = 'Start Record';
            }
        } else if (response && response.success) {
            console.log("Content.js: 'startRecording' message acknowledged by background. Waiting for 'recordingActuallyStarted'.");
        } else {
            console.error("Content.js: Failed to start recording (background response):", response ? response.error : "No response or error");
            if (startButton) {
                startButton.disabled = false;
                startButton.textContent = 'Start Record';
            }
        }
    });
}

function handleStopClick() {
    if (!isRecording || (stopButton && stopButton.disabled)) {
        console.warn("Content.js: Stop clicked, but not recording or stop is in progress.");
        return;
    }
    if (stopButton) {
        stopButton.disabled = true;
        stopButton.textContent = 'Stopping...';
    }
    console.log("Content.js: Overlay Stop Button clicked.");
    chrome.runtime.sendMessage({ action: 'stopRecording' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Content.js: Error sending 'stopRecording' message:", chrome.runtime.lastError.message);
            if (stopButton) { 
                stopButton.disabled = false;
                stopButton.textContent = 'Stop Record';
            }
        } else if (response && response.success) {
            console.log("Content.js: 'stopRecording' message acknowledged by background.");
        } else {
            console.error("Content.js: Failed to stop recording (background response):", response ? response.error : "No error message");
            if (stopButton) { 
                stopButton.disabled = false;
                stopButton.textContent = 'Stop Record';
            }
        }
    });
}

function updateOverlayButtonsUI(isRec) {
    if (startButton) {
        startButton.style.display = isRec ? 'none' : 'inline-block';
        startButton.disabled = false; 
        startButton.textContent = 'Start Record'; 
    }
    if (stopButton) {
        stopButton.style.display = isRec ? 'inline-block' : 'none';
        stopButton.disabled = false; 
        stopButton.textContent = 'Stop Record'; 
    }
    console.log(`Content.js: Overlay buttons UI updated. isRecording visual state is now: ${isRec}`);
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
        if (chrome.runtime.lastError) { 
            isRecording = false; 
            console.warn("Content.js: Error getting recording state on showOverlayButtons:", chrome.runtime.lastError.message);
            updateOverlayButtonsUI(isRecording); 
            ensureResponse({success: false, error: chrome.runtime.lastError.message}); 
            return;
        } 
        if (response) { 
            isRecording = !!response.isRecording; 
        } else {
            isRecording = false; 
        }
        updateOverlayButtonsUI(isRecording);
        ensureResponse({success: true});
      });
      return true; 

    case 'hideOverlayButtons':
      if (overlayContainer) overlayContainer.style.display = 'none';
      ensureResponse({success: true});
      return false; 

    case 'setAudioAndUrlPreference': 
      audioSettingForNextStart = message.recordAudio;
      pageUrlForNextStart = message.pageUrl; 
      console.log("Content.js: Audio preference set to", audioSettingForNextStart, "URL set to", pageUrlForNextStart);
      ensureResponse({success: true});
      return false; 

    case 'recordingActuallyStarted':
      console.log("Content.js: 'recordingActuallyStarted' received from background.");
      isRecording = true;
      updateOverlayButtonsUI(true);
      ensureResponse({success: true});
      return false; 

    case 'recordingActuallyStopped':
      console.log("Content.js: 'recordingActuallyStopped' received from background.");
      isRecording = false;
      updateOverlayButtonsUI(false);
      if (overlayContainer) overlayContainer.style.display = 'none'; 
      ensureResponse({success: true});
      return false; 

    case 'recordingStateChanged': 
      isRecording = message.newIsRecordingState;
      updateOverlayButtonsUI(isRecording);
      ensureResponse({success: true});
      return false; 

    case 'triggerStartRecording': 
      if (!isRecording && startButton && !startButton.disabled) { 
        audioSettingForNextStart = message.recordAudio; 
        pageUrlForNextStart = message.pageUrl; 
        console.log("Content.js: Triggering overlay start button click. Audio pref:", audioSettingForNextStart, "URL:", pageUrlForNextStart);
        startButton.click(); 
      } else {
        console.warn("Content.js: triggerStartRecording received but already recording, no start button, or start already in progress.");
      }
      ensureResponse({success: true});
      return false; 

    case 'triggerStopRecording': 
      if (isRecording && stopButton && !stopButton.disabled) { 
        console.log("Content.js: Triggering overlay stop button click.");
        stopButton.click();
      } else {
         console.warn("Content.js: triggerStopRecording received but not recording, no stop button, or stop already in progress.");
      }
      ensureResponse({success: true});
      return false; 

    default:
      console.log("Content.js: Unknown action received:", message.action);
      ensureResponse({error: "Unknown action in content.js"});
      return false;
  }
});

chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
  if (chrome.runtime.lastError) { return; }
  if (response) {
    isRecording = !!response.isRecording;
    if (!overlayContainer && document.body) {
        initOverlay(); 
    } else if (overlayContainer && overlayContainer.style.display === 'block') {
        updateOverlayButtonsUI(isRecording);
    } else if (overlayContainer) { 
        updateOverlayButtonsUI(isRecording);
    }
  }
});

document.addEventListener('click', (event) => {
  if (overlayContainer && overlayContainer.contains(event.target)) return;
  // Temporarily hide overlay before sending screenshot message
  let overlayWasVisible = false;
  if (overlayContainer && overlayContainer.style.display !== 'none') {
      overlayWasVisible = true;
      overlayContainer.style.display = 'none';
  }

  if (isRecording) {
    const clickX = event.clientX; const clickY = event.clientY;
    // Use a very short timeout to allow the DOM to update (overlay to hide)
    setTimeout(() => {
        chrome.runtime.sendMessage({ action: 'captureScreenshot', clickX, clickY }, (response) => {
            if (chrome.runtime.lastError) console.error("Content.js: Error sending captureScreenshot:", chrome.runtime.lastError.message);
            // Restore overlay visibility after screenshot attempt
            if (overlayWasVisible && overlayContainer) {
                overlayContainer.style.display = 'block';
            }
        });
    }, 50); // 50ms delay, adjust if needed
  } else {
      // If not recording, restore overlay visibility immediately if it was hidden
      if (overlayWasVisible && overlayContainer) {
          overlayContainer.style.display = 'block';
      }
  }
});

console.log("TrainThemLater content script loaded.");
