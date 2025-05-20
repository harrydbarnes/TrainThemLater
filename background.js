// harrydbarnes/trainthemlater/TrainThemLater-main/background.js
let audioStream = null;
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null;
let isActuallyRecording = false;

// Ensure these paths are correct and files exist
const RECORDING_ICON_PATH = {
  "16": "icons/icon16_rec.png",
  "48": "icons/icon48_rec.png", // Make sure this file exists
  "128": "icons/icon128_rec.png" // Make sure this file exists
};
const DEFAULT_ICON_PATH = {
  "16": "icons/icon16.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
};

function updateActionIcon(recording) {
  const pathDetails = recording ? RECORDING_ICON_PATH : DEFAULT_ICON_PATH;
  chrome.action.setIcon({ path: pathDetails }, () => {
    if (chrome.runtime.lastError) {
      console.warn(`Background: Error setting action icon to ${recording ? 'recording' : 'default'}: ${chrome.runtime.lastError.message}. Path attempted:`, pathDetails);
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(`Background: Received action: ${message.action} from ${sender.tab ? 'tab ' + sender.tab.id : 'extension (popup or self)'}`);

  switch (message.action) {
    case 'startRecording':
      const recordAudio = message.recordAudio;
      if (isActuallyRecording) {
        console.warn("Background: 'startRecording' called but already recording.");
        sendResponse({ success: false, error: "Already recording." });
        return false; // Indicate sync response
      }

      isActuallyRecording = true;
      updateActionIcon(true);

      chrome.storage.local.set({ screenshots: [], isRecording: true }, () => {
        if (chrome.runtime.lastError) {
          console.error("Background: Storage error on startRecording (set screenshots/isRecording):", chrome.runtime.lastError.message);
          isActuallyRecording = false; updateActionIcon(false);
          chrome.storage.local.set({ isRecording: false });
          sendResponse({ success: false, error: "Storage error during start." });
          return;
        }
        console.log('Background: Recording starting...');

        // Define a function to be called after audio setup (or if no audio)
        const afterAudioSetup = (audioSetupSuccess = true) => {
            if (audioSetupSuccess) {
                sendResponse({ success: true }); // ACK to original sender (content.js)
                console.log("Background: Sent {success: true} for startRecording. Now sending 'recordingActuallyStarted'.");
                chrome.runtime.sendMessage({ action: 'recordingActuallyStarted' }); // Global notification
            } else {
                // Error handling for audio setup failure already calls sendResponse
                // and reverts state. This path should not be hit if audioSetupSuccess is false
                // due to returns in the error paths.
            }
        };

        if (recordAudio) {
          chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
            if (chrome.runtime.lastError || !stream) {
              console.error('Background: Error starting tab capture:', chrome.runtime.lastError?.message || "Stream is null");
              isActuallyRecording = false; updateActionIcon(false); chrome.storage.local.set({ isRecording: false });
              sendResponse({ success: false, error: 'Failed to start audio capture.' }); // Respond to content.js
              chrome.runtime.sendMessage({ action: 'recordingActuallyStopped' }); // Notify all UIs
              return;
            }
            audioStream = stream;
            try {
              mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            } catch (e) {
              console.error("Background: Error creating MediaRecorder:", e);
              isActuallyRecording = false; updateActionIcon(false); chrome.storage.local.set({ isRecording: false });
              sendResponse({ success: false, error: 'Failed to create MediaRecorder: ' + e.message });
              chrome.runtime.sendMessage({ action: 'recordingActuallyStopped' });
              if (audioStream) audioStream.getTracks().forEach(track => track.stop()); audioStream = null;
              return;
            }
            audioChunks = []; recordedAudioBlob = null;
            mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunks.push(event.data); };
            mediaRecorder.onstop = () => {
              if (audioChunks.length > 0) recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
              else recordedAudioBlob = null;
              audioChunks = [];
              if (audioStream) { audioStream.getTracks().forEach(track => track.stop()); audioStream = null; }
              mediaRecorder = null;
            };
            mediaRecorder.start();
            console.log('Background: MediaRecorder started for audio.');
            stream.oninactive = () => { if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop(); };
            afterAudioSetup(true);
          });
        } else { // No audio
          recordedAudioBlob = null;
          afterAudioSetup(true);
        }
      });
      return true; // Crucial: sendResponse is asynchronous

    case 'captureScreenshot':
      if (!isActuallyRecording) {
        sendResponse({ error: 'Not recording.' });
        return false;
      }
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: 'Failed to capture screenshot: ' + chrome.runtime.lastError.message });
        } else {
          chrome.storage.local.get(['screenshots'], (result) => {
            const screenshots = result.screenshots || [];
            screenshots.push({
              dataUrl, clickX: message.clickX, clickY: message.clickY,
              annotation: '', drawings: [], cropRegion: null
            });
            chrome.storage.local.set({ screenshots }, () => {
              if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: "Storage error saving screenshot" });
              } else {
                sendResponse({ success: true });
              }
            });
          });
        }
      });
      return true;

    case 'stopRecording':
      if (!isActuallyRecording && (!mediaRecorder || mediaRecorder.state !== "recording")) {
        sendResponse({ error: 'Was not recording or already stopped.', success: false });
        return false;
      }
      const wasActuallyRecording = isActuallyRecording;
      isActuallyRecording = false;
      updateActionIcon(false);

      const processStopAndRespond = () => {
        chrome.storage.local.get(['screenshots'], (result) => {
          const screenshots = result.screenshots || [];
          chrome.storage.local.set({ isRecording: false, screenshots: [] }, () => {
            console.log('Background: isRecording set to false by stopRecording, screenshots cleared.');
            chrome.runtime.sendMessage({
              action: 'showEditInterfaceMessage',
              data: { screenshots, audioAvailable: !!recordedAudioBlob }
            });
            chrome.runtime.sendMessage({ action: 'recordingActuallyStopped' });
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'recordingStateChanged', newIsRecordingState: false });
              }
            });
            if (wasRecordingFlag || (mediaRecorder && mediaRecorder.state !== "stopped")) { // Ensure response if action was taken
                sendResponse({ success: true, stopped: true });
            }
          });
        });
      };

      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.onstop = () => {
          if (audioChunks.length > 0) recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          else recordedAudioBlob = null;
          audioChunks = [];
          if (audioStream) { audioStream.getTracks().forEach(track => track.stop()); audioStream = null; }
          mediaRecorder = null;
          processStopAndRespond();
        };
        try { mediaRecorder.stop(); } catch (e) {
          console.error("Background: Error stopping mediaRecorder:", e);
          if (audioStream) audioStream.getTracks().forEach(track => track.stop()); audioStream = null; mediaRecorder = null;
          recordedAudioBlob = (audioChunks.length > 0) ? new Blob(audioChunks, { type: 'audio/webm' }) : null;
          audioChunks = [];
          processStopAndRespond();
        }
      } else {
        if (audioStream) { audioStream.getTracks().forEach(track => track.stop()); audioStream = null; }
        mediaRecorder = null;
        if (audioChunks.length > 0 && !recordedAudioBlob) recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        else if (!recordedAudioBlob) recordedAudioBlob = null;
        audioChunks = [];
        processStopAndRespond();
      }
      return true;

    case 'getAudioBlob':
      sendResponse({ audioBlob: recordedAudioBlob });
      return true;

    case 'getRecordingState':
      sendResponse({ isRecording: isActuallyRecording });
      return false;

    default:
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

chrome.storage.local.get('isRecording', (result) => {
    isActuallyRecording = !!result.isRecording;
    updateActionIcon(isActuallyRecording);
    if (isActuallyRecording) {
        console.warn("Background: Extension loaded, was previously recording. State has been updated based on storage. User might need to manually stop if this was unintended.");
    }
});
