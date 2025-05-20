// harrydbarnes/trainthemlater/TrainThemLater-main/popup.js
let currentScreenshots = [];
let drawingEnabled = false;
let currentDrawingTool = 'none';
let isDrawing = false;
let startX, startY;
let activeCanvas = null;
let activeScreenshotIndex = -1; 

const initialSection = document.getElementById('initialSection');
const recordingSection = document.getElementById('recordingSection');
const editSection = document.getElementById('editSection');
const statusDiv = document.getElementById('status'); 
const recordingStatusDiv = recordingSection.querySelector('#status'); 


document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view') === 'editor') {
        console.log("Popup.js: Detected editor view from URL params.");
        if (urlParams.get('source') === 'background') {
            chrome.storage.local.get('pendingEditorData', (result) => {
                if (chrome.runtime.lastError) {
                    console.error("Popup.js: Error getting pendingEditorData:", chrome.runtime.lastError.message);
                    if (initialSection) initialSection.style.display = 'block';
                    if (statusDiv) statusDiv.textContent = "Error loading editor data.";
                    return;
                }
                if (result.pendingEditorData) {
                    console.log("Popup.js: Editor data found from pendingEditorData.", result.pendingEditorData);
                    const data = result.pendingEditorData;
                    const downloadAudioButton = document.getElementById('downloadAudioButton');
                    if (downloadAudioButton) {
                        downloadAudioButton.style.display = data.audioAvailable ? 'block' : 'none';
                    }
                    if (initialSection) initialSection.style.display = 'none';
                    if (recordingSection) recordingSection.style.display = 'none';
                    if (editSection) editSection.style.display = 'block';
                    showEditInterface(data.screenshots ? data.screenshots.map(s => ({...s})) : []);
                    
                    chrome.storage.local.remove('pendingEditorData', () => {
                        if (chrome.runtime.lastError) {
                            console.error("Popup.js: Error clearing pendingEditorData:", chrome.runtime.lastError.message);
                        } else {
                            console.log("Popup.js: pendingEditorData cleared.");
                        }
                    });
                } else {
                    console.warn("Popup.js: Editor view (from background) but no pendingEditorData found.");
                    loadEditorDataFromStorage(); 
                }
            });
        } else {
            loadEditorDataFromStorage();
        }
    } else {
        console.log("Popup.js: Initializing as standard popup action.");
        if (initialSection) initialSection.style.display = 'block';
        if (recordingSection) recordingSection.style.display = 'none';
        if (editSection) editSection.style.display = 'none';
        if (statusDiv) statusDiv.textContent = 'Ready to record!';

        chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn("Popup.js: Error getting initial recording state:", chrome.runtime.lastError.message);
                return;
            }
            if (response) {
                if (response.isRecording) {
                    if (initialSection) initialSection.style.display = 'none';
                    if (recordingSection) recordingSection.style.display = 'block';
                    if (recordingStatusDiv) recordingStatusDiv.textContent = 'Recording active. Use overlay to stop.';
                }
            }
        });
    }
});

function loadEditorDataFromStorage() { 
    chrome.storage.local.get('editorData', (result) => {
        if (chrome.runtime.lastError) {
            console.error("Popup.js: Error getting editorData from storage:", chrome.runtime.lastError.message);
            if (initialSection) initialSection.style.display = 'block';
            if (statusDiv) statusDiv.textContent = "Error loading editor data (from editorData).";
            return;
        }
        if (result.editorData) {
            console.log("Popup.js: Editor data found in editorData storage.", result.editorData);
            const data = result.editorData;
            const downloadAudioButton = document.getElementById('downloadAudioButton');
            if (downloadAudioButton) {
                downloadAudioButton.style.display = data.audioAvailable ? 'block' : 'none';
            }
            if (initialSection) initialSection.style.display = 'none';
            if (recordingSection) recordingSection.style.display = 'none';
            if (editSection) editSection.style.display = 'block';
            showEditInterface(data.screenshots ? data.screenshots.map(s => ({...s})) : []);
        } else {
            console.warn("Popup.js: Editor view specified, but no editorData found in storage either.");
            if (editSection && editSection.style.display === 'block') { 
                const pagePreviews = document.getElementById('pagePreviews');
                if(pagePreviews) pagePreviews.innerHTML = '<p>No data loaded. Try recording again.</p>';
            } else {
                 if (initialSection) initialSection.style.display = 'block';
                 if (statusDiv) statusDiv.textContent = "Ready to record. No active edit session found.";
            }
        }
    });
}

