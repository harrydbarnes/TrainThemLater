// At the top of popup.js
let currentScreenshots = [];
let drawingEnabled = false;
let currentDrawingTool = 'none';
let isDrawing = false;
let startX, startY;
let activeCanvas = null;
let activeScreenshotIndex = -1;

// UI Sections
const initialSection = document.getElementById('initialSection');
const recordingSection = document.getElementById('recordingSection');
const editSection = document.getElementById('editSection');
const statusDiv = document.getElementById('status'); // Shared status div, or specific ones if needed.

// Initial UI state: Show "Let's Record"
initialSection.style.display = 'block';
recordingSection.style.display = 'none';
editSection.style.display = 'none';


// "Let's Record" button
document.getElementById('showRecordButtons').addEventListener('click', () => {
  initialSection.style.display = 'none';
  recordingSection.style.display = 'block';
  statusDiv.textContent = 'Click Start Recording on the page.'; // Update status for recording section
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0 && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'showOverlayButtons' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Failed to send showOverlayButtons to content script:', chrome.runtime.lastError.message);
        }
      });
    }
  });
  // Check recording state from background to correctly set button states in recordingSection
  chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
    if (response && response.isRecording !== undefined) {
      updateUIRecordingSection(response.isRecording);
    }
  });
});


// Function to update buttons in the recording section
function updateUIRecordingSection(isRec) {
  document.getElementById('startRecording').disabled = isRec;
  document.getElementById('stopRecording').disabled = !isRec;
  const recStatusDiv = recordingSection.querySelector('#status'); // Assuming status div is inside recordingSection now
  if (recStatusDiv) {
    recStatusDiv.textContent = isRec ? 'Recording...' : 'Recording stopped.';
  }
}

// Start Recording button (in popup, delegates to content script's overlay button)
document.getElementById('startRecording').addEventListener('click', () => {
  const shouldRecordAudio = document.getElementById('recordAudioCheckbox').checked;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0 && tabs[0].id) {
      // Instruct content script to "click" its start button
      chrome.tabs.sendMessage(tabs[0].id, { action: 'triggerStartRecording', recordAudio: shouldRecordAudio });
    }
  });
  updateUIRecordingSection(true); // Optimistically update UI
});

// Stop Recording button (in popup, delegates to content script's overlay button)
document.getElementById('stopRecording').addEventListener('click', () => {
   chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0 && tabs[0].id) {
      // Instruct content script to "click" its stop button
      chrome.tabs.sendMessage(tabs[0].id, { action: 'triggerStopRecording' });
    }
  });
  updateUIRecordingSection(false); // Optimistically update UI
  // The actual handling of screenshots will be done when 'showEditInterfaceMessage' is received
});


// Listen for messages from background script (e.g., when recording actually stops)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showEditInterfaceMessage') {
    console.log("Received screenshots for editing:", message.data.screenshots);
    if (message.data.audioAvailable) {
        document.getElementById('downloadAudioButton').style.display = 'block';
    } else {
        document.getElementById('downloadAudioButton').style.display = 'none';
    }
    showEditInterface(message.data.screenshots ? message.data.screenshots.map(s => ({...s})) : []);
    recordingSection.style.display = 'none'; // Hide recording section
    editSection.style.display = 'block';    // Show edit section
  } else if (message.action === 'recordingActuallyStarted') {
    updateUIRecordingSection(true);
  } else if (message.action === 'recordingActuallyStopped') {
    updateUIRecordingSection(false);
     // This message might also carry screenshot data if preferred over separate message
  }
});


// Back to Record Button
document.getElementById('backToRecord').addEventListener('click', () => {
  editSection.style.display = 'none';
  initialSection.style.display = 'block'; // Go back to the initial "Let's Record" screen
  statusDiv.textContent = 'Ready to record!';
  currentScreenshots = []; // Clear screenshots
  document.getElementById('pagePreviews').innerHTML = '';
  // Optionally, tell content script to hide overlay buttons if they are visible
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0 && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'hideOverlayButtons' });
    }
  });
});


