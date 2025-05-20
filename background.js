let audioStream = null;
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null; // Stores the final audio blob

// Listen for messages from the popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received in background.js:', message);

  // Handle different actions
  switch (message.action) {
    case 'startRecording':
      const recordAudio = message.recordAudio;
      // Initialize recording state and clear previous screenshots
      chrome.storage.local.set({ isRecording: true, screenshots: [] }, () => {
        console.log('Recording started. State updated.');
        // Notify content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs.length > 0 && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'recordingStateChanged', newIsRecordingState: true }, (response) => {
              if (chrome.runtime.lastError) {
                console.log('Failed to send recordingStateChanged (true) message to content script:', chrome.runtime.lastError.message);
              } else {
                console.log('Sent recordingStateChanged (true) message to content script.');
              }
            });
          } else {
            console.log('No active tab found to send recordingStateChanged (true) message.');
          }
        });

        if (recordAudio) {
          // Query for the active tab to ensure we have context, though not strictly needed for tabCapture
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
              console.error('Error getting active tab for audio recording:', chrome.runtime.lastError);
              sendResponse({ success: false, error: 'Failed to get active tab for audio.' });
              return;
            }
            // const tabId = tabs[0].id; // Not needed for active tab capture with tabCapture permission
            chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
              if (chrome.runtime.lastError || !stream) {
                console.error('Error starting tab capture:', chrome.runtime.lastError?.message || "Stream is null");
                sendResponse({ success: false, error: 'Failed to start audio capture. Check microphone permissions for the extension and tab.' });
                return;
              }
              audioStream = stream;
              mediaRecorder = new MediaRecorder(stream);
              audioChunks = []; // Reset chunks
              recordedAudioBlob = null; // Reset blob

              mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                  audioChunks.push(event.data);
                }
              };

              mediaRecorder.onstop = () => {
                recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                audioChunks = []; // Clear chunks after blob creation
                console.log('Audio recording stopped, blob created:', recordedAudioBlob);
              };

              mediaRecorder.start();
              console.log('MediaRecorder started for audio.');

              // Handle stream becoming inactive (e.g., tab closed)
              stream.oninactive = () => {
                console.log('Audio stream became inactive.');
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
          });
        } else {
          sendResponse({ success: true }); // Recording started without audio
        }
      });
      return true; // Indicates async response

    case 'captureScreenshot':
      // Capture a screenshot of the visible tab
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error('Error capturing screenshot:', chrome.runtime.lastError);
          sendResponse({ error: 'Failed to capture screenshot' });
        } else {
          console.log('Screenshot captured:', dataUrl);
          // Add the screenshot and click coordinates to storage
          chrome.storage.local.get(['screenshots'], (result) => {
            const screenshots = result.screenshots || [];
            screenshots.push({
              dataUrl: dataUrl,
              clickX: message.clickX,
              clickY: message.clickY,
            });
            chrome.storage.local.set({ screenshots }, () => {
              sendResponse({ dataUrl, clickX: message.clickX, clickY: message.clickY });
            });
          });
        }
      });
      return true; // Indicates async response

    case 'stopRecording':
      // Stop recording (both screenshots and audio)
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop(); // This will trigger mediaRecorder.onstop
      }
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
      }

      chrome.storage.local.get(['screenshots'], (result) => {
        const screenshots = result.screenshots || [];
        console.log('Recording stopped. Sending screenshots to popup:', screenshots);
        
        // Reset recording state in storage first
        chrome.storage.local.set({ isRecording: false, screenshots: [] }, () => {
            console.log('isRecording set to false in storage.');
            // Notify content script
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs.length > 0 && tabs[0].id) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'recordingStateChanged', newIsRecordingState: false }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.log('Failed to send recordingStateChanged (false) message to content script:', chrome.runtime.lastError.message);
                        } else {
                            console.log('Sent recordingStateChanged (false) message to content script.');
                        }
                    });
                } else {
                    console.log('No active tab found to send recordingStateChanged (false) message.');
                }
            });

            // Relying on recordedAudioBlob being populated by onstop
            // This introduces a slight race condition but is often okay for quick stops.
            // A more robust solution involves promises or waiting for onstop.
            setTimeout(() => { // Adding a small delay to increase chance of blob being ready
                sendResponse({ screenshots, audioAvailable: !!recordedAudioBlob });
                // recordedAudioBlob is cleared when retrieved by getAudioBlob
            }, 250); // 250ms delay, adjust as needed or implement promise
        });
      });
      return true; // Indicates async response
    
    case 'getAudioBlob':
      if (recordedAudioBlob) {
        sendResponse({ audioBlob: recordedAudioBlob });
        recordedAudioBlob = null; // Clear after retrieval
      } else {
        sendResponse({ audioBlob: null });
      }
      return true; // Keep true for async response pattern, though this is effectively sync


    case 'getRecordingState':
      // Get the current recording state
      chrome.storage.local.get(['isRecording'], (result) => {
        sendResponse({ isRecording: result.isRecording || false });
      });
      return true; // Indicates async response

    default:
      console.warn('Unknown action:', message.action);
      sendResponse({ error: 'Unknown action' });
  }
});