document.getElementById('showRecordButtons').addEventListener('click', () => {
  if (initialSection) initialSection.style.display = 'none';
  if (recordingSection) recordingSection.style.display = 'block';
  
  const shouldRecordAudio = document.getElementById('recordAudioCheckbox').checked;
  if (recordingStatusDiv) recordingStatusDiv.textContent = "Use page overlay (bottom right) to Start/Stop.";


  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0 && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'setAudioPreference', recordAudio: shouldRecordAudio });
      chrome.tabs.sendMessage(tabs[0].id, { action: 'showOverlayButtons' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Popup.js: Failed to send showOverlayButtons to content script:', chrome.runtime.lastError.message);
           if (recordingStatusDiv) recordingStatusDiv.textContent = "Error showing overlay. Try refreshing the page.";
        } else {
            // Consider closing popup if not an editor tab
             const urlParams = new URLSearchParams(window.location.search);
             if (urlParams.get('view') !== 'editor') {
                setTimeout(() => window.close(), 500); // Short delay before closing
             }
        }
      });
    } else {
      console.error("Popup.js: Could not find active tab to show overlay buttons.");
      if (recordingStatusDiv) recordingStatusDiv.textContent = "Error: No active tab. Please ensure you are on a web page.";
    }
  });

   chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
    if (chrome.runtime.lastError) {
        console.warn("Popup.js: Error getting recording state for showRecordButtons:", chrome.runtime.lastError.message);
        return;
    }
    if (response && response.isRecording !== undefined) {
        if (recordingStatusDiv) {
            recordingStatusDiv.textContent = response.isRecording ? 'Recording active. Use overlay to stop.' : "Use page overlay (bottom right) to Start/Stop.";
        }
    }
  });
});

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
    console.log("Popup.js: Received 'showEditInterfaceMessage', data:", message.data);
    const urlParams = new URLSearchParams(window.location.search);
    const isEditorView = urlParams.get('view') === 'editor';

    chrome.storage.local.set({ editorData: message.data }, () => {
        if (chrome.runtime.lastError) {
            console.error("Popup.js: Error setting editorData in 'showEditInterfaceMessage':", chrome.runtime.lastError.message);
            sendResponse({success: false, error: "Storage error"});
            return;
        }
        
        if (isEditorView) {
            console.log("Popup.js: Refreshing current editor tab with new data.");
            const downloadAudioButton = document.getElementById('downloadAudioButton');
            if (downloadAudioButton) {
                downloadAudioButton.style.display = message.data.audioAvailable ? 'block' : 'none';
            }
            showEditInterface(message.data.screenshots ? message.data.screenshots.map(s => ({...s})) : []);
        } else {
            // This case (non-editor popup receiving this) should be rare now
            // as background.js directly opens a new editor tab.
            // If it happens, it implies background didn't open the tab or this is an old popup.
            console.log("Popup.js: 'showEditInterfaceMessage' received by non-editor. Background should open new tab.");
            // To be safe, we can still try to open a new editor tab here if one isn't detected.
            chrome.tabs.query({ url: chrome.runtime.getURL('popup.html?view=editor*') }, (tabs) => {
                if (tabs.length === 0) { // Only open if no editor tab seems to exist or is being opened
                     chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?view=editor&source=popupMessageFallback&timestamp=' + Date.now()) });
                }
            });
            if (window.location.pathname.endsWith('popup.html') && !isEditorView) {
                 setTimeout(() => window.close(), 100); 
            }
        }
        sendResponse({success: true});
    });
    return true; 

  } else if (message.action === 'recordingActuallyStarted') {
    if (initialSection) initialSection.style.display = 'none';
    if (recordingSection) recordingSection.style.display = 'block';
    if (recordingStatusDiv) recordingStatusDiv.textContent = 'Recording active. Use overlay to stop.';
    sendResponse({success: true});
  } else if (message.action === 'recordingActuallyStopped') {
    if (recordingStatusDiv && recordingSection && recordingSection.style.display === 'block') {
        recordingStatusDiv.textContent = 'Recording stopped. Editor is opening...';
    }
     // It's possible this popup is the action popup and should close
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view') !== 'editor' && window.location.pathname.endsWith('popup.html')) {
        console.log("Popup.js: Action popup closing on recordingActuallyStopped.");
        setTimeout(() => window.close(), 500); // Give a moment for other actions
    }
    sendResponse({success: true});
  }
  return true; 
});


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

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('view') === 'editor') {
    chrome.tabs.getCurrent(tab => {
        if (tab && tab.id) {
            chrome.tabs.remove(tab.id);
        }
    });
  }
});


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
    if (urlParams.get('view') !== 'editor') { 
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