// Save PDF button
document.getElementById('savePDF').addEventListener('click', () => {
  const filteredScreenshots = [];
  currentScreenshots.forEach((screenshot, originalIndex) => {
    const previewDiv = document.querySelector(`.page-preview[data-index="${originalIndex}"]`);
    if (previewDiv && !previewDiv.classList.contains('deleted')) {
      filteredScreenshots.push(screenshot);
    }
  });

  if (filteredScreenshots.length > 0) {
    generatePDF(filteredScreenshots);
  } else {
    console.log("No pages to save.");
    alert("No pages to save. Please ensure some pages are not marked as deleted.");
    // Stay in edit section for user to make changes or go back
  }
});

// Show the editing interface
function showEditInterface(screenshotsData) {
  currentScreenshots = screenshotsData.map((s, index) => ({
    ...s,
    annotation: s.annotation || '',
    drawings: s.drawings || [],
    cropRegion: s.cropRegion || null,
    originalIndex: index
  }));

  initialSection.style.display = 'none';
  recordingSection.style.display = 'none';
  editSection.style.display = 'block';
  drawingEnabled = false;
  currentDrawingTool = 'none';
  updateDrawingToolButtons();

  const pagePreviews = document.getElementById('pagePreviews');
  pagePreviews.innerHTML = '';

  if (currentScreenshots.length === 0) {
    pagePreviews.innerHTML = '<p>No screenshots were captured.</p>';
    return;
  }

  currentScreenshots.forEach((screenshot, originalIndex) => {
    const pagePreviewDiv = document.createElement('div');
    pagePreviewDiv.className = 'page-preview';
    pagePreviewDiv.dataset.index = originalIndex;

    const imgElement = document.createElement('img');
    imgElement.src = screenshot.dataUrl;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';

    pagePreviewDiv.appendChild(imgElement);
    pagePreviewDiv.appendChild(canvas);

    imgElement.onload = () => {
      canvas.width = imgElement.clientWidth; // Ensure canvas matches displayed image size
      canvas.height = imgElement.clientHeight;
      pagePreviewDiv.canvas = canvas;

      const ssObject = currentScreenshots.find(s => s.originalIndex === originalIndex);
      if (ssObject) {
          ssObject.previewWidth = imgElement.clientWidth;
          ssObject.previewHeight = imgElement.clientHeight;
      }
      
      redrawCanvas(canvas, screenshot.drawings, screenshot.cropRegion);
    };
    
    // Canvas Event Listeners (Copied from your existing code, ensure it's correct)
    canvas.addEventListener('mousedown', (event) => {
      if (!drawingEnabled || currentDrawingTool === 'none') return;
      activeCanvas = canvas;
      activeScreenshotIndex = originalIndex; // Use originalIndex
      isDrawing = true;
      const rect = canvas.getBoundingClientRect();
      startX = event.clientX - rect.left;
      startY = event.clientY - rect.top;
      event.preventDefault(); 
    });

    canvas.addEventListener('mousemove', (event) => {
      if (!isDrawing || !activeCanvas || activeCanvas !== canvas) return;
      
      const rect = activeCanvas.getBoundingClientRect();
      const currentX = event.clientX - rect.left;
      const currentY = event.clientY - rect.top;
      // Temp drawing logic from your code
      const tempDrawings = [...currentScreenshots[activeScreenshotIndex].drawings]; // Operate on a copy for temp
      let tempCrop = currentScreenshots[activeScreenshotIndex].cropRegion;

      if (currentDrawingTool === 'crop') {
        redrawCanvas(activeCanvas, tempDrawings, null, true); // Draw existing, no current crop, indicate temp
        tempCrop = { 
            x: Math.min(startX, currentX), 
            y: Math.min(startY, currentY), 
            width: Math.abs(currentX - startX), 
            height: Math.abs(currentY - startY) 
        };
        drawTemporaryCropVisual(activeCanvas.getContext('2d'), tempCrop);
      } else {
        redrawCanvas(activeCanvas, tempDrawings, tempCrop); // Redraw existing state
        const ctx = activeCanvas.getContext('2d');
        if (currentDrawingTool === 'highlighter') {
            ctx.fillStyle = 'rgba(255, 255, 0, 0.3)'; // Temp highlight color
            ctx.fillRect(startX, startY, currentX - startX, currentY - startY);
        } else if (currentDrawingTool === 'circle') {
            const dX = currentX - startX;
            const dY = currentY - startY;
            const radius = Math.sqrt(dX*dX + dY*dY) / 2;
            const centerX = startX + dX/2;
            const centerY = startY + dY/2;
            
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)'; // Temp circle color
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.stroke();
        }
      }
    });

    canvas.addEventListener('mouseup', (event) => {
      if (!isDrawing || !activeCanvas || activeCanvas !== canvas) return;
      
      const rect = activeCanvas.getBoundingClientRect();
      const endX = event.clientX - rect.left;
      const endY = event.clientY - rect.top;

      if (currentDrawingTool === 'crop') {
        const finalCropRect = { 
            x: Math.min(startX, endX), 
            y: Math.min(startY, endY), 
            width: Math.abs(endX - startX), 
            height: Math.abs(endY - startY) 
        };
        if (finalCropRect.width > 5 && finalCropRect.height > 5) { // Minimum crop size
            currentScreenshots[activeScreenshotIndex].cropRegion = finalCropRect;
        } else {
             // Do nothing or reset to null if desired, current logic keeps existing or null
        }
      } else if (currentDrawingTool === 'highlighter') {
        currentScreenshots[activeScreenshotIndex].drawings.push({ 
          type: 'rect', 
          x: Math.min(startX, endX), y: Math.min(startY, endY), 
          width: Math.abs(endX - startX), height: Math.abs(endY - startY), 
          color: 'rgba(255, 255, 0, 0.5)' 
        });
      } else if (currentDrawingTool === 'circle') {
        const dX = endX - startX;
        const dY = endY - startY;
        const radius = Math.max(1, Math.sqrt(dX*dX + dY*dY) / 2);
        currentScreenshots[activeScreenshotIndex].drawings.push({ 
          type: 'circle', 
          cx: startX + dX/2, cy: startY + dY/2, radius: radius, 
          color: 'rgba(255, 0, 0, 1)', strokeWidth: 2 
        });
      }
      
      isDrawing = false; 
      redrawCanvas(activeCanvas, currentScreenshots[activeScreenshotIndex].drawings, currentScreenshots[activeScreenshotIndex].cropRegion);
      activeCanvas = null;
      activeScreenshotIndex = -1;
    });
    
    canvas.addEventListener('mouseleave', (event) => { // Similar to mouseup for finishing drawing
        if (isDrawing && activeCanvas === canvas) {
            const rect = activeCanvas.getBoundingClientRect();
            const endX = event.clientX - rect.left; // Use clientX/Y for consistency
            const endY = event.clientY - rect.top;

             if (currentDrawingTool === 'crop') {
                const finalCropRect = { 
                    x: Math.min(startX, endX), y: Math.min(startY, endY), 
                    width: Math.abs(endX - startX), height: Math.abs(endY - startY) 
                };
                if (finalCropRect.width > 5 && finalCropRect.height > 5) {
                    currentScreenshots[activeScreenshotIndex].cropRegion = finalCropRect;
                }
            } else if (currentDrawingTool === 'highlighter') {
                currentScreenshots[activeScreenshotIndex].drawings.push({ 
                    type: 'rect', 
                    x: Math.min(startX, endX), y: Math.min(startY, endY), 
                    width: Math.abs(endX - startX), height: Math.abs(endY - startY), 
                    color: 'rgba(255, 255, 0, 0.5)' 
                });
            } else if (currentDrawingTool === 'circle') {
                const dX = endX - startX;
                const dY = endY - startY;
                const radius = Math.max(1, Math.sqrt(dX*dX + dY*dY) / 2);
                currentScreenshots[activeScreenshotIndex].drawings.push({ 
                    type: 'circle', 
                    cx: startX + dX/2, cy: startY + dY/2, radius: radius, 
                    color: 'rgba(255, 0, 0, 1)', strokeWidth: 2 
                });
            }
            
            isDrawing = false;
            redrawCanvas(activeCanvas, currentScreenshots[activeScreenshotIndex].drawings, currentScreenshots[activeScreenshotIndex].cropRegion);
            activeCanvas = null;
            activeScreenshotIndex = -1;
        }
    });

    const annotationInput = document.createElement('textarea');
    annotationInput.className = 'annotation-input';
    annotationInput.value = screenshot.annotation;
    annotationInput.placeholder = "Add annotation...";
    annotationInput.oninput = () => {
      currentScreenshots[originalIndex].annotation = annotationInput.value;
    };

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'preview-controls';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Delete Page';
    deleteBtn.onclick = () => {
      pagePreviewDiv.classList.toggle('deleted'); // Toggle deleted state
       // Update button text based on state
      deleteBtn.textContent = pagePreviewDiv.classList.contains('deleted') ? 'Undo Delete' : 'Delete Page';
      deleteBtn.style.backgroundColor = pagePreviewDiv.classList.contains('deleted') ? '#28a745' : '#ff4d4d'; // Green for undo, red for delete
    };

    const clearDrawingsBtn = document.createElement('button');
    clearDrawingsBtn.className = 'clear-btn'; // Use general clear style
    clearDrawingsBtn.textContent = 'Clear Drawings';
    clearDrawingsBtn.onclick = () => {
      if(currentScreenshots[originalIndex]){
        currentScreenshots[originalIndex].drawings = [];
        redrawCanvas(canvas, [], currentScreenshots[originalIndex].cropRegion);
      }
    };

    const clearCropBtn = document.createElement('button');
    clearCropBtn.className = 'clear-btn';
    clearCropBtn.textContent = 'Clear Crop';
    clearCropBtn.onclick = () => {
      if(currentScreenshots[originalIndex]){
        currentScreenshots[originalIndex].cropRegion = null;
        redrawCanvas(canvas, currentScreenshots[originalIndex].drawings, null);
      }
    };

    controlsDiv.appendChild(deleteBtn);
    controlsDiv.appendChild(clearDrawingsBtn); 
    controlsDiv.appendChild(clearCropBtn);

    pagePreviewDiv.appendChild(annotationInput);
    pagePreviewDiv.appendChild(controlsDiv); // Add controls div
    pagePreviews.appendChild(pagePreviewDiv);
  });
}

