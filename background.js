let audioStream = null;
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null;
let isActuallyRecording = false; // More reliable internal state

const RECORDING_ICON_PATH = {
  "16": "icons/icon16_rec.png",
  "48": "icons/icon48_rec.png", // Assuming you have this
  "128": "icons/icon128_rec.png" // Assuming you have this
};
const DEFAULT_ICON_PATH = {
  "16": "icons/icon16.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
};

function updateActionIcon(recording) {
  const pathDetails = recording ? RECORDING_ICON_PATH : DEFAULT_ICON_PATH;
  // Ensure all specified sizes are attempted if available, or just the 16px as a fallback.
  const iconPath = pathDetails["16"] ? pathDetails : { "16": pathDetails["16"]};
  chrome.action.setIcon({ path: iconPath }, () => {
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
      isActuallyRecording = true;
      updateActionIcon(true);
      chrome.storage.local.set({ screenshots: [], isRecording: true }, () => { // Combine storage set
        if (chrome.runtime.lastError) {
          console.error("Background: Storage error on startRecording:", chrome.runtime.lastError.message);
          isActuallyRecording = false; // Revert state
          updateActionIcon(false);
          sendResponse({ success: false, error: "Storage error during start." });
          chrome.runtime.sendMessage({ action: 'recordingActuallyStopped' }); // Notify of failure
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
                console.log('Background: Audio recording stopped, blob created:', recordedAudioBlob?.size);
              } else {
                recordedAudioBlob = null;
                console.log('Background: Audio recording stopped, no data in audioChunks.');
              }
              audioChunks = [];
              if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
                audioStream = null;
              }
            };
            mediaRecorder.start();
            console.log('Background: MediaRecorder started for audio.');
            stream.oninactive = () => {
              console.log('Background: Audio stream became inactive.');
              if (mediaRecorder && mediaRecorder.state === "recording") {
                mediaRecorder.stop();
              }
              if (audioStream) {
                 audioStream.getTracks().forEach(track => track.stop());
                 audioStream = null;
              }
            };
            sendResponse({ success: true });
          });
        } else {
          recordedAudioBlob = null;
          sendResponse({ success: true });
        }
      });
      return true; // Essential for async operations like storage.set and tabCapture

    case 'captureScreenshot':
      if (!isActuallyRecording) {
        sendResponse({ error: 'Not recording.' });
        return true;
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
              annotation: '',
              drawings: [],
              cropRegion: null
            });
            chrome.storage.local.set({ screenshots }, () => {
              if (chrome.runtime.lastError) {
                console.error("Background: Storage error saving screenshot:", chrome.runtime.lastError.message);
                sendResponse({ success: false, error: "Storage error saving screenshot" });
              } else {
                sendResponse({ success: true, dataUrl: dataUrl.substring(0,50)+"..." });
              }
            });
          });
        }
      });
      return true;

    case 'stopRecording':
      if (!isActuallyRecording) {
        sendResponse({ error: 'Was not recording or already stopped.', success: false });
        return true;
      }
      isActuallyRecording = false;
      updateActionIcon(false);

      const processStopAndRespond = () => {
        chrome.storage.local.get(['screenshots'], (result) => {
          const screenshots = result.screenshots || [];
          chrome.storage.local.set({ isRecording: false, screenshots: [] }, () => {
            if (chrome.runtime.lastError) {
              console.error("Background: Storage error on stopRecording:", chrome.runtime.lastError.message);
              // Attempt to proceed with what we have, but acknowledge storage issue.
            }
            console.log('Background: isRecording set to false and screenshots cleared from storage.');

            chrome.runtime.sendMessage({
              action: 'showEditInterfaceMessage',
              data: {
                screenshots: screenshots,
                audioAvailable: !!recordedAudioBlob
              }
            });
            chrome.runtime.sendMessage({ action: 'recordingActuallyStopped' });
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs && tabs.length > 0 && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'recordingStateChanged', newIsRecordingState: false });
              }
            });
            sendResponse({ success: true, stopped: true });
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
          // Fallback to direct processing if stop() fails
          if (audioStream) audioStream.getTracks().forEach(track => track.stop());
          audioStream = null;
          mediaRecorder = null;
          recordedAudioBlob = (audioChunks.length > 0) ? new Blob(audioChunks, { type: 'audio/webm' }) : null;
          audioChunks = [];
          processStopAndRespond();
        }
      } else {
        if (audioStream) audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
        mediaRecorder = null;
        // recordedAudioBlob might already be set by a previous oninactive or explicit stop.
        // If audio wasn't even started, recordedAudioBlob should be null.
        if (audioChunks.length > 0) { // Process any lingering chunks if recorder never properly stopped
            recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            audioChunks = [];
        } else if (!recordedAudioBlob) { // if it's not already set and no chunks, ensure it's null
            recordedAudioBlob = null;
        }
        processStopAndRespond();
      }
      return true;

    case 'getAudioBlob':
      if (recordedAudioBlob) {
        sendResponse({ audioBlob: recordedAudioBlob });
      } else {
        sendResponse({ audioBlob: null });
      }
      return true;

    case 'getRecordingState':
      sendResponse({ isRecording: isActuallyRecording });
      return true;

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

// Initial icon state just in case the browser was closed abruptly
updateActionIcon(false);
chrome.storage.local.get('isRecording', (result) => {
    if (result.isRecording) { // If was recording and browser crashed
        isActuallyRecording = true; // Assume it was, user needs to manually stop or restart
        updateActionIcon(true);
    } else {
        isActuallyRecording = false;
        updateActionIcon(false);
    }
});
