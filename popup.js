// harrydbarnes/trainthemlater/TrainThemLater-main/popup.js
// At the top of popup.js
let currentScreenshots = [];
let drawingEnabled = false;
let currentDrawingTool = 'none';
let isDrawing = false;
let startX, startY;
let activeCanvas = null;
let activeScreenshotIndex = -1; // Will store originalIndex if needed for canvas operations

// UI Sections
const initialSection = document.getElementById('initialSection');
const recordingSection = document.getElementById('recordingSection');
const editSection = document.getElementById('editSection');
const statusDiv = document.getElementById('status'); // Shared status div in initialSection
const recordingStatusDiv = recordingSection.querySelector('#status'); // Status div in recordingSection


// Handle being opened in a new tab for editor view
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view') === 'editor') {
        console.log("Popup.js: Detected editor view from URL params.");
        chrome.storage.local.get('editorData', (result) => {
            if (chrome.runtime.lastError) {
                console.error("Popup.js: Error getting editorData from storage:", chrome.runtime.lastError.message);
                if (initialSection) initialSection.style.display = 'block';
                if (statusDiv) statusDiv.textContent = "Error loading editor data.";
                return;
            }
            if (result.editorData) {
                console.log("Popup.js: Editor data found in storage.", result.editorData);
                const data = result.editorData;
                const downloadAudioButton = document.getElementById('downloadAudioButton');
                if (downloadAudioButton) {
                    downloadAudioButton.style.display = data.audioAvailable ? 'block' : 'none';
                }

                // Ensure sections are correctly displayed
                if (initialSection) initialSection.style.display = 'none';
                if (recordingSection) recordingSection.style.display = 'none';
                if (editSection) editSection.style.display = 'block';
                
                showEditInterface(data.screenshots ? data.screenshots.map(s => ({...s})) : []);

            } else {
                console.warn("Popup.js: Editor view specified, but no editorData found in storage.");
                if (initialSection) initialSection.style.display = 'block';
                if (statusDiv) statusDiv.textContent = "Ready to record. No active edit session found.";
            }
        });
    } else {
        // Standard popup initialization
        console.log("Popup.js: Initializing as standard popup action.");
        if (initialSection) initialSection.style.display = 'block';
        if (recordingSection) recordingSection.style.display = 'none';
        if (editSection) editSection.style.display = 'none';
        if (statusDiv) statusDiv.textContent = 'Ready to record!';

        // Query background for current recording state to set UI correctly
        chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn("Popup.js: Error getting initial recording state:", chrome.runtime.lastError.message);
                return;
            }
            if (response) {
                // If already recording, directly show recording section (though controls are on page)
                if (response.isRecording) {
                    if (initialSection) initialSection.style.display = 'none';
                    if (recordingSection) recordingSection.style.display = 'block';
                    if (recordingStatusDiv) recordingStatusDiv.textContent = 'Recording active. Use overlay to stop.';
                }
            }
        });
    }
});


// "Let's Record" button
document.getElementById('showRecordButtons').addEventListener('click', () => {
  if (initialSection) initialSection.style.display = 'none';
  if (recordingSection) recordingSection.style.display = 'block';
  if (recordingStatusDiv) recordingStatusDiv.textContent = "Click 'Start Record' on the page overlay (bottom right).";

  const shouldRecordAudio = document.getElementById('recordAudioCheckbox').checked;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0 && tabs[0].id) {
      // Send audio preference to content script, so it can use it when 'startRecording' is triggered from overlay
      chrome.tabs.sendMessage(tabs[0].id, { action: 'setAudioPreference', recordAudio: shouldRecordAudio });
      chrome.tabs.sendMessage(tabs[0].id, { action: 'showOverlayButtons' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Popup.js: Failed to send showOverlayButtons to content script:', chrome.runtime.lastError.message);
           if (recordingStatusDiv) recordingStatusDiv.textContent = "Error showing overlay. Try refreshing the page.";
        } else {
            // Optionally close the popup after instructing the user
            // statusDiv.textContent = "Click 'Start Record' on the page overlay (bottom right).";
            // setTimeout(() => window.close(), 2000); // Close popup after 2 seconds
        }
      });
    } else {
      console.error("Popup.js: Could not find active tab to show overlay buttons.");
      if (recordingStatusDiv) recordingStatusDiv.textContent = "Error: No active tab found. Please ensure you are on a web page.";
    }
  });

  // Update UI based on current recording state (buttons are removed, but status is useful)
   chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
    if (chrome.runtime.lastError) {
        console.warn("Popup.js: Error getting recording state for showRecordButtons:", chrome.runtime.lastError.message);
        return;
    }
    if (response && response.isRecording !== undefined) {
        if (recordingStatusDiv) {
            recordingStatusDiv.textContent = response.isRecording ? 'Recording active. Use overlay to stop.' : "Click 'Start Record' on the page overlay (bottom right).";
        }
    }
  });
});