// RedrawCanvas Function - Ensure it handles cropRegion correctly
function redrawCanvas(canvas, drawings, cropRegion, isTemporaryDrawing = false) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // No need to redraw image on canvas if it's an <img> tag behind it.
  // If using canvas to display the image itself, you would drawImage here.

  if (cropRegion) {
    if (!isTemporaryDrawing) { // Final crop view
      ctx.save();
      // Darken area outside crop
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Clear the crop region itself
      ctx.clearRect(cropRegion.x, cropRegion.y, cropRegion.width, cropRegion.height);
      // Optional: Draw a border for the crop region
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; // White border for visibility
      ctx.lineWidth = 1;
      ctx.strokeRect(cropRegion.x, cropRegion.y, cropRegion.width, cropRegion.height);
      ctx.restore();
    } else {
      // During temporary drawing (e.g. dragging the crop box),
      // drawTemporaryCropVisual will handle the visual feedback.
    }
  }

  // Draw existing drawings (highlights, circles)
  (drawings || []).forEach(drawing => {
    ctx.save(); // Save context state before drawing each shape
    if (drawing.type === 'rect') {
      ctx.fillStyle = drawing.color;
      ctx.fillRect(drawing.x, drawing.y, drawing.width, drawing.height);
    } else if (drawing.type === 'circle') {
      ctx.strokeStyle = drawing.color;
      ctx.lineWidth = drawing.strokeWidth || 2;
      ctx.beginPath();
      ctx.arc(drawing.cx, drawing.cy, drawing.radius, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.restore(); // Restore context state
  });
}

// drawTemporaryCropVisual Function
function drawTemporaryCropVisual(ctx, tempRect) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; // Bright, dashed border
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(tempRect.x, tempRect.y, tempRect.width, tempRect.height);
  ctx.setLineDash([]);
  ctx.restore();
}


