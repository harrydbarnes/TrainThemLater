// harrydbarnes/trainthemlater/TrainThemLater-main/background.js
let audioStream = null;
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null;
let isActuallyRecording = false; // Represents the true recording state in background

const RECORDING_ICON_PATH = {
  "16": "icons/icon16_rec.png",
  "48": "icons/icon48_rec.png",
  "128": "icons/icon128_rec.png"
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

// Helper to send messages to content scripts of active tabs and the popup
function notifyUIsOfRecordingState(isRec) {
    // Notify content scripts
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0 && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { action: isRec ? 'recordingActuallyStarted' : 'recordingActuallyStopped' }, response => {
                if (chrome.runtime.lastError) console.warn("Background: Error notifying content script of recording state change:", chrome.runtime.lastError.message);
            });
        }
    });
    // Notify popup(s)
    chrome.runtime.sendMessage({ action: isRec ? 'recordingActuallyStarted' : 'recordingActuallyStopped' }, response => {
        if (chrome.runtime.lastError) console.warn("Background: Error notifying popup of recording state change:", chrome.runtime.lastError.message);
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
        return false;
      }

      chrome.storage.local.set({ screenshots: [], isRecording: true /* Tentatively set in storage */ }, () => {
        if (chrome.runtime.lastError) {
          console.error("Background: Storage error on startRecording (set screenshots/isRecording):", chrome.runtime.lastError.message);
          chrome.storage.local.set({ isRecording: false }); // Correct storage if start fails
          sendResponse({ success: false, error: "Storage error during start." });
          return;
        }
        console.log('Background: Recording starting...');

        const completeStartRecording = () => {
            isActuallyRecording = true; // Set true state here
            updateActionIcon(true);
            console.log("Background: Recording fully started. Notifying UIs.");
            notifyUIsOfRecordingState(true); // Notify all UIs that recording has started
            sendResponse({ success: true }); // ACK to original sender (content.js)
        };
        
        const failStartRecording = (errorMsg) => {
            console.error("Background: Failing start recording:", errorMsg);
            isActuallyRecording = false; // Ensure state is false
            updateActionIcon(false);
            chrome.storage.local.set({ isRecording: false }); // Correct storage
            notifyUIsOfRecordingState(false); // Notify UIs that recording stopped (or failed to start)
            sendResponse({ success: false, error: errorMsg });
            if (audioStream) { audioStream.getTracks().forEach(track => track.stop()); audioStream = null; }
            mediaRecorder = null; // Ensure mediaRecorder is reset
            audioChunks = []; // Clear any partial chunks
        };


        if (recordAudio) {
          chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
            if (chrome.runtime.lastError || !stream) {
              failStartRecording('Failed to start audio capture: ' + (chrome.runtime.lastError?.message || "Stream is null"));
              return;
            }
            audioStream = stream;
            try {
              mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            } catch (e) {
              failStartRecording('Failed to create MediaRecorder: ' + e.message);
              return;
            }
            audioChunks = []; recordedAudioBlob = null;
            mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunks.push(event.data); };
            mediaRecorder.onstop = () => { 
              if (isActuallyRecording) { 
                  console.warn("Background: Audio stream stopped unexpectedly. Stopping recording.");
                  isActuallyRecording = false;
                  updateActionIcon(false);
                  if (audioChunks.length > 0) recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' }); else recordedAudioBlob = null;
                  audioChunks = [];
                  if (audioStream) { audioStream.getTracks().forEach(track => track.stop()); audioStream = null; }
                  mediaRecorder = null;
                  chrome.storage.local.set({ isRecording: false });
                  notifyUIsOfRecordingState(false);
                  chrome.storage.local.get(['screenshots'], (result) => {
                    const editorDataForUnexpectedStop = { screenshots: result.screenshots || [], audioAvailable: !!recordedAudioBlob };
                     chrome.storage.local.set({ pendingEditorData: editorDataForUnexpectedStop, screenshots: [] }, () => {
                        if (!chrome.runtime.lastError) {
                             chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?view=editor&source=background&timestamp=' + Date.now()) });
                        } else {
                            console.error("Background: Storage error during unexpected stop processing for editor data.");
                        }
                     });
                  });
              }
            };
            try {
                mediaRecorder.start();
            } catch (e) {
                failStartRecording('Failed to start MediaRecorder: ' + e.message);
                return;
            }
            console.log('Background: MediaRecorder started for audio.');
            if (stream) { // Check if stream still exists before assigning oninactive
                 stream.oninactive = mediaRecorder.onstop; 
            }
            completeStartRecording();
          });
        } else { 
          recordedAudioBlob = null;
          completeStartRecording();
        }
      });
      return true; 

    case 'captureScreenshot':
      if (!isActuallyRecording) {
        sendResponse({ success: false, error: 'Not recording.' });
        return false;
      }
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: 'Failed to capture screenshot: ' + chrome.runtime.lastError.message });
        } else {
          chrome.storage.local.get(['screenshots'], (result) => {
            const screenshots = result.screenshots || [];
            screenshots.push({
              dataUrl, clickX: message.clickX, clickY: message.clickY,
              annotation: '', drawings: [], cropRegion: null,
              originalIndex: screenshots.length 
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
        console.warn("Background: 'stopRecording' called but was not recording or already stopped.");
        sendResponse({ success: false, error: 'Was not recording or already stopped.' });
        return false;
      }
      
      const wasRecording = isActuallyRecording; 
      isActuallyRecording = false; 
      updateActionIcon(false);
      chrome.storage.local.set({ isRecording: false }, () => {
        if(chrome.runtime.lastError) console.warn("Background: Error setting isRecording to false in storage on stop:", chrome.runtime.lastError.message);
      }); 

      const processStopAndRespond = () => {
        chrome.storage.local.get(['screenshots'], (result) => {
          const screenshots = result.screenshots || [];
          const editorData = { screenshots, audioAvailable: !!recordedAudioBlob };

          chrome.storage.local.set({ pendingEditorData: editorData, screenshots: [] }, () => {
            if (chrome.runtime.lastError) {
              console.error("Background: Error setting pendingEditorData/clearing screenshots:", chrome.runtime.lastError.message);
              notifyUIsOfRecordingState(false); 
              sendResponse({ success: false, error: "Storage error before opening editor." });
              return;
            }
            
            console.log('Background: Data for editor stored. Opening editor tab.');
            chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?view=editor&source=background&timestamp=' + Date.now()) });
            
            notifyUIsOfRecordingState(false); 

            if (wasRecording) { 
              sendResponse({ success: true, stopped: true });
            } else {
              sendResponse({ success: false, error: "No recording was active to stop."});
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
        try { 
            mediaRecorder.stop(); 
        } catch (e) {
          console.error("Background: Error stopping mediaRecorder:", e);
          if (audioStream) { audioStream.getTracks().forEach(track => track.stop()); audioStream = null; }
          recordedAudioBlob = (audioChunks.length >0) ? new Blob(audioChunks, { type: 'audio/webm'}) : null;
          audioChunks = [];
          mediaRecorder = null;
          processStopAndRespond(); 
        }
      } else { 
        if (audioStream) { audioStream.getTracks().forEach(track => track.stop()); audioStream = null; }
        if (audioChunks.length > 0 && !recordedAudioBlob) recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        else if (audioChunks.length === 0 && !recordedAudioBlob) recordedAudioBlob = null; 
        audioChunks = [];
        mediaRecorder = null;
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
      console.warn("Background: Unknown action received - ", message.action);
      sendResponse({ error: 'Unknown action' });
      return false;
  }
});

chrome.runtime.onStartup.addListener(() => {
  isActuallyRecording = false;
  chrome.storage.local.set({ isRecording: false, screenshots: [] });
  updateActionIcon(false);
  console.log("Background: onStartup: State reset.");
});

chrome.runtime.onInstalled.addListener(() => {
  isActuallyRecording = false;
  chrome.storage.local.set({ isRecording: false, screenshots: [] });
  updateActionIcon(false);
  console.log("Background: onInstalled: State reset.");
});

chrome.storage.local.get('isRecording', (result) => {
    const storedIsRecording = !!result.isRecording;
    
    if (!mediaRecorder && !audioStream) { 
        if (isActuallyRecording !== storedIsRecording) {
            console.warn(`Background: Mismatch at load. In-memory: ${isActuallyRecording}, Stored: ${storedIsRecording}. Syncing to stored value.`);
            isActuallyRecording = storedIsRecording;
        }
    } else if (isActuallyRecording && !storedIsRecording) {
        console.warn("Background: Active recording stream detected, but storage indicates not recording. Forcing stop.");
        isActuallyRecording = false;
        chrome.storage.local.set({ isRecording: false });
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop(); 
        } else if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
        }
        audioStream = null; 
        mediaRecorder = null; 
        audioChunks = []; 
        recordedAudioBlob = null;
    }

    updateActionIcon(isActuallyRecording);
    if (isActuallyRecording) {
        console.warn("Background: Extension loaded. Recording state is active.");
    } else {
        console.log("Background: Extension loaded. No active recording.");
    }
});