// Back to Initial (from Recording Setup Section)
document.getElementById('backToInitial').addEventListener('click', () => {
    if (recordingSection) recordingSection.style.display = 'none';
    if (initialSection) initialSection.style.display = 'block';
    if (statusDiv) statusDiv.textContent = 'Ready to record!';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0 && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'hideOverlayButtons' }, (response) => {
            if (chrome.runtime.lastError) {
              console.log('Popup.js: Failed to send hideOverlayButtons to content script:', chrome.runtime.lastError.message);
            }
          });
        }
      });
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Popup.js received message:", message.action);
  if (message.action === 'showEditInterfaceMessage') {
    console.log("Popup.js: Received screenshots for editing:", message.data);

    chrome.storage.local.set({ editorData: message.data }, () => {
      if (chrome.runtime.lastError) {
        console.error("Popup.js: Error setting editorData in local storage:", chrome.runtime.lastError.message);
        // alert("Error preparing editor. Please try again."); // Avoid alert if popup might be closing
        sendResponse({success: false, error: "Storage error"});
        return;
      }
      
      // Open the editor in a new tab regardless of current context
      console.log("Popup.js: Opening editor in a new tab.");
      chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?view=editor&timestamp=' + Date.now()) });
      
      // If this is the popup action window, close it as the editor will open in a new tab.
      // Check if it's the popup by seeing if it's not a tab (sender.tab will be undefined or its id will be TAB_ID_NONE for background)
      // or if it's a window without an opener (typical for popups)
      const amIPopup = !sender || !sender.tab || (sender.tab && sender.tab.id === chrome.tabs.TAB_ID_NONE && !window.opener) || (window.location.search.indexOf('view=editor') === -1) ;
      
      if (amIPopup) {
          // Only close if it's the popup and not already an editor tab
          if (window.location.search.indexOf('view=editor') === -1) {
            console.log("Popup.js: Closing action popup as editor tab is opening.");
            window.close();
          }
      }
      sendResponse({success: true});
    });
    return true; // Async due to storage.set

  } else if (message.action === 'recordingActuallyStarted') {
    if (recordingStatusDiv) recordingStatusDiv.textContent = 'Recording active. Use overlay to stop.';
    if (initialSection) initialSection.style.display = 'none';
    if (recordingSection) recordingSection.style.display = 'block';
    sendResponse({success: true});
  } else if (message.action === 'recordingActuallyStopped') {
    if (recordingStatusDiv) recordingStatusDiv.textContent = 'Recording stopped. Preparing editor...';
    // The showEditInterfaceMessage will handle opening the editor tab.
    sendResponse({success: true});
  }
  return true;
});


// Back to Record Button (in Edit Section)
document.getElementById('backToRecord').addEventListener('click', () => {
  if (editSection) editSection.style.display = 'none';
  if (initialSection) initialSection.style.display = 'block';
  if (statusDiv) statusDiv.textContent = 'Ready to record!';
  currentScreenshots = [];
  const pagePreviews = document.getElementById('pagePreviews');
  if (pagePreviews) pagePreviews.innerHTML = '';
  
  const downloadAudioButton = document.getElementById('downloadAudioButton');
  if(downloadAudioButton) downloadAudioButton.style.display = 'none';

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0 && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'hideOverlayButtons' }, response => {
          if(chrome.runtime.lastError) console.warn("Popup.js: Error hiding overlay on backToRecord: " + chrome.runtime.lastError.message);
      });
    }
  });

  // If this is an editor tab, close it.
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('view') === 'editor') {
    chrome.tabs.getCurrent(tab => {
        if (tab && tab.id) {
            chrome.tabs.remove(tab.id);
        }
    });
  }
});


// Save PDF button
document.getElementById('savePDF').addEventListener('click', () => {
  const filteredScreenshots = [];
  currentScreenshots.forEach((screenshot) => { 
    const previewDiv = document.querySelector(`.page-preview[data-index="${screenshot.originalIndex}"]`);
    if (previewDiv && !previewDiv.classList.contains('deleted')) {
      filteredScreenshots.push(screenshot);
    }
  });

  if (filteredScreenshots.length > 0) {
    generatePDF(filteredScreenshots);
  } else {
    console.log("No pages to save.");
    alert("No pages to save. Please ensure some pages are not marked as deleted.");
  }
});