async function generatePDF(screenshotsToProcess) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    console.error("jsPDF library is not loaded.");
    alert("Error: jsPDF library is not loaded. Cannot generate PDF.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const margin = 10;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeightInPdf = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - 2 * margin;

  try {
    for (let i = 0; i < screenshotsToProcess.length; i++) {
      const screenshot = screenshotsToProcess[i];
      if (i > 0) {
        pdf.addPage();
      }
      let currentY = margin;

      const originalImage = new Image();
      originalImage.src = screenshot.dataUrl;
      try {
          await new Promise((resolve, reject) => {
              originalImage.onload = resolve;
              originalImage.onerror = (errEvent) => {
                  // errEvent is an Event, not an Error object. For more detail, one might need to
                  // wrap this in a try-catch if the error could be thrown before onerror.
                  console.error("Image load error event for screenshot " + i + ":", errEvent);
                  reject(new Error(`Failed to load image for PDF processing (index ${i}). Source: ${originalImage.src.substring(0,100)}...`));
              };
          });
      } catch (error) {
          console.error(error.message);
          pdf.text(`Error loading image for page ${i + 1}.`, margin, currentY);
          currentY += 10; 
          continue; 
      }
      
      const originalWidth = originalImage.naturalWidth;
      const originalHeight = originalImage.naturalHeight;

      const sourceCanvas = document.createElement('canvas');
      const sourceCtx = sourceCanvas.getContext('2d');
      
      let sX = 0, sY = 0, sWidth = originalWidth, sHeight = originalHeight;
      let dX = 0, dY = 0, dWidth = originalWidth, dHeight = originalHeight; // Destination on sourceCanvas

      const previewWidth = screenshot.previewWidth || originalWidth; // Fallback to original if preview not set
      const previewHeight = screenshot.previewHeight || originalHeight;


      if (screenshot.cropRegion && screenshot.cropRegion.width > 0 && screenshot.cropRegion.height > 0) {
          // Scale crop region from preview dimensions to original image dimensions
          sX = screenshot.cropRegion.x * (originalWidth / previewWidth);
          sY = screenshot.cropRegion.y * (originalHeight / previewHeight);
          sWidth = screenshot.cropRegion.width * (originalWidth / previewWidth);
          sHeight = screenshot.cropRegion.height * (originalHeight / previewHeight);

          // Ensure crop dimensions are within bounds of the original image
          sX = Math.max(0, Math.min(sX, originalWidth - 1));
          sY = Math.max(0, Math.min(sY, originalHeight - 1));
          sWidth = Math.max(1, Math.min(sWidth, originalWidth - sX)); // Ensure width is at least 1
          sHeight = Math.max(1, Math.min(sHeight, originalHeight - sY)); // Ensure height is at least 1
          
          sourceCanvas.width = sWidth;
          sourceCanvas.height = sHeight;
          // When drawing the cropped part to sourceCanvas, dX,dY are 0,0 and dWidth,dHeight are sWidth,sHeight
          dWidth = sWidth; 
          dHeight = sHeight;
      } else {
          sourceCanvas.width = originalWidth;
          sourceCanvas.height = originalHeight;
      }
      
      sourceCtx.drawImage(originalImage, sX, sY, sWidth, sHeight, dX, dY, dWidth, dHeight);

      if (screenshot.drawings && screenshot.drawings.length > 0) {
          // Adjust drawing coordinates based on the crop, if any.
          // And scale from preview dimensions to sourceCanvas dimensions (which might be cropped size or original size)
          const scaleXToSourceCanvas = sourceCanvas.width / (screenshot.cropRegion ? screenshot.cropRegion.width : previewWidth);
          const scaleYToSourceCanvas = sourceCanvas.height / (screenshot.cropRegion ? screenshot.cropRegion.height : previewHeight);
          const offsetX = screenshot.cropRegion ? -screenshot.cropRegion.x * scaleXToSourceCanvas : 0;
          const offsetY = screenshot.cropRegion ? -screenshot.cropRegion.y * scaleYToSourceCanvas : 0;


          screenshot.drawings.forEach(drawing => {
            sourceCtx.save();
            // Apply transformations to draw relative to the sourceCanvas content
            // The drawing coordinates are relative to the preview.
            // If cropped, they need to be translated as if the cropRegion's top-left is (0,0)
            // and then scaled to the sourceCanvas's (potentially cropped) dimensions.

            let drawingX = drawing.x;
            let drawingY = drawing.y;
            let drawingWidth = drawing.width;
            let drawingHeight = drawing.height;
            let drawingCx = drawing.cx;
            let drawingCy = drawing.cy;
            let drawingRadius = drawing.radius;


            if(screenshot.cropRegion){
                // Adjust coordinates to be relative to the crop region's top-left
                drawingX -= screenshot.cropRegion.x;
                drawingY -= screenshot.cropRegion.y;
                drawingCx -= screenshot.cropRegion.x;
                drawingCy -= screenshot.cropRegion.y;
                // Note: width, height, radius are scaled, not translated further by crop offset
            }


            if (drawing.type === 'rect') {
                sourceCtx.fillStyle = drawing.color;
                sourceCtx.fillRect(
                    drawingX * scaleXToSourceCanvas, 
                    drawingY * scaleYToSourceCanvas, 
                    drawingWidth * scaleXToSourceCanvas, 
                    drawingHeight * scaleYToSourceCanvas
                );
            } else if (drawing.type === 'circle') {
                sourceCtx.strokeStyle = drawing.color;
                sourceCtx.lineWidth = (drawing.strokeWidth || 2) * Math.min(scaleXToSourceCanvas, scaleYToSourceCanvas);
                sourceCtx.beginPath();
                sourceCtx.arc(
                    drawingCx * scaleXToSourceCanvas, 
                    drawingCy * scaleYToSourceCanvas, 
                    drawingRadius * Math.min(scaleXToSourceCanvas, scaleYToSourceCanvas), 
                    0, 2 * Math.PI
                );
                sourceCtx.stroke();
            }
            sourceCtx.restore();
          });
      }

      const processedImageDataUrl = sourceCanvas.toDataURL('image/png');
      
      let imageWidthInPdf = contentWidth;
      let imageHeightInPdf = (sourceCanvas.height / sourceCanvas.width) * imageWidthInPdf;
      const maxImageHeightInPdf = pageHeightInPdf * 0.70; // Max 70% for image to leave space for text

      if (imageHeightInPdf > maxImageHeightInPdf) {
          imageHeightInPdf = maxImageHeightInPdf;
          imageWidthInPdf = (sourceCanvas.width / sourceCanvas.height) * imageHeightInPdf;
      }
      let imageXPositionInPdf = margin + (contentWidth - imageWidthInPdf) / 2; // Center image
      
      pdf.addImage(processedImageDataUrl, 'PNG', imageXPositionInPdf, currentY, imageWidthInPdf, imageHeightInPdf);
      currentY += imageHeightInPdf + 5;

      if (screenshot.annotation && screenshot.annotation.trim() !== "") {
        pdf.setFontSize(10);
        const textLines = pdf.splitTextToSize(screenshot.annotation, contentWidth);
        const textBlockHeight = textLines.length * (pdf.getFontSize() * 0.352778 * 1.2); // mm approximation
        
        if (currentY + textBlockHeight > pageHeightInPdf - margin) {
          pdf.addPage();
          currentY = margin;
        }
        pdf.text(textLines, margin, currentY);
      }
    }
    pdf.save('training_guide.pdf');
    alert('PDF generated successfully!');
  } catch (error) {
    console.error("Error generating PDF:", error);
    alert("An error occurred while generating the PDF. Check console for details.");
  } finally {
    // Reset UI to initial state
    initialSection.style.display = 'block';
    recordingSection.style.display = 'none';
    editSection.style.display = 'none';
    document.getElementById('downloadAudioButton').style.display = 'none';
    const mainStatusDiv = document.getElementById('initialSection').querySelector('#status') || statusDiv;
    mainStatusDiv.textContent = 'Ready to record!';
    currentScreenshots = [];
    document.getElementById('pagePreviews').innerHTML = '';
  }
}

