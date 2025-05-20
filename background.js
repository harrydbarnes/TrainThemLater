let audioStream = null;
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null;
let isActuallyRecording = false; // More reliable internal state

const RECORDING_ICON_PATH = {
  "16": "icons/icon16_rec.png",
  // Add other sizes if you have them, e.g., "48": "icons/icon48_rec.png"
};
const DEFAULT_ICON_PATH = {
  "16": "icons/icon16.png",
  // "48": "icons/icon48.png"
};

function updateActionIcon(recording) {
  const path = recording ? RECORDING_ICON_PATH : DEFAULT_ICON_PATH;
  chrome.action.setIcon({ path: path }, () => {
    if (chrome.runtime.lastError) {
      console.warn("Error setting action icon:", chrome.runtime.lastError.message);
    } else {
      console.log("Action icon updated to:", path);
    }
  });
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received in background.js:', message.action);

  switch (message.action) {
    case 'startRecording':
      const recordAudio = message.recordAudio;
      isActuallyRecording = true;
      updateActionIcon(true);
      chrome.storage.local.set({ screenshots: [] }, () => { // Clear previous screenshots
        console.log('Recording starting...');
        // Notify popup that recording *actually* started
        chrome.runtime.sendMessage({ action: 'recordingActuallyStarted' });

        if (recordAudio) {
          chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
            if (chrome.runtime.lastError || !stream) {
              console.error('Error starting tab capture:', chrome.runtime.lastError?.message || "Stream is null");
              isActuallyRecording = false; // Revert state
              updateActionIcon(false);
              chrome.storage.local.set({ isRecording: false }); // Also update persisted state
              sendResponse({ success: false, error: 'Failed to start audio capture.' });
              chrome.runtime.sendMessage({ action: 'recordingActuallyStopped' }); // Notify UI of failure
              return;
            }
            audioStream = stream;
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            audioChunks = [];
            recordedAudioBlob = null;

            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) audioChunks.push(event.data);
            };
            mediaRecorder.onstop = () => {
              if (audioChunks.length > 0) {
                recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                console.log('Audio recording stopped, blob created:', recordedAudioBlob?.size);
              } else {
                recordedAudioBlob = null;
                console.log('Audio recording stopped, no data in audioChunks.');
              }
              audioChunks = [];
            };
            mediaRecorder.start();
            console.log('MediaRecorder started for audio.');
            stream.oninactive = () => {
              console.log('Audio stream became inactive.');
              if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
              if (audioStream) audioStream.getTracks().forEach(track => track.stop());
              audioStream = null;
            };
            sendResponse({ success: true });
          });
        } else {
          sendResponse({ success: true });
        }
      });
      // Persist the reliable state
      chrome.storage.local.set({ isRecording: true });
      return true;

    case 'captureScreenshot':
      if (!isActuallyRecording) {
        sendResponse({ error: 'Not recording.' });
        return true;
      }
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error('Error capturing screenshot:', chrome.runtime.lastError.message);
          sendResponse({ error: 'Failed to capture screenshot' });
        } else {
          chrome.storage.local.get(['screenshots'], (result) => {
            const screenshots = result.screenshots || [];
            screenshots.push({
              dataUrl: dataUrl,
              clickX: message.clickX,
              clickY: message.clickY,
              annotation: '', // Initialize annotation
              drawings: [],   // Initialize drawings
              cropRegion: null // Initialize cropRegion
            });
            chrome.storage.local.set({ screenshots }, () => {
              sendResponse({ success: true, dataUrl: dataUrl.substring(0,50)+"..." }); // Send confirmation
            });
          });
        }
      });
      return true;

    case 'stopRecording':
      if (!isActuallyRecording) {
        sendResponse({ error: 'Was not recording.' });
        return true;
      }
      isActuallyRecording = false;
      updateActionIcon(false);

      const processStop = () => {
        chrome.storage.local.get(['screenshots'], (result) => {
          const screenshots = result.screenshots || [];
           // Persist reliable state and clear screenshots from storage *after* sending
          chrome.storage.local.set({ isRecording: false, screenshots: [] }, () => {
            console.log('isRecording set to false and screenshots cleared from storage.');
            sendResponse({ screenshots, audioAvailable: !!recordedAudioBlob });
             // Also notify popup/content script that recording actually stopped
            chrome.runtime.sendMessage({ action: 'recordingActuallyStopped' });
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs.length > 0 && tabs[0].id) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'recordingStateChanged', newIsRecordingState: false });
                }
            });
          });
        });
      };

      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.onstop = () => { // Override onstop to ensure it calls processStop
          if (audioChunks.length > 0) {
            recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            console.log('Audio recording stopped during main stop, blob created:', recordedAudioBlob?.size);
          } else {
            recordedAudioBlob = null;
            console.log('Audio recording stopped during main stop, no data.');
          }
          audioChunks = [];
          if (audioStream) audioStream.getTracks().forEach(track => track.stop());
          audioStream = null;
          mediaRecorder = null; // Clear mediaRecorder
          processStop();
        };
        mediaRecorder.stop();
      } else {
        if (audioStream) audioStream.getTracks().forEach(track => track.stop()); // Ensure tracks are stopped
        audioStream = null;
        mediaRecorder = null;
        processStop(); // No audio or already stopped
      }
      return true;

    case 'getAudioBlob':
      if (recordedAudioBlob) {
        sendResponse({ audioBlob: recordedAudioBlob });
        // Do not clear recordedAudioBlob here, popup might want to try again if download fails.
        // Or, implement a way for popup to signal successful download. For now, it persists until next recording.
      } else {
        sendResponse({ audioBlob: null });
      }
      return true;

    case 'getRecordingState':
      sendResponse({ isRecording: isActuallyRecording });
      return true;

    default:
      console.warn('Unknown action in background:', message.action);
      sendResponse({ error: 'Unknown action' });
      return false; // No async response for unknown
  }
});

// Set initial icon state
chrome.runtime.onStartup.addListener(() => {
  isActuallyRecording = false; // Reset on browser startup
  chrome.storage.local.set({ isRecording: false });
  updateActionIcon(false);
});

chrome.runtime.onInstalled.addListener(() => {
  isActuallyRecording = false; // Reset on extension install/update
  chrome.storage.local.set({ isRecording: false });
  updateActionIcon(false);
});