// Show the editing interface
function showEditInterface(screenshotsData) {
  currentScreenshots = screenshotsData.map((s, index) => ({
    ...s,
    annotation: s.annotation || '',
    drawings: s.drawings || [],
    cropRegion: s.cropRegion || null,
    originalIndex: s.originalIndex !== undefined ? s.originalIndex : index 
  }));

  if (initialSection) initialSection.style.display = 'none';
  if (recordingSection) recordingSection.style.display = 'none';
  if (editSection) editSection.style.display = 'block';
  drawingEnabled = false;
  currentDrawingTool = 'none';
  updateDrawingToolButtons();

  const pagePreviews = document.getElementById('pagePreviews');
  if (!pagePreviews) {
      console.error("pagePreviews element not found!");
      return;
  }
  pagePreviews.innerHTML = '';

  if (currentScreenshots.length === 0) {
    pagePreviews.innerHTML = '<p>No screenshots were captured.</p>';
    return;
  }

  currentScreenshots.forEach((screenshot) => { 
    const originalIndex = screenshot.originalIndex; 

    const pagePreviewDiv = document.createElement('div');
    pagePreviewDiv.className = 'page-preview';
    pagePreviewDiv.dataset.index = originalIndex; 

    const imgElement = document.createElement('img');
    imgElement.src = screenshot.dataUrl;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none'; 

    pagePreviewDiv.appendChild(imgElement);
    pagePreviewDiv.appendChild(canvas);

    imgElement.onload = () => {
      canvas.width = imgElement.clientWidth;
      canvas.height = imgElement.clientHeight;
      pagePreviewDiv.canvas = canvas; 

      const ssObject = currentScreenshots.find(s => s.originalIndex === originalIndex);
      if (ssObject) {
          ssObject.previewWidth = imgElement.clientWidth;
          ssObject.previewHeight = imgElement.clientHeight;
      }
      
      redrawCanvas(canvas, screenshot.drawings, screenshot.cropRegion);
    };
    
    pagePreviewDiv.addEventListener('mousedown', (event) => {
      if (!drawingEnabled || currentDrawingTool === 'none') return;
      activeCanvas = pagePreviewDiv.canvas; 
      if (!activeCanvas) return;

      activeCanvas.style.pointerEvents = 'auto'; 

      activeScreenshotIndex = originalIndex;
      isDrawing = true;
      const rect = activeCanvas.getBoundingClientRect();
      startX = event.clientX - rect.left;
      startY = event.clientY - rect.top;
      event.preventDefault(); 
    });

    pagePreviewDiv.addEventListener('mousemove', (event) => {
      if (!isDrawing || !activeCanvas || activeCanvas !== pagePreviewDiv.canvas) return;
      
      const rect = activeCanvas.getBoundingClientRect();
      const currentX = event.clientX - rect.left;
      const currentY = event.clientY - rect.top;
      
      const ssObject = currentScreenshots.find(s => s.originalIndex === activeScreenshotIndex);
      if (!ssObject) return;

      const tempDrawings = [...ssObject.drawings];
      let tempCrop = ssObject.cropRegion;

      if (currentDrawingTool === 'crop') {
        redrawCanvas(activeCanvas, tempDrawings, null, true); 
        tempCrop = { 
            x: Math.min(startX, currentX), 
            y: Math.min(startY, currentY), 
            width: Math.abs(currentX - startX), 
            height: Math.abs(currentY - startY) 
        };
        drawTemporaryCropVisual(activeCanvas.getContext('2d'), tempCrop);
      } else {
        redrawCanvas(activeCanvas, tempDrawings, tempCrop); 
        const ctx = activeCanvas.getContext('2d');
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

    const endDrawing = (event) => {
        if (!isDrawing || !activeCanvas || activeCanvas !== pagePreviewDiv.canvas) return;
      
        const rect = activeCanvas.getBoundingClientRect();
        const endX = event ? event.clientX - rect.left : startX; 
        const endY = event ? event.clientY - rect.top : startY;
  
        const ssObject = currentScreenshots.find(s => s.originalIndex === activeScreenshotIndex);
        if (!ssObject) {
            isDrawing = false; activeCanvas = null; activeScreenshotIndex = -1;
            if(pagePreviewDiv.canvas) pagePreviewDiv.canvas.style.pointerEvents = 'none'; 
            return;
        }
  
        if (currentDrawingTool === 'crop') {
          const finalCropRect = { 
              x: Math.min(startX, endX), 
              y: Math.min(startY, endY), 
              width: Math.abs(endX - startX), 
              height: Math.abs(endY - startY) 
          };
          if (finalCropRect.width > 5 && finalCropRect.height > 5) {
              ssObject.cropRegion = finalCropRect;
          }
        } else if (currentDrawingTool === 'highlighter') {
          ssObject.drawings.push({ 
            type: 'rect', 
            x: Math.min(startX, endX), y: Math.min(startY, endY), 
            width: Math.abs(endX - startX), height: Math.abs(endY - startY), 
            color: 'rgba(255, 255, 0, 0.5)' 
          });
        } else if (currentDrawingTool === 'circle') {
          const dX = endX - startX;
          const dY = endY - startY;
          const radius = Math.max(1, Math.sqrt(dX*dX + dY*dY) / 2); 
          ssObject.drawings.push({ 
            type: 'circle', 
            cx: startX + dX/2, cy: startY + dY/2, radius: radius, 
            color: 'rgba(255, 0, 0, 1)', strokeWidth: 2 
          });
        }
        
        isDrawing = false; 
        redrawCanvas(activeCanvas, ssObject.drawings, ssObject.cropRegion);
        if (activeCanvas) activeCanvas.style.pointerEvents = 'none'; 
        activeCanvas = null;
        activeScreenshotIndex = -1;
    };

    pagePreviewDiv.addEventListener('mouseup', endDrawing);
    pagePreviewDiv.addEventListener('mouseleave', (event) => {
        if (isDrawing && activeCanvas === pagePreviewDiv.canvas) {
             const rect = pagePreviewDiv.getBoundingClientRect();
             if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
                endDrawing(event); 
             }
        }
    });

    const annotationInput = document.createElement('textarea');
    annotationInput.className = 'annotation-input';
    annotationInput.value = screenshot.annotation;
    annotationInput.placeholder = "Add annotation...";
    annotationInput.oninput = () => {
      const ssToUpdate = currentScreenshots.find(s => s.originalIndex === originalIndex);
      if (ssToUpdate) ssToUpdate.annotation = annotationInput.value;
    };

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'preview-controls';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Delete Page';
    deleteBtn.onclick = () => {
      pagePreviewDiv.classList.toggle('deleted');
      deleteBtn.textContent = pagePreviewDiv.classList.contains('deleted') ? 'Undo Delete' : 'Delete Page';
      deleteBtn.style.backgroundColor = pagePreviewDiv.classList.contains('deleted') ? '#28a745' : '#ff4d4d';
    };

    const clearDrawingsBtn = document.createElement('button');
    clearDrawingsBtn.className = 'clear-btn';
    clearDrawingsBtn.textContent = 'Clear Drawings';
    clearDrawingsBtn.onclick = () => {
      const ssToUpdate = currentScreenshots.find(s => s.originalIndex === originalIndex);
      if(ssToUpdate && pagePreviewDiv.canvas){
        ssToUpdate.drawings = [];
        redrawCanvas(pagePreviewDiv.canvas, [], ssToUpdate.cropRegion);
      }
    };

    const clearCropBtn = document.createElement('button');
    clearCropBtn.className = 'clear-btn';
    clearCropBtn.textContent = 'Clear Crop';
    clearCropBtn.onclick = () => {
      const ssToUpdate = currentScreenshots.find(s => s.originalIndex === originalIndex);
      if(ssToUpdate && pagePreviewDiv.canvas){
        ssToUpdate.cropRegion = null;
        redrawCanvas(pagePreviewDiv.canvas, ssToUpdate.drawings, null);
      }
    };

    controlsDiv.appendChild(deleteBtn);
    controlsDiv.appendChild(clearDrawingsBtn); 
    controlsDiv.appendChild(clearCropBtn);

    pagePreviewDiv.appendChild(annotationInput);
    pagePreviewDiv.appendChild(controlsDiv);
    pagePreviews.appendChild(pagePreviewDiv);
  });
}

function redrawCanvas(canvas, drawings, cropRegion, isTemporaryDrawing = false) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (cropRegion) {
    if (!isTemporaryDrawing) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.clearRect(cropRegion.x, cropRegion.y, cropRegion.width, cropRegion.height);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cropRegion.x, cropRegion.y, cropRegion.width, cropRegion.height);
      ctx.restore();
    }
  }

  (drawings || []).forEach(drawing => {
    ctx.save();
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
    ctx.restore();
  });
}

