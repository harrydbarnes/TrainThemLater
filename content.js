let isRecording = false;
let screenshots = [];

// Create overlay buttons
const startButton = document.createElement('button');
startButton.id = 'ttlOverlayStartButton';
startButton.textContent = 'Start Recording';
document.body.appendChild(startButton);

const stopButton = document.createElement('button');
stopButton.id = 'ttlOverlayStopButton';
stopButton.textContent = 'Stop Recording';
document.body.appendChild(stopButton);

// Style buttons
const commonButtonStyle = `
  position: fixed;
  bottom: 20px;
  z-index: 9999;
  padding: 10px;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
`;

startButton.style.cssText = commonButtonStyle + `
  right: 150px; /* Position adjusted to avoid overlap */
  background-color: #007bff;
`;

stopButton.style.cssText = commonButtonStyle + `
  right: 20px;
  background-color: #dc3545; /* Red color for stop button */
`;


// Initial button state
startButton.style.display = 'block';
stopButton.style.display = 'none';

// Event Handlers
startButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'startRecording' });
  isRecording = true; // Update local state
  startButton.style.display = 'none';
  stopButton.style.display = 'block';
});

stopButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopRecording' });
  isRecording = false; // Update local state
  stopButton.style.display = 'none';
  startButton.style.display = 'block';
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startRecording') {
    isRecording = true;
    screenshots = [];
    startButton.style.display = 'none';
    stopButton.style.display = 'block';
  } else if (message.action === 'stopRecording') { // This case might become redundant if recordingStateChanged is reliable
    isRecording = false;
    startButton.style.display = 'block';
    stopButton.style.display = 'none';
    // No need to send generatePDF from here, background.js handles it
  } else if (message.action === 'updateButtonState') { // For initial state sync from popup (less critical now)
    console.warn('content.js received deprecated updateButtonState message. State should be managed by recordingStateChanged.');
    if (message.isRecording) {
      isRecording = true;
      startButton.style.display = 'none';
      stopButton.style.display = 'block';
    } else {
      isRecording = false;
      startButton.style.display = 'block';
      stopButton.style.display = 'none';
    }
  } else if (message.action === 'recordingStateChanged') {
    console.log('content.js received recordingStateChanged:', message.newIsRecordingState);
    isRecording = message.newIsRecordingState;
    
    // Using the globally defined startButton and stopButton constants
    if (startButton && stopButton) {
        if (isRecording) {
            startButton.style.display = 'none';
            stopButton.style.display = 'block';
        } else {
            startButton.style.display = 'block';
            stopButton.style.display = 'none';
        }
    } else {
        console.warn('Overlay buttons not found in content.js when trying to update for recordingStateChanged.');
    }
    // No sendResponse needed for this type of notification
  }
});

// Query initial recording state
chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
  if (chrome.runtime.lastError) {
    console.error("Error querying initial recording state:", chrome.runtime.lastError.message);
    // Default to not recording if state cannot be fetched
    isRecording = false;
    if (startButton && stopButton) { // Check if buttons exist
        startButton.style.display = 'block';
        stopButton.style.display = 'none';
    }
  } else if (response && response.isRecording !== undefined) {
    isRecording = response.isRecording;
    if (startButton && stopButton) { // Check if buttons exist
        if (isRecording) {
          startButton.style.display = 'none';
          stopButton.style.display = 'block';
        } else {
          startButton.style.display = 'block';
          stopButton.style.display = 'none';
        }
    }
  } else {
    // Fallback if response is not as expected
    console.warn("Unexpected response or no response from getRecordingState.");
    isRecording = false;
    if (startButton && stopButton) { // Check if buttons exist
        startButton.style.display = 'block';
        stopButton.style.display = 'none';
    }
  }
});

document.addEventListener('click', (event) => {
  // Ensure the click is not on our overlay buttons
  if (event.target.id === 'ttlOverlayStartButton' || event.target.id === 'ttlOverlayStopButton') {
    return;
  }

  if (isRecording) {
    const clickX = event.clientX;
    const clickY = event.clientY;

    chrome.runtime.sendMessage({ action: 'captureScreenshot', clickX, clickY }, (response) => {
      if (chrome.runtime.lastError) {
        // Handle error, e.g., if the background script is not ready
        console.error("Error capturing screenshot:", chrome.runtime.lastError.message);
        return;
      }
      if (response) {
        screenshots.push(response);
      }
    });
  }
});
