// harrydbarnes/trainthemlater/TrainThemLater-main/background.js
let audioStream = null;
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null;
let isActuallyRecording = false; // More reliable internal state

const RECORDING_ICON_PATH = {
  "16": "icons/icon16_rec.png",
  "48": "icons/icon48_rec.png",
  "128": "icons/icon128_rec.png"
};
const DEFAULT_ICON_PATH = {
  "16": "icons/icon16.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128_rec.png" // Ensure this matches your actual default icon if different
};

function updateActionIcon(recording) {
  const pathDetails = recording ? RECORDING_ICON_PATH : DEFAULT_ICON_PATH;
  chrome.action.setIcon({ path: pathDetails }, () => {
    if (chrome.runtime.lastError) {
      console.warn(`Error setting action icon to ${recording ? 'recording' : 'default'}:`, chrome.runtime.lastError.message);
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(`Background: Received action: ${message.action}`);

  switch (message.action) {
    case 'startRecording':
      const recordAudio = message.recordAudio;
      if (isActuallyRecording) {
        console.warn("Background: startRecording called but already recording.");
        sendResponse({ success: false, error: "Already recording." });
        return false; // Indicate sync response as we are not keeping port open
      }

      isActuallyRecording = true;
      updateActionIcon(true);
      chrome.storage.local.set({ screenshots: [], isRecording: true }, (storageSetError) => {
        if (chrome.runtime.lastError) { // Check error for this specific storage.set
          console.error("Background: Storage error on startRecording (set screenshots/isRecording):", chrome.runtime.lastError.message);
          isActuallyRecording = false;
          updateActionIcon(false);
          chrome.storage.local.set({ isRecording: false }); // Attempt to revert
          sendResponse({ success: false, error: "Storage error during start." });
          chrome.runtime.sendMessage({ action: 'recordingActuallyStopped' });
          return;
        }

        console.log('Background: Recording starting...');
        chrome.runtime.sendMessage({ action: 'recordingActuallyStarted' });

        if (recordAudio) {
          chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
            if (chrome.runtime.lastError || !stream) {
              console.error('Background: Error starting tab capture:', chrome.runtime.lastError?.message || "Stream is null");
              isActuallyRecording = false;
              updateActionIcon(false);
              chrome.storage.local.set({ isRecording: false });
              sendResponse({ success: false, error: 'Failed to start audio capture.' });
              chrome.runtime.sendMessage({ action: 'recordingActuallyStopped' });
              return;
            }
            audioStream = stream;
            try {
              mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            } catch (e) {
              console.error("Background: Error creating MediaRecorder:", e);
              isActuallyRecording = false;
              updateActionIcon(false);
              chrome.storage.local.set({ isRecording: false });
              sendResponse({ success: false, error: 'Failed to create MediaRecorder. ' + e.message });
              chrome.runtime.sendMessage({ action: 'recordingActuallyStopped' });
              if (audioStream) audioStream.getTracks().forEach(track => track.stop());
              audioStream = null;
              return;
            }
            audioChunks = [];
            recordedAudioBlob = null;

            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) audioChunks.push(event.data);
            };
            mediaRecorder.onstop = () => {
              if (audioChunks.length > 0) {
                recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
              } else {
                recordedAudioBlob = null;
              }
              audioChunks = [];
              if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
                audioStream = null;
              }
              mediaRecorder = null; // Clean up
            };
            mediaRecorder.start();
            console.log('Background: MediaRecorder started for audio.');
            stream.oninactive = () => {
              console.log('Background: Audio stream became inactive.');
              if (mediaRecorder && mediaRecorder.state === "recording") {
                mediaRecorder.stop();
              }
            };
            sendResponse({ success: true });
          });
        } else {
          recordedAudioBlob = null;
          sendResponse({ success: true });
        }
      });
      return true; // Essential for async operations

    case 'captureScreenshot':
      if (!isActuallyRecording) {
        sendResponse({ error: 'Not recording.' });
        return false; // Synchronous response
      }
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error('Background: Error capturing screenshot:', chrome.runtime.lastError.message);
          sendResponse({ error: 'Failed to capture screenshot' });
        } else {
          chrome.storage.local.get(['screenshots'], (result) => {
            const screenshots = result.screenshots || [];
            screenshots.push({
              dataUrl: dataUrl,
              clickX: message.clickX,
              clickY: message.clickY,
              annotation: '', drawings: [], cropRegion: null
            });
            chrome.storage.local.set({ screenshots }, () => {
              if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: "Storage error saving screenshot" });
              } else {
                sendResponse({ success: true, dataUrl: dataUrl.substring(0, 50) + "..." });
              }
            });
          });
        }
      });
      return true;

    case 'stopRecording':
      if (!isActuallyRecording) {
        sendResponse({ error: 'Was not recording or already stopped.', success: false });
        return false; // Sync response
      }
      isActuallyRecording = false;
      updateActionIcon(false);

      const processStopAndRespond = () => {
        chrome.storage.local.get(['screenshots'], (result) => {
          const screenshots = result.screenshots || [];
          chrome.storage.local.set({ isRecording: false, screenshots: [] }, () => {
            console.log('Background: isRecording set to false and screenshots cleared from storage.');
            // Message to popup.js to show the edit interface (or open new tab for it)
            chrome.runtime.sendMessage({
              action: 'showEditInterfaceMessage',
              data: { screenshots: screenshots, audioAvailable: !!recordedAudioBlob }
            });
            chrome.runtime.sendMessage({ action: 'recordingActuallyStopped' });
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'recordingStateChanged', newIsRecordingState: false });
              }
            });
            sendResponse({ success: true, stopped: true }); // Respond to original caller
          });
        });
      };

      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.onstop = () => {
          if (audioChunks.length > 0) {
            recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          } else {
            recordedAudioBlob = null;
          }
          audioChunks = [];
          if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
          }
          mediaRecorder = null;
          processStopAndRespond();
        };
        try {
          mediaRecorder.stop();
        } catch (e) {
          console.error("Background: Error stopping mediaRecorder:", e);
          if (audioStream) audioStream.getTracks().forEach(track => track.stop());
          audioStream = null; mediaRecorder = null;
          recordedAudioBlob = (audioChunks.length > 0) ? new Blob(audioChunks, { type: 'audio/webm' }) : null;
          audioChunks = [];
          processStopAndRespond();
        }
      } else {
        if (audioStream) audioStream.getTracks().forEach(track => track.stop());
        audioStream = null; mediaRecorder = null;
        if (audioChunks.length > 0) recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        else if (!recordedAudioBlob) recordedAudioBlob = null;
        audioChunks = [];
        processStopAndRespond();
      }
      return true;

    case 'getAudioBlob':
      sendResponse({ audioBlob: recordedAudioBlob });
      return true; // Potentially async if blob needs to be fetched/read later

    case 'getRecordingState':
      sendResponse({ isRecording: isActuallyRecording });
      return false; // Sync response

    default:
      console.warn('Background: Unknown action:', message.action);
      sendResponse({ error: 'Unknown action' });
      return false;
  }
});

chrome.runtime.onStartup.addListener(() => {
  isActuallyRecording = false;
  chrome.storage.local.set({ isRecording: false, screenshots: [] });
  updateActionIcon(false);
});

chrome.runtime.onInstalled.addListener(() => {
  isActuallyRecording = false;
  chrome.storage.local.set({ isRecording: false, screenshots: [] });
  updateActionIcon(false);
});

// Initial state check
chrome.storage.local.get('isRecording', (result) => {
    isActuallyRecording = !!result.isRecording;
    updateActionIcon(isActuallyRecording);
});