function drawTemporaryCropVisual(ctx, tempRect) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
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
                  console.error("Image load error event for screenshot " + i + ":", errEvent);
                  reject(new Error(`Failed to load image for PDF processing (index ${i}).`));
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
      let dX = 0, dY = 0, dWidth = originalWidth, dHeight = originalHeight;

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

      if (screenshot.drawings && screenshot.drawings.length > 0) {
          const scaleXToSourceCanvas = sourceCanvas.width / (screenshot.cropRegion ? screenshot.cropRegion.width : previewWidth);
          const scaleYToSourceCanvas = sourceCanvas.height / (screenshot.cropRegion ? screenshot.cropRegion.height : previewHeight);

          screenshot.drawings.forEach(drawing => {
            sourceCtx.save();
            let drawingX = drawing.x;
            let drawingY = drawing.y;
            let drawingWidth = drawing.width;
            let drawingHeight = drawing.height;
            let drawingCx = drawing.cx;
            let drawingCy = drawing.cy;
            let drawingRadius = drawing.radius;

            if(screenshot.cropRegion){
                drawingX -= screenshot.cropRegion.x;
                drawingY -= screenshot.cropRegion.y;
                drawingCx -= screenshot.cropRegion.x;
                drawingCy -= screenshot.cropRegion.y;
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
      const maxImageHeightInPdf = pageHeightInPdf * 0.70; 

      if (imageHeightInPdf > maxImageHeightInPdf) {
          imageHeightInPdf = maxImageHeightInPdf;
          imageWidthInPdf = (sourceCanvas.width / sourceCanvas.height) * imageHeightInPdf;
      }
      let imageXPositionInPdf = margin + (contentWidth - imageWidthInPdf) / 2;
      
      pdf.addImage(processedImageDataUrl, 'PNG', imageXPositionInPdf, currentY, imageWidthInPdf, imageHeightInPdf);
      currentY += imageHeightInPdf + 5; 

      if (screenshot.annotation && screenshot.annotation.trim() !== "") {
        pdf.setFontSize(10); 
        const textLines = pdf.splitTextToSize(screenshot.annotation, contentWidth); 
        const textBlockHeight = textLines.length * (pdf.getLineHeightFactor() * pdf.getFontSize_pt() / pdf.internal.scaleFactor); 
        
        if (currentY + textBlockHeight > pageHeightInPdf - margin) { 
          pdf.addPage();
          currentY = margin;
        }
        pdf.text(textLines, margin, currentY);
        currentY += textBlockHeight; 
      }
    }
    pdf.save('training_guide.pdf');
    alert('PDF generated successfully!');
  } catch (error) {
    console.error("Error generating PDF:", error);
    alert("An error occurred while generating the PDF. Check console for details.");
  } finally {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view') !== 'editor') { // Only reset if it was the popup action window
        if (initialSection) initialSection.style.display = 'block';
        if (recordingSection) recordingSection.style.display = 'none';
        if (editSection) editSection.style.display = 'none';
        const downloadAudioButton = document.getElementById('downloadAudioButton');
        if (downloadAudioButton) downloadAudioButton.style.display = 'none';
        
        const mainStatusDiv = initialSection ? initialSection.querySelector('#status') : statusDiv;
        if(mainStatusDiv) mainStatusDiv.textContent = 'Ready to record!';
        
        currentScreenshots = [];
        const pagePreviews = document.getElementById('pagePreviews');
        if (pagePreviews) pagePreviews.innerHTML = '';
    }
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

document.getElementById('enableDrawingMode').addEventListener('click', () => {
  drawingEnabled = !drawingEnabled;
  updateDrawingToolButtons(); 
  
  const canvases = document.querySelectorAll('.page-preview canvas');
  canvases.forEach(c => {
      c.style.cursor = drawingEnabled ? 'crosshair' : 'default';
      c.style.pointerEvents = drawingEnabled ? 'auto' : 'none'; 
  });

  if (!drawingEnabled) {
    currentDrawingTool = 'none'; 
    updateActiveToolButton(null); 
    isDrawing = false; 
    if (activeCanvas) {
        activeCanvas.style.pointerEvents = 'none'; 
        activeCanvas = null;
    }
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
    if(btn) {
        btn.disabled = !drawingEnabled;
        if (!drawingEnabled) btn.classList.remove('active');
    }
  });
  
  if (drawingEnabled) {
    if(currentDrawingTool !== 'none'){
        updateActiveToolButton(`tool${currentDrawingTool.charAt(0).toUpperCase() + currentDrawingTool.slice(1)}`);
    } else {
        updateActiveToolButton(null); 
    }
  } else {
    updateActiveToolButton(null); 
  }
}


function updateActiveToolButton(activeButtonId) {
    ['toolHighlighter', 'toolCircle', 'toolCrop'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.classList.toggle('active', id === activeButtonId && currentDrawingTool !== 'none');
        }
    });
}
