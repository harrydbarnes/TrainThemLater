// harrydbarnes/trainthemlater/TrainThemLater-main/background.js
let audioStream = null;
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null;
let isActuallyRecording = false;
let currentTabUrl = ''; // To store the URL of the tab where recording starts
let desktopStream = null;
let videoElement = null;

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
            if (desktopStream) { desktopStream.getTracks().forEach(track => track.stop()); desktopStream = null; }
            if (videoElement) { videoElement.srcObject = null; videoElement = null;}
            mediaRecorder = null;
            audioChunks = [];
        };

        // Start desktop capture
        chrome.desktopCapture.chooseDesktopMedia(
          ['screen', 'window', 'tab', 'audio'],
          sender.tab, // Or null if not called from a tab
          (streamId, options) => {
            if (chrome.runtime.lastError || !streamId) {
              failStartRecording('Failed to choose desktop media: ' + (chrome.runtime.lastError?.message || "No stream ID returned"));
              return;
            }

            const videoConstraints = {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: streamId,
                minWidth: 1280,
                maxWidth: 1920, // Or screen.width
                minHeight: 720,
                maxHeight: 1080 // Or screen.height
              }
            };
            
            const constraints = {
                audio: options.canRequestAudioTrack ? {
                    mandatory: {
                        chromeMediaSource: 'desktop', // For audio from the chosen desktop stream
                        chromeMediaSourceId: streamId
                    }
                } : false,
                video: videoConstraints
            };

            navigator.mediaDevices.getUserMedia(constraints)
              .then(stream => {
                desktopStream = stream;
                videoElement = document.createElement('video');
                videoElement.srcObject = desktopStream;
                videoElement.onloadedmetadata = () => {
                  videoElement.play().catch(e => failStartRecording("Video element play failed: " + e.message));
                };
                videoElement.onerror = () => failStartRecording('Video element error.');

                desktopStream.oninactive = () => {
                    console.warn("Background: Desktop stream became inactive. Stopping recording.");
                    // Check if we are in a state where a manual stop is needed.
                    // The 'stopRecording' message handler might have already been called if user clicked stop.
                    // This handles cases like user stopping sharing via browser UI.
                    if (isActuallyRecording) {
                         // Simulate a stopRecording call or directly call parts of its logic
                        // This ensures cleanup and UI notification.
                        // Avoid calling sendResponse if this isn't part of a direct message flow.
                        handleStopRecordingInternally("Desktop stream ended by user or system.");
                    }
                };


                // Audio Handling
                let audioSourceStream = null;
                if (recordAudio) {
                    if (options.canRequestAudioTrack && desktopStream.getAudioTracks().length > 0) {
                        console.log("Background: Using audio from desktop capture stream.");
                        audioSourceStream = new MediaStream(desktopStream.getAudioTracks());
                    } else {
                        // Attempt tabCapture as a fallback if desktop audio wasn't chosen or available
                        console.log("Background: Desktop audio not selected/available. Attempting tab audio capture for recording.");
                        // This part needs to be handled carefully due to its async nature within a promise
                        // We will set up audio after this block, potentially after an async tab capture
                        // For now, we mark that we need to capture tab audio.
                    }
                }

                const setupAudioRecorder = (finalAudioStream) => {
                    if (!recordAudio || !finalAudioStream) {
                        recordedAudioBlob = null;
                        completeStartRecording(); // Proceed without audio
                        return;
                    }
                    audioStream = finalAudioStream; // Store the stream being recorded
                    try {
                        mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
                        audioChunks = []; recordedAudioBlob = null;
                        mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunks.push(event.data); };
                        mediaRecorder.onstop = () => {
                            // This onstop is for the audio media recorder.
                            // It might be triggered by the audio stream ending or by a manual stop.
                            console.log("Background: MediaRecorder (audio) stopped.");
                            if (audioChunks.length > 0) {
                                recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                            } else {
                                recordedAudioBlob = null;
                            }
                            audioChunks = [];
                            // Don't nullify audioStream here if it's from desktopStream, as desktopStream handles its own tracks.
                            // If it was a separate tabCapture stream, it's fine.
                            if (audioStream !== desktopStream && audioStream?.getTracks) { // Only if it's a separate stream
                                audioStream.getTracks().forEach(track => track.stop());
                            }
                            // If !isActuallyRecording, it means stopRecording was called, which handles other cleanups.
                        };
                        mediaRecorder.start();
                        console.log(`Background: MediaRecorder started for ${audioStream === desktopStream ? 'desktop' : 'tab'} audio.`);
                        // Handle if the specific audioStream itself becomes inactive
                        audioStream.oninactive = () => {
                            console.warn(`Background: ${audioStream === desktopStream ? 'Desktop' : 'Tab'} audio stream became inactive.`);
                            if (mediaRecorder && mediaRecorder.state === "recording") {
                                mediaRecorder.stop();
                            }
                        };
                        completeStartRecording();
                    } catch (e) {
                        failStartRecording(`Failed to create or start MediaRecorder for audio: ${e.message}`);
                    }
                };

                if (recordAudio && !audioSourceStream) { // Need to try tab capture
                    chrome.tabCapture.capture({ audio: true, video: false }, (tabAudioStream) => {
                        if (chrome.runtime.lastError || !tabAudioStream) {
                            console.warn('Background: Failed to start tab audio capture as fallback: ' + (chrome.runtime.lastError?.message || "Stream is null"));
                            setupAudioRecorder(null); // Proceed without audio
                        } else {
                            console.log("Background: Successfully captured tab audio as fallback.");
                            setupAudioRecorder(tabAudioStream);
                        }
                    });
                } else { // Desktop audio is available, or no audio requested
                    setupAudioRecorder(audioSourceStream);
                }
              })
              .catch(err => {
                failStartRecording('Failed to get user media for desktop stream: ' + err.message);
              });
          }
        );
      });
      return true;

    case 'captureScreenshot':
      if (!isActuallyRecording || !desktopStream || !videoElement) {
        sendResponse({ success: false, error: 'Not recording or desktop stream not available.' });
        return false;
      }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');

        chrome.storage.local.get(['screenshots'], (result) => {
          const screenshots = result.screenshots || [];
          screenshots.push({
            dataUrl,
            clickX: message.clickX,
            clickY: message.clickY,
            imageWidth: videoElement.videoWidth, // Full width of the captured source
            imageHeight: videoElement.videoHeight, // Full height of the captured source
            annotation: '',
            drawings: [],
            cropRegion: null,
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
      } catch (e) {
        console.error("Background: Error capturing screenshot from video stream:", e);
        sendResponse({ success: false, error: 'Failed to capture screenshot from video stream: ' + e.message });
      }
      return true;

    case 'stopRecording':
      if (!isActuallyRecording && !desktopStream) { // Simplified condition
        console.warn("Background: 'stopRecording' (message) called but not actively recording or no desktop stream.");
        // Allow to proceed if only audio part was active and needs stopping, but desktopStream might be gone
        // This path will mostly clean up whatever is left.
      }

      // Call the internal handler that can also be used by stream events
      handleStopRecordingInternally("User requested stop.", sendResponse);
      return true; // Indicate async response if sendResponse is used by internal handler

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
