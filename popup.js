let screenshots = [];

document.getElementById('startRecording').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'startRecording' });
  document.getElementById('startRecording').disabled = true;
  document.getElementById('stopRecording').disabled = false;
});

document.getElementById('stopRecording').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopRecording' }, (response) => {
    screenshots = response.screenshots;
    showEditInterface();
  });
});

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

function showEditInterface() {
  document.getElementById('recordingSection').style.display = 'none';
  document.getElementById('editSection').style.display = 'block';

  const pagePreviews = document.getElementById('pagePreviews');
  pagePreviews.innerHTML = '';

  screenshots.forEach((screenshot, index) => {
    const pagePreview = document.createElement('div');
    pagePreview.className = 'page-preview';
    pagePreview.dataset.index = index;

    const img = document.createElement('img');
    img.src = screenshot.dataUrl;
    pagePreview.appendChild(img);

    const annotationInput = document.createElement('input');
    annotationInput.type = 'text';
    annotationInput.className = 'annotation-input';
    annotationInput.placeholder = 'Add annotation...';
    pagePreview.appendChild(annotationInput);

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete Page';
    deleteButton.addEventListener('click', () => {
      pagePreview.classList.toggle('deleted');
    });
    pagePreview.appendChild(deleteButton);

    pagePreviews.appendChild(pagePreview);
  });
}

function generatePDF(screenshots) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  screenshots.forEach((screenshot, index) => {
    if (index > 0) pdf.addPage();
    pdf.addImage(screenshot.dataUrl, 'PNG', 10, 10, 180, 0);
    pdf.circle(screenshot.clickX, screenshot.clickY, 5, 'F');

    // Add annotation text below the image
    if (screenshot.annotation) {
      pdf.setFontSize(12);
      pdf.text(screenshot.annotation, 10, 200); // Adjust position as needed
    }
  });

  pdf.save('TTL_Recording.pdf');
}
