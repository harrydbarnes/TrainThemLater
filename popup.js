// Check recording state when the popup loads
chrome.storage.local.get(['isRecording'], (result) => {
  const isRecording = result.isRecording || false;
  updateUI(isRecording);
});

// Update the UI based on the recording state
function updateUI(isRecording) {
  document.getElementById('startRecording').disabled = isRecording;
  document.getElementById('stopRecording').disabled = !isRecording;
  if (isRecording) {
    document.getElementById('status').textContent = 'Recording...';
  } else {
    document.getElementById('status').textContent = 'Recording stopped.';
  }
}

// Start Recording button
document.getElementById('startRecording').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'startRecording' }, (response) => {
    if (response.success) {
      updateUI(true);
    }
  });
});

// Stop Recording button
document.getElementById('stopRecording').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopRecording' }, (response) => {
    if (response.screenshots) {
      updateUI(false);
      showEditInterface(response.screenshots);
    }
  });
});

// Save PDF button
document.getElementById('savePDF').addEventListener('click', () => {
  const pagesToKeep = Array.from(document.querySelectorAll('.page-preview'))
    .filter((preview) => !preview.classList.contains('deleted'))
    .map((preview) => preview.dataset.index);

  const filteredScreenshots = screenshots.filter((_, index) => pagesToKeep.includes(index.toString()));

  // Collect annotations
  filteredScreenshots.forEach((screenshot, index) => {
    const annotationInput = document.querySelector(`.page-preview[data-index="${index}"] .annotation-input`);
    screenshot.annotation = annotationInput ? annotationInput.value : '';
  });

  generatePDF(filteredScreenshots);
});

// Show the editing interface
function showEditInterface(screenshots) {
  document.getElementById('recordingSection').style.display = 'none';
  document.getElementById('editSection').style.display = 'block';

  const pagePreviews = document.getElementById('pagePreviews');
  pagePreviews.innerHTML = '';

  screenshots.forEach((screenshot, index) => {
    const pagePreview =
