// At the top of popup.js
let currentScreenshots = []; // To store screenshots for editing
let drawingEnabled = false; // Master switch for drawing mode
let currentDrawingTool = 'none'; // 'highlighter', 'circle', or 'crop'
let isDrawing = false;
let startX, startY;
let activeCanvas = null; // Reference to the canvas currently being drawn on
let activeScreenshotIndex = -1; // Index of the screenshot for the activeCanvas


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
  const shouldRecordAudio = document.getElementById('recordAudioCheckbox').checked;
  chrome.runtime.sendMessage({ action: 'startRecording', recordAudio: shouldRecordAudio }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error starting recording:", chrome.runtime.lastError.message);
      // Optionally, update UI to reflect error
      return;
    }
    if (response && response.success) {
      updateUI(true);
    }
  });
});

// Stop Recording button
document.getElementById('stopRecording').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopRecording' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error stopping recording:", chrome.runtime.lastError.message);
      // Optionally, update UI to reflect error
      return;
    }
    if (response) { // response will be { screenshots, audioAvailable }
      updateUI(false);
      if (response.audioAvailable) {
        document.getElementById('downloadAudioButton').style.display = 'block';
      } else {
        document.getElementById('downloadAudioButton').style.display = 'none';
      }
      // Ensure screenshots are cloned if they are directly from a message response
      // to avoid issues if the original object is modified elsewhere or is read-only.
      showEditInterface(response.screenshots ? response.screenshots.map(s => ({...s})) : []);
    }
  });
});

// Save PDF button
document.getElementById('savePDF').addEventListener('click', () => {
  const filteredScreenshots = [];
  currentScreenshots.forEach((screenshot, originalIndex) => {
    const previewDiv = document.querySelector(`.page-preview[data-index="${originalIndex}"]`);
    if (previewDiv && !previewDiv.classList.contains('deleted')) {
      // Annotation is already up-to-date in currentScreenshots via oninput
      filteredScreenshots.push(screenshot);
    }
  });

  if (filteredScreenshots.length > 0) {
    generatePDF(filteredScreenshots);
  } else {
    // Handle case with no pages to save, maybe show a message
    console.log("No pages to save.");
    // Optionally, switch back to recording section or show a message in UI
    document.getElementById('recordingSection').style.display = 'block';
    document.getElementById('editSection').style.display = 'none';
    document.getElementById('status').textContent = 'No pages selected for PDF.';
  }
});