// Download Audio Button
document.getElementById('downloadAudioButton').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'getAudioBlob' }, (response) => {
    if (chrome.runtime.lastError) {
        console.error("Error getting audio blob:", chrome.runtime.lastError.message);
        alert('Error retrieving audio. Check console.');
        return;
    }
    if (response && response.audioBlob) {
      const audioURL = URL.createObjectURL(response.audioBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = audioURL;
      a.download = 'recorded_audio.webm';
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(audioURL);
      a.remove();
    } else {
      alert('No audio blob found or error retrieving it.');
    }
  });
});

// Tool Button Event Listeners
document.getElementById('enableDrawingMode').addEventListener('click', () => {
  drawingEnabled = !drawingEnabled;
  updateDrawingToolButtons();
  const canvases = document.querySelectorAll('.page-preview canvas');
  canvases.forEach(c => c.style.cursor = drawingEnabled ? 'crosshair' : 'default');

  if (!drawingEnabled) {
    currentDrawingTool = 'none';
    isDrawing = false; 
    activeCanvas = null;
    activeScreenshotIndex = -1;
  }
  document.getElementById('enableDrawingMode').textContent = drawingEnabled ? 'Disable Drawing' : 'Enable Drawing';
  document.getElementById('enableDrawingMode').classList.toggle('active', drawingEnabled);
});

