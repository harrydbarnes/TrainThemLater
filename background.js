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
      // console.log("Action icon updated to:", path); // Potentially too noisy
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
        // Notify popup and content script that recording *actually* started
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
            recordedAudioBlob = null; // Reset previous audio blob

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
              // Ensure stream tracks are stopped here if mediaRecorder stops unexpectedly
              if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
                audioStream = null;
              }
            };
            mediaRecorder.start();
            console.log('MediaRecorder started for audio.');
            stream.oninactive = () => {
              console.log('Audio stream became inactive.');
              if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
              // audioStream tracks might already be stopped by onstop, but double-check
              if (audioStream) {
                 audioStream.getTracks().forEach(track => track.stop());
                 audioStream = null;
              }
            };
            sendResponse({ success: true });
          });
        } else {
          recordedAudioBlob = null; // Explicitly nullify if not recording audio
          sendResponse({ success: true });
        }
      });
      // Persist the reliable state
      chrome.storage.local.set({ isRecording: true });
      return true; // Keep true for async response from tabCapture

    case 'captureScreenshot':
      if (!isActuallyRecording) {
        sendResponse({ error: 'Not recording.' });
        return true; // Keep true for async response if needed, or false if sync
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
              annotation: '',
              drawings: [],
              cropRegion: null
            });
            chrome.storage.local.set({ screenshots }, () => {
              sendResponse({ success: true, dataUrl: dataUrl.substring(0,50)+"..." });
            });
          });
        }
      });
      return true;

    case 'stopRecording':
      if (!isActuallyRecording) {
        // Though UI should prevent this, handle graciously
        sendResponse({ error: 'Was not recording or already stopped.', success: false });
        return true;
      }
      isActuallyRecording = false; // Set immediately
      updateActionIcon(false);

      const processStopAndRespond = () => {
        chrome.storage.local.get(['screenshots'], (result) => {
          const screenshots = result.screenshots || [];
          chrome.storage.local.set({ isRecording: false, screenshots: [] }, () => { // Clear storage
            console.log('isRecording set to false and screenshots cleared from storage.');

            // Send message to popup.js to show the edit interface
            chrome.runtime.sendMessage({
              action: 'showEditInterfaceMessage',
              data: {
                screenshots: screenshots,
                audioAvailable: !!recordedAudioBlob
              }
            });

            // Notify all parts that recording actually stopped
            chrome.runtime.sendMessage({ action: 'recordingActuallyStopped' });
            // Notify active tab content script about state change
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs && tabs.length > 0 && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'recordingStateChanged', newIsRecordingState: false });
              }
            });
            // Send a simplified success response to the original caller (e.g., content.js)
            sendResponse({ success: true, stopped: true });
          });
        });
      };

      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.onstop = () => { // This will be called when mediaRecorder.stop() completes
          if (audioChunks.length > 0) {
            recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            console.log('Audio recording stopped during main stop, blob created:', recordedAudioBlob?.size);
          } else {
            recordedAudioBlob = null; // Ensure it's null if no chunks
            console.log('Audio recording stopped, no data.');
          }
          audioChunks = []; // Clear chunks
          if (audioStream) { // Stop stream tracks *after* blob is processed
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
          }
          mediaRecorder = null; // Clean up MediaRecorder instance
          processStopAndRespond();
        };
        mediaRecorder.stop();
      } else {
        // No active mediaRecorder, or it was already stopped
        if (audioStream) {
          audioStream.getTracks().forEach(track => track.stop());
          audioStream = null;
        }
        mediaRecorder = null;
        recordedAudioBlob = null; // Ensure no stale audio blob if recording wasn't active
        audioChunks = [];
        processStopAndRespond();
      }
      return true; // Indicate async response

    case 'getAudioBlob':
      if (recordedAudioBlob) {
        sendResponse({ audioBlob: recordedAudioBlob });
      } else {
        sendResponse({ audioBlob: null });
      }
      return true;

    case 'getRecordingState':
      // Respond with the more reliable internal state
      sendResponse({ isRecording: isActuallyRecording });
      return true; // Keep true if any path is async, but this one is sync

    default:
      console.warn('Unknown action in background:', message.action);
      sendResponse({ error: 'Unknown action' });
      return false;
  }
});

chrome.runtime.onStartup.addListener(() => {
  isActuallyRecording = false;
  chrome.storage.local.set({ isRecording: false, screenshots: [] }); // Clear on startup
  updateActionIcon(false);
});

chrome.runtime.onInstalled.addListener(() => {
  isActuallyRecording = false;
  chrome.storage.local.set({ isRecording: false, screenshots: [] }); // Clear on install/update
  updateActionIcon(false);
});
