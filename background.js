// harrydbarnes/trainthemlater/TrainThemLater-main/background.js
let audioStream = null;
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null;
let isActuallyRecording = false; 
let currentTabUrl = ''; // To store the URL of the tab where recording starts

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

function notifyUIsOfRecordingState(isRec) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0 && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { action: isRec ? 'recordingActuallyStarted' : 'recordingActuallyStopped' }, response => {
                if (chrome.runtime.lastError) console.warn("Background: Error notifying content script of recording state change:", chrome.runtime.lastError.message);
            });
        }
    });
    chrome.runtime.sendMessage({ action: isRec ? 'recordingActuallyStarted' : 'recordingActuallyStopped' }, response => {
        if (chrome.runtime.lastError) console.warn("Background: Error notifying popup of recording state change:", chrome.runtime.lastError.message);
    });
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(`Background: Received action: ${message.action} from ${sender.tab ? 'tab ' + sender.tab.id : 'extension (popup or self)'}`);

  switch (message.action) {
    case 'startRecording':
      const recordAudio = message.recordAudio;
      // Use URL from message if provided (from content script's direct overlay click)
      // Otherwise, rely on sender.tab.url (if from popup), or fallback to active tab
      if (message.pageUrl) {
        currentTabUrl = message.pageUrl;
        console.log("Background: Using page URL from message:", currentTabUrl);
      } else if (sender.tab && sender.tab.url) {
        currentTabUrl = sender.tab.url;
        console.log("Background: Captured page URL from sender tab:", currentTabUrl);
      } else {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url) {
                currentTabUrl = tabs[0].url;
                console.log("Background: Captured active tab URL (fallback):", currentTabUrl);
            } else {
                currentTabUrl = ''; 
                console.warn("Background: Could not determine page URL for title.");
            }
        });
      }

      if (isActuallyRecording) {
        console.warn("Background: 'startRecording' called but already recording.");
        sendResponse({ success: false, error: "Already recording." });
        return false;
      }

      chrome.storage.local.set({ screenshots: [], isRecording: true, pageUrlForTitle: currentTabUrl }, () => {
        if (chrome.runtime.lastError) {
          console.error("Background: Storage error on startRecording (set screenshots/isRecording/pageUrl):", chrome.runtime.lastError.message);
          chrome.storage.local.set({ isRecording: false }); 
          sendResponse({ success: false, error: "Storage error during start." });
          return;
        }
        console.log('Background: Recording starting with URL:', currentTabUrl);

        const completeStartRecording = () => {
            isActuallyRecording = true; 
            updateActionIcon(true);
            console.log("Background: Recording fully started. Notifying UIs.");
            notifyUIsOfRecordingState(true); 
            sendResponse({ success: true }); 
        };
        
        const failStartRecording = (errorMsg) => {
            console.error("Background: Failing start recording:", errorMsg);
            isActuallyRecording = false; 
            updateActionIcon(false);
            chrome.storage.local.set({ isRecording: false, pageUrlForTitle: '' }); // Clear URL too
            notifyUIsOfRecordingState(false); 
            sendResponse({ success: false, error: errorMsg });
            if (audioStream) { audioStream.getTracks().forEach(track => track.stop()); audioStream = null; }
            mediaRecorder = null; 
            audioChunks = []; 
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
                  chrome.storage.local.get(['screenshots', 'pageUrlForTitle'], (result) => { // Get URL too
                    const editorDataForUnexpectedStop = { 
                        screenshots: result.screenshots || [], 
                        audioAvailable: !!recordedAudioBlob,
                        pageUrl: result.pageUrlForTitle || currentTabUrl || ''
                    };
                     chrome.storage.local.set({ pendingEditorData: editorDataForUnexpectedStop, screenshots: [], pageUrlForTitle: '' }, () => {
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
            if (stream) {
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
        chrome.storage.local.get(['screenshots', 'pageUrlForTitle'], (result) => {
          const screenshots = result.screenshots || [];
          const pageUrl = result.pageUrlForTitle || currentTabUrl || ''; 
          
          const editorData = { screenshots, audioAvailable: !!recordedAudioBlob, pageUrl: pageUrl };

          chrome.storage.local.set({ 
              pendingEditorData: editorData, 
              screenshots: [], 
              pageUrlForTitle: '' // Clear it after use
            }, () => {
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
  currentTabUrl = '';
  chrome.storage.local.set({ isRecording: false, screenshots: [], pageUrlForTitle: '', pendingEditorData: null });
  updateActionIcon(false);
  console.log("Background: onStartup: State reset.");
});

chrome.runtime.onInstalled.addListener(() => {
  isActuallyRecording = false;
  currentTabUrl = '';
  chrome.storage.local.set({ isRecording: false, screenshots: [], pageUrlForTitle: '', pendingEditorData: null });
  updateActionIcon(false);
  console.log("Background: onInstalled: State reset.");
});

chrome.storage.local.get(['isRecording', 'pageUrlForTitle'], (result) => {
    const storedIsRecording = !!result.isRecording;
    currentTabUrl = result.pageUrlForTitle || ''; // Load it initially
    
    if (!mediaRecorder && !audioStream) { 
        if (isActuallyRecording !== storedIsRecording) {
            console.warn(`Background: Mismatch at load. In-memory: ${isActuallyRecording}, Stored: ${storedIsRecording}. Syncing to stored value.`);
            isActuallyRecording = storedIsRecording;
        }
        if (!isActuallyRecording) { 
            currentTabUrl = ''; 
            chrome.storage.local.remove('pageUrlForTitle'); // Ensure it's cleared if not recording
        }
    } else if (isActuallyRecording && !storedIsRecording) {
        console.warn("Background: Active recording stream detected, but storage indicates not recording. Forcing stop.");
        isActuallyRecording = false;
        chrome.storage.local.set({ isRecording: false, pageUrlForTitle: '' });
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop(); 
        } else if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
        }
        audioStream = null; 
        mediaRecorder = null; 
        audioChunks = []; 
        recordedAudioBlob = null;
        currentTabUrl = '';
    }

    updateActionIcon(isActuallyRecording);
    if (isActuallyRecording) {
        console.warn("Background: Extension loaded. Recording state is active. URL:", currentTabUrl);
    } else {
        console.log("Background: Extension loaded. No active recording.");
    }
});