document.getElementById('toolHighlighter').addEventListener('click', () => {
  if (drawingEnabled) {
    currentDrawingTool = (currentDrawingTool === 'highlighter' ? 'none' : 'highlighter');
    updateActiveToolButton(currentDrawingTool === 'highlighter' ? 'toolHighlighter' : null);
  }
});

document.getElementById('toolCircle').addEventListener('click', () => {
  if (drawingEnabled) {
    currentDrawingTool = (currentDrawingTool === 'circle' ? 'none' : 'circle');
    updateActiveToolButton(currentDrawingTool === 'circle' ? 'toolCircle' : null);
  }
});

document.getElementById('toolCrop').addEventListener('click', () => {
  if (drawingEnabled) {
    currentDrawingTool = (currentDrawingTool === 'crop' ? 'none' : 'crop');
    updateActiveToolButton(currentDrawingTool === 'crop' ? 'toolCrop' : null);
  }
});

function updateDrawingToolButtons() {
  const highlighterBtn = document.getElementById('toolHighlighter');
  const circleBtn = document.getElementById('toolCircle');
  const cropBtn = document.getElementById('toolCrop');

  [highlighterBtn, circleBtn, cropBtn].forEach(btn => {
    btn.disabled = !drawingEnabled;
    if (!drawingEnabled) btn.classList.remove('active');
  });
  
  if (drawingEnabled) {
    updateActiveToolButton(currentDrawingTool !== 'none' ? `tool${currentDrawingTool.charAt(0).toUpperCase() + currentDrawingTool.slice(1)}` : null);
  }
}


function updateActiveToolButton(activeButtonId) {
    ['toolHighlighter', 'toolCircle', 'toolCrop'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) { // Ensure button exists
            if (id === activeButtonId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
}