// Show the editing interface
function showEditInterface(screenshotsData) {
  currentScreenshots = screenshotsData.map((s, index) => ({
    ...s, // spread existing properties like dataUrl, clickX, clickY
    annotation: s.annotation || '', // Ensure annotation property exists
    drawings: s.drawings || [], // Initialize drawings array
    cropRegion: s.cropRegion || null, // Initialize cropRegion
    originalIndex: index // Keep track of original index if needed, though data-index serves this
  }));

  document.getElementById('recordingSection').style.display = 'none';
  document.getElementById('editSection').style.display = 'block';
  // Reset drawing mode when showing edit interface
  drawingEnabled = false;
  currentDrawingTool = 'none';
  updateDrawingToolButtons();


  const pagePreviews = document.getElementById('pagePreviews');
  pagePreviews.innerHTML = ''; // Clear existing previews

  currentScreenshots.forEach((screenshot, originalIndex) => {
    const pagePreviewDiv = document.createElement('div');
    pagePreviewDiv.className = 'page-preview';
    pagePreviewDiv.dataset.index = originalIndex;

    const imgElement = document.createElement('img');
    imgElement.src = screenshot.dataUrl;

    const canvas = document.createElement('canvas');
    // Style canvas for absolute positioning
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    // canvas.style.cursor will be set by drawingEnabled state change

    pagePreviewDiv.appendChild(imgElement);
    pagePreviewDiv.appendChild(canvas); // Add canvas to DOM

    imgElement.onload = () => {
      canvas.width = imgElement.clientWidth;
      canvas.height = imgElement.clientHeight;
      // Store canvas and context with the previewDiv for easy access if needed
      pagePreviewDiv.canvas = canvas;

      // Store preview dimensions on the screenshot object
      const ssObject = currentScreenshots.find(s => s.originalIndex === originalIndex);
      if (ssObject) {
          ssObject.previewWidth = imgElement.clientWidth;
          ssObject.previewHeight = imgElement.clientHeight;
      }
      
      // Redraw existing drawings and crop
      if (screenshot.drawings || screenshot.cropRegion) {
          redrawCanvas(canvas, screenshot.drawings, screenshot.cropRegion);
      }
    };
    
    // Canvas Event Listeners
    canvas.addEventListener('mousedown', (event) => {
      if (!drawingEnabled || currentDrawingTool === 'none') return;
      activeCanvas = canvas;
      activeScreenshotIndex = originalIndex;
      isDrawing = true;
      const rect = canvas.getBoundingClientRect();
      startX = event.clientX - rect.left;
      startY = event.clientY - rect.top;
      // Prevent default action if drawing, e.g., text selection
      event.preventDefault(); 
    });

    canvas.addEventListener('mousemove', (event) => {
      if (!isDrawing || !activeCanvas || activeCanvas !== canvas) return;
      
      const rect = activeCanvas.getBoundingClientRect();
      const currentX = event.clientX - rect.left;
      const currentY = event.clientY - rect.top;

      if (currentDrawingTool === 'crop') {
        const currentDrawings = currentScreenshots[activeScreenshotIndex].drawings;
        const currentCrop = currentScreenshots[activeScreenshotIndex].cropRegion; // This will be null while defining a new crop
        redrawCanvas(activeCanvas, currentDrawings, currentCrop, true); // Pass true for isTemporaryDrawing
        const tempCropRect = { 
            x: Math.min(startX, currentX), 
            y: Math.min(startY, currentY), 
            width: Math.abs(currentX - startX), 
            height: Math.abs(currentY - startY) 
        };
        drawTemporaryCropVisual(activeCanvas.getContext('2d'), tempCropRect);
      } else { // highlighter or circle
        const ctx = activeCanvas.getContext('2d');
        // Redraw existing drawings and crop (if any) before drawing temporary shape
        redrawCanvas(activeCanvas, currentScreenshots[activeScreenshotIndex].drawings, currentScreenshots[activeScreenshotIndex].cropRegion);
        
        if (currentDrawingTool === 'highlighter') {
            ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
            ctx.fillRect(startX, startY, currentX - startX, currentY - startY);
        } else if (currentDrawingTool === 'circle') {
            const dX = currentX - startX;
            const dY = currentY - startY;
            const radius = Math.sqrt(dX*dX + dY*dY) / 2;
            const centerX = startX + dX/2;
            const centerY = startY + dY/2;
            
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
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
        if (finalCropRect.width > 0 && finalCropRect.height > 0) {
            currentScreenshots[activeScreenshotIndex].cropRegion = finalCropRect;
        } else {
            currentScreenshots[activeScreenshotIndex].cropRegion = null; // Or keep existing if any
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
      
      isDrawing = false; // Reset isDrawing before redraw for final state
      redrawCanvas(activeCanvas, currentScreenshots[activeScreenshotIndex].drawings, currentScreenshots[activeScreenshotIndex].cropRegion);
      activeCanvas = null;
      activeScreenshotIndex = -1;
    });
    
    canvas.addEventListener('mouseleave', (event) => {
        if (isDrawing && activeCanvas === canvas) {
            const rect = activeCanvas.getBoundingClientRect();
            const endX = event.clientX - rect.left;
            const endY = event.clientY - rect.top;

            if (currentDrawingTool === 'crop') {
                const finalCropRect = { 
                    x: Math.min(startX, endX), y: Math.min(startY, endY), 
                    width: Math.abs(endX - startX), height: Math.abs(endY - startY) 
                };
                if (finalCropRect.width > 0 && finalCropRect.height > 0) {
                    currentScreenshots[activeScreenshotIndex].cropRegion = finalCropRect;
                } else {
                    currentScreenshots[activeScreenshotIndex].cropRegion = null;
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
            
            isDrawing = false; // Reset before redraw
            redrawCanvas(activeCanvas, currentScreenshots[activeScreenshotIndex].drawings, currentScreenshots[activeScreenshotIndex].cropRegion);
            activeCanvas = null;
            activeScreenshotIndex = -1;
        }
    });


    const annotationInput = document.createElement('textarea');
    annotationInput.className = 'annotation-input';
    annotationInput.value = screenshot.annotation; // Pre-fill
    annotationInput.placeholder = "Add annotation...";
    annotationInput.oninput = () => {
      currentScreenshots[originalIndex].annotation = annotationInput.value;
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Delete Page';
    deleteBtn.onclick = () => {
      pagePreviewDiv.classList.add('deleted');
    };

    const clearDrawingsBtn = document.createElement('button');
    clearDrawingsBtn.textContent = 'Clear Drawings';
    clearDrawingsBtn.style.fontSize = '12px'; // Match delete button
    clearDrawingsBtn.style.backgroundColor = '#6c757d';
    clearDrawingsBtn.style.color = 'white';
    clearDrawingsBtn.style.border = 'none';
    clearDrawingsBtn.style.padding = '5px 10px';
    clearDrawingsBtn.style.borderRadius = '3px';
    clearDrawingsBtn.style.cursor = 'pointer';
    clearDrawingsBtn.style.marginTop = '5px';


    clearDrawingsBtn.onclick = () => {
      if(currentScreenshots[originalIndex]){
        currentScreenshots[originalIndex].drawings = [];
        redrawCanvas(canvas, [], currentScreenshots[originalIndex].cropRegion); // Pass cropRegion
      }
    };

    const clearCropBtn = document.createElement('button');
    clearCropBtn.textContent = 'Clear Crop';
    clearCropBtn.style.cssText = clearDrawingsBtn.style.cssText; // Reuse style
    clearCropBtn.style.backgroundColor = '#ffc107'; // A different color for clear crop
    clearCropBtn.style.color = 'black';


    clearCropBtn.onclick = () => {
      if(currentScreenshots[originalIndex]){
        currentScreenshots[originalIndex].cropRegion = null;
        redrawCanvas(canvas, currentScreenshots[originalIndex].drawings, null);
      }
    };

    pagePreviewDiv.appendChild(annotationInput);
    pagePreviewDiv.appendChild(deleteBtn);
    pagePreviewDiv.appendChild(clearDrawingsBtn); 
    pagePreviewDiv.appendChild(clearCropBtn); // Add new button
    pagePreviews.appendChild(pagePreviewDiv);
  });
}

// RedrawCanvas Function
function redrawCanvas(canvas, drawings, cropRegion, isTemporaryDrawing = false) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const imgElement = canvas.parentElement.querySelector('img');
  if (!imgElement) {
    console.error("Image element not found for canvas", canvas);
    return;
  }

  // If a crop region is defined and we are not in a temporary drawing state (like defining the crop)
  if (cropRegion && !isTemporaryDrawing) {
    ctx.save();
    // Draw the original image first, then apply effects around/for the crop
    // This ensures the crop region is part of the original image content
    // ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height); // Not needed if img is behind canvas

    // Fill the entire canvas with a semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Clear the crop region to show the image underneath
    ctx.clearRect(cropRegion.x, cropRegion.y, cropRegion.width, cropRegion.height);
    
    // Optional: Draw a border around the crop region
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cropRegion.x, cropRegion.y, cropRegion.width, cropRegion.height);
    
    ctx.restore(); // Resets fillStyle, strokeStyle, lineWidth
  } else if (cropRegion && isTemporaryDrawing) {
    // When isTemporaryDrawing is true (meaning we are actively drawing a crop rectangle),
    // we want the underlying image to be fully visible, and the temporary crop visual
    // will be drawn by drawTemporaryCropVisual. So, do nothing here to obscure image.
  } else {
    // No crop region, or it's a temporary drawing of something else (not crop)
    // The canvas is clear, image behind shows through.
  }

  // Draw existing drawings (highlights, circles)
  // These should be drawn on top of the crop effect.
  (drawings || []).forEach(drawing => {
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
  });
}

// drawTemporaryCropVisual Function
function drawTemporaryCropVisual(ctx, tempRect) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; // Bright, dashed border
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(tempRect.x, tempRect.y, tempRect.width, tempRect.height);
  ctx.setLineDash([]); // Reset line dash
  ctx.restore();
}


// Helper function to get image dimensions
function getImageDimensions(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.src = dataUrl;
  });
}

async function generatePDF(screenshotsToProcess) {
  // Ensure jsPDF is loaded (this check is already here, just for context)
  if (!window.jspdf || !window.jspdf.jsPDF) {
    console.error("jsPDF library is not loaded.");
    alert("Error: jsPDF library is not loaded. Cannot generate PDF.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const margin = 10;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeightInPdf = pdf.internal.pageSize.getHeight(); // Renamed for clarity from availableHeight
  const contentWidth = pageWidth - 2 * margin;
  // const contentHeight = pageHeightInPdf - 2 * margin; // Less critical for image height, more for text

  try {
    for (let i = 0; i < screenshotsToProcess.length; i++) {
      const screenshot = screenshotsToProcess[i];
      let currentY = margin; // Reset Y for each page's content starting point

      // A. Load Original Image & Get Dimensions
      const originalImage = new Image();
      originalImage.src = screenshot.dataUrl;
      try {
          await new Promise((resolve, reject) => {
              originalImage.onload = resolve;
              originalImage.onerror = (err) => {
                console.error("Image load error object:", err);
                reject(new Error("Failed to load image for PDF processing."));
              };
          });
      } catch (error) {
          console.error("Error loading original image for PDF for screenshot index " + i + ":", error.message);
          if (i > 0) pdf.addPage(); // Ensure new page for error message if not first page
          pdf.text("Error loading image.", margin, currentY);
          currentY += 10; 
          continue; // Skip to next screenshot
      }
      const originalWidth = originalImage.naturalWidth;
      const originalHeight = originalImage.naturalHeight;

      // B. Prepare Source Canvas (Off-screen Canvas)
      const sourceCanvas = document.createElement('canvas');
      const sourceCtx = sourceCanvas.getContext('2d');
      
      let sX = 0, sY = 0, sWidth = originalWidth, sHeight = originalHeight; // Source region from original image
      let dX = 0, dY = 0, dWidth = originalWidth, dHeight = originalHeight; // Destination region on sourceCanvas

      const previewWidth = screenshot.previewWidth || originalWidth;
      const previewHeight = screenshot.previewHeight || originalHeight;

      if (screenshot.cropRegion && screenshot.cropRegion.width > 0 && screenshot.cropRegion.height > 0) {
          sX = screenshot.cropRegion.x * (originalWidth / previewWidth);
          sY = screenshot.cropRegion.y * (originalHeight / previewHeight);
          sWidth = screenshot.cropRegion.width * (originalWidth / previewWidth);
          sHeight = screenshot.cropRegion.height * (originalHeight / previewHeight);

          sX = Math.max(0, Math.min(sX, originalWidth - 1));
          sY = Math.max(0, Math.min(sY, originalHeight - 1));
          sWidth = Math.max(1, Math.min(sWidth, originalWidth - sX));
          sHeight = Math.max(1, Math.min(sHeight, originalHeight - sY));
          
          sourceCanvas.width = sWidth;
          sourceCanvas.height = sHeight;
          dWidth = sWidth;
          dHeight = sHeight;
      } else {
          sourceCanvas.width = originalWidth;
          sourceCanvas.height = originalHeight;
      }
      sourceCtx.drawImage(originalImage, sX, sY, sWidth, sHeight, dX, dY, dWidth, dHeight);

      // C. Apply Drawings to sourceCanvas
      if (screenshot.drawings && screenshot.drawings.length > 0) {
          const drawScaleX = sourceCanvas.width / previewWidth;
          const drawScaleY = sourceCanvas.height / previewHeight;
          screenshot.drawings.forEach(drawing => {
              if (drawing.type === 'rect') {
                  sourceCtx.fillStyle = drawing.color;
                  sourceCtx.fillRect(drawing.x * drawScaleX, drawing.y * drawScaleY, drawing.width * drawScaleX, drawing.height * drawScaleY);
              } else if (drawing.type === 'circle') {
                  sourceCtx.strokeStyle = drawing.color;
                  sourceCtx.lineWidth = (drawing.strokeWidth || 2) * Math.min(drawScaleX, drawScaleY);
                  sourceCtx.beginPath();
                  sourceCtx.arc(drawing.cx * drawScaleX, drawing.cy * drawScaleY, drawing.radius * Math.min(drawScaleX, drawScaleY), 0, 2 * Math.PI);
                  sourceCtx.stroke();
              }
          });
      }

      // D. Get dataURL from sourceCanvas
      const processedImageDataUrl = sourceCanvas.toDataURL('image/png');

      // E. Add Image to PDF
      if (i > 0) {
        pdf.addPage();
      }
      
      let imageWidthInPdf = contentWidth;
      let imageHeightInPdf = (sourceCanvas.height / sourceCanvas.width) * imageWidthInPdf;
      const maxImageHeightInPdf = pageHeightInPdf * 0.75; // Max 75% of page height for image

      if (imageHeightInPdf > maxImageHeightInPdf) {
          imageHeightInPdf = maxImageHeightInPdf;
          imageWidthInPdf = (sourceCanvas.width / sourceCanvas.height) * imageHeightInPdf;
      }
      // Center image on PDF page if its width is less than contentWidth
      let imageXPositionInPdf = margin;
      if (imageWidthInPdf < contentWidth) {
          imageXPositionInPdf = margin + (contentWidth - imageWidthInPdf) / 2;
      }
      
      let imageYPositionInPdf = margin; // Reset Y for each new page's image
      pdf.addImage(processedImageDataUrl, 'PNG', imageXPositionInPdf, imageYPositionInPdf, imageWidthInPdf, imageHeightInPdf);
      currentY = imageYPositionInPdf + imageHeightInPdf + 5; // Update currentY for text annotations

      // F. Add Text Annotations
      if (screenshot.annotation && screenshot.annotation.trim() !== "") {
        pdf.setFontSize(10);
        const textLines = pdf.splitTextToSize(screenshot.annotation, contentWidth);
        
        const textHeight = textLines.length * (pdf.getFontSize() / pdf.internal.scaleFactor * 1.2); // Approximate height
        if (currentY + textHeight > pageHeightInPdf - margin) {
          // If text overflows, add a new page for the text
          // This is a simplified overflow handling; might need refinement for very long texts
          console.warn("Annotation for page", i+1, "may overflow and create a new page just for text.");
          pdf.addPage();
          currentY = margin; // Reset Y for new page
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
    // Reset UI regardless of success or failure
    document.getElementById('recordingSection').style.display = 'block';
    document.getElementById('editSection').style.display = 'none';
    document.getElementById('downloadAudioButton').style.display = 'none'; // Hide audio button
    updateUI(false); // Reset to initial state (buttons, status message)
    currentScreenshots = []; // Clear screenshots
    document.getElementById('pagePreviews').innerHTML = ''; // Clear previews
  }
}

// Download Audio Button Event Listener
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
  // Update cursor for all canvases
  const canvases = document.querySelectorAll('.page-preview canvas');
  canvases.forEach(c => c.style.cursor = drawingEnabled ? 'crosshair' : 'default');

  if (!drawingEnabled) {
    currentDrawingTool = 'none'; // Reset tool if drawing is disabled
    // Potentially clear activeCanvas selection if needed, though mouseup/leave should handle it
    isDrawing = false; 
    activeCanvas = null;
    activeScreenshotIndex = -1;
  }
   // Update button text/state
  document.getElementById('enableDrawingMode').textContent = drawingEnabled ? 'Disable Drawing' : 'Enable Drawing';
  document.getElementById('enableDrawingMode').classList.toggle('active', drawingEnabled);
});

document.getElementById('toolHighlighter').addEventListener('click', () => {
  if (drawingEnabled) {
    currentDrawingTool = 'highlighter';
    updateActiveToolButton('toolHighlighter');
  }
});

document.getElementById('toolCircle').addEventListener('click', () => {
  if (drawingEnabled) {
    currentDrawingTool = 'circle';
    updateActiveToolButton('toolCircle');
  }
});

document.getElementById('toolCrop').addEventListener('click', () => {
  if (drawingEnabled) {
    currentDrawingTool = 'crop';
    updateActiveToolButton('toolCrop');
  }
});


function updateDrawingToolButtons() {
  const highlighterBtn = document.getElementById('toolHighlighter');
  const circleBtn = document.getElementById('toolCircle');
  const cropBtn = document.getElementById('toolCrop');

  highlighterBtn.disabled = !drawingEnabled;
  circleBtn.disabled = !drawingEnabled;
  cropBtn.disabled = !drawingEnabled;

  if (!drawingEnabled) {
    highlighterBtn.classList.remove('active');
    circleBtn.classList.remove('active');
    cropBtn.classList.remove('active');
  } else {
    // If drawing is enabled, reflect the currentDrawingTool
    let activeId = null;
    if (currentDrawingTool === 'highlighter') activeId = 'toolHighlighter';
    else if (currentDrawingTool === 'circle') activeId = 'toolCircle';
    else if (currentDrawingTool === 'crop') activeId = 'toolCrop';
    updateActiveToolButton(activeId);
  }
}

function updateActiveToolButton(activeButtonId) {
  document.getElementById('toolHighlighter').classList.remove('active');
  document.getElementById('toolCircle').classList.remove('active');
  document.getElementById('toolCrop').classList.remove('active');
  if (activeButtonId) {
    const btn = document.getElementById(activeButtonId);
    if(btn) btn.classList.add('active');
  }
}

// Initialize tool buttons state on load (e.g. after edit section is shown)
// This is implicitly handled by showEditInterface resetting drawingEnabled.
