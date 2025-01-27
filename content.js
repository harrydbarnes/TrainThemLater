let isRecording = false;
let screenshots = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startRecording') {
    isRecording = true;
    screenshots = [];
  } else if (message.action === 'stopRecording') {
    isRecording = false;
    chrome.runtime.sendMessage({ action: 'generatePDF', screenshots });
  }
});

document.addEventListener('click', (event) => {
  if (isRecording) {
    const clickX = event.clientX;
    const clickY = event.clientY;

    chrome.runtime.sendMessage({ action: 'captureScreenshot', clickX, clickY }, (response) => {
      screenshots.push(response);
    });
  }
});
