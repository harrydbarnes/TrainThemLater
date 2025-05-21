// harrydbarnes/trainthemlater/TrainThemLater-main/popup.js
let currentScreenshots = [];
let currentDrawingTool = 'none';
let isDrawing = false;
let startX, startY;
let activeCanvas = null;
let activeScreenshotIndex = -1;
let originalPageUrl = ''; // To store the URL for the title
let modalCurrentIndex = 0; // For carousel

const initialSection = document.getElementById('initialSection');
const recordingSection = document.getElementById('recordingSection');
const editSection = document.getElementById('editSection');
const statusDiv = document.getElementById('status');
const recordingStatusDiv = recordingSection.querySelector('#status');
const trainingTitleInput = document.getElementById('trainingTitleInput');

const screenshotModal = document.getElementById('screenshotModal');
const modalImage = document.getElementById('modalImage');
const closeScreenshotModalBtn = document.getElementById('closeScreenshotModal');
const prevScreenshotModalBtn = document.getElementById('prevScreenshotModal');
const nextScreenshotModalBtn = document.getElementById('nextScreenshotModal');


document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view') === 'editor') {
        document.body.classList.add('editor-view');
        console.log("Popup.js: Detected editor view from URL params.");
        if (urlParams.get('source') === 'background') {
            chrome.storage.local.get(['pendingEditorData', 'pageUrlForTitle'], (result) => {
                if (chrome.runtime.lastError) {
                    console.error("Popup.js: Error getting pendingEditorData:", chrome.runtime.lastError.message);
                    if (initialSection) initialSection.style.display = 'block';
                    if (statusDiv) statusDiv.textContent = "Error loading editor data.";
                    return;
                }
                if (result.pendingEditorData) {
                    console.log("Popup.js: Editor data found from pendingEditorData.", result.pendingEditorData);
                    const data = result.pendingEditorData;
                    originalPageUrl = result.pageUrlForTitle || '';
                    updateTrainingTitle();

                    const downloadAudioButton = document.getElementById('downloadAudioButton');
                    if (downloadAudioButton) {
                        downloadAudioButton.style.display = data.audioAvailable ? 'block' : 'none';
                    }
                    if (initialSection) initialSection.style.display = 'none';
                    if (recordingSection) recordingSection.style.display = 'none';
                    if (editSection) editSection.style.display = 'block';
                    showEditInterface(data.screenshots ? data.screenshots.map(s => ({...s})) : []);
                    
                    chrome.storage.local.remove(['pendingEditorData', 'pageUrlForTitle'], () => {
                        if (chrome.runtime.lastError) {
                            console.error("Popup.js: Error clearing pending/URL data:", chrome.runtime.lastError.message);
                        } else {
                            console.log("Popup.js: pendingEditorData and pageUrlForTitle cleared.");
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
        document.body.classList.remove('editor-view');
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

function updateTrainingTitle() {
    if (trainingTitleInput) {
        if (originalPageUrl) {
            try {
                const url = new URL(originalPageUrl);
                let title = url.hostname + (url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : '');
                title = title.replace(/^www\./, ''); // Remove www.
                trainingTitleInput.value = title + " Training";
            } catch (e) {
                trainingTitleInput.value = "Training Guide"; // Fallback
            }
        } else {
            trainingTitleInput.value = "Training Guide";
        }
    }
}


function loadEditorDataFromStorage() {
    chrome.storage.local.get(['editorData', 'pageUrlForTitle'], (result) => {
        if (chrome.runtime.lastError) {
            console.error("Popup.js: Error getting editorData from storage:", chrome.runtime.lastError.message);
            if (initialSection) initialSection.style.display = 'block';
            if (statusDiv) statusDiv.textContent = "Error loading editor data (from editorData).";
            return;
        }
        if (result.editorData) {
            console.log("Popup.js: Editor data found in editorData storage.", result.editorData);
            const data = result.editorData;
            originalPageUrl = result.pageUrlForTitle || originalPageUrl;
            updateTrainingTitle();

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
            updateTrainingTitle();
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
      originalPageUrl = tabs[0].url; 
      chrome.tabs.sendMessage(tabs[0].id, { action: 'setAudioAndUrlPreference', recordAudio: shouldRecordAudio, pageUrl: originalPageUrl });
      chrome.tabs.sendMessage(tabs[0].id, { action: 'showOverlayButtons' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Popup.js: Failed to send showOverlayButtons to content script:', chrome.runtime.lastError.message);
           if (recordingStatusDiv) recordingStatusDiv.textContent = "Error showing overlay. Try refreshing the page.";
        } else {
             const urlParams = new URLSearchParams(window.location.search);
             if (urlParams.get('view') !== 'editor') {
                setTimeout(() => window.close(), 500);
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
    originalPageUrl = ''; 

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
    
    const dataToStore = {
        editorData: message.data,
        pageUrlForTitle: message.data.pageUrl || originalPageUrl
    };

    chrome.storage.local.set(dataToStore, () => {
        if (chrome.runtime.lastError) {
            console.error("Popup.js: Error setting editorData in 'showEditInterfaceMessage':", chrome.runtime.lastError.message);
            sendResponse({success: false, error: "Storage error"});
            return;
        }
        
        if (isEditorView) {
            console.log("Popup.js: Refreshing current editor tab with new data.");
            originalPageUrl = dataToStore.pageUrlForTitle;
            updateTrainingTitle();
            const downloadAudioButton = document.getElementById('downloadAudioButton');
            if (downloadAudioButton) {
                downloadAudioButton.style.display = message.data.audioAvailable ? 'block' : 'none';
            }
            showEditInterface(message.data.screenshots ? message.data.screenshots.map(s => ({...s})) : []);
        } else {
            console.log("Popup.js: 'showEditInterfaceMessage' received by non-editor. Background should open new tab, or this will try.");
             chrome.tabs.query({ url: chrome.runtime.getURL('popup.html?view=editor*') }, (tabs) => {
                let editorTabExists = false;
                for(let tab of tabs){
                    if(tab.url.includes("view=editor")){
                        editorTabExists = true;
                        break;
                    }
                }
                if (!editorTabExists) {
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
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view') !== 'editor' && window.location.pathname.endsWith('popup.html')) {
        console.log("Popup.js: Action popup closing on recordingActuallyStopped.");
        setTimeout(() => window.close(), 500);
    }
    sendResponse({success: true});
  }
  return true;
});


document.getElementById('backToRecord').addEventListener('click', () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('view') === 'editor') {
    chrome.tabs.getCurrent(tab => {
        if (tab && tab.id) {
            chrome.tabs.remove(tab.id, () => {
                if (chrome.runtime.lastError) {
                    console.warn("Error closing editor tab:", chrome.runtime.lastError.message);
                    window.location.href = chrome.runtime.getURL("popup.html");
                }
            });
        } else { 
             window.location.href = chrome.runtime.getURL("popup.html");
        }
    });
  } else { 
    if (editSection) editSection.style.display = 'none';
    if (initialSection) initialSection.style.display = 'block';
    if (statusDiv) statusDiv.textContent = 'Ready to record!';
    currentScreenshots = [];
    if (document.getElementById('pagePreviews')) document.getElementById('pagePreviews').innerHTML = '';
    if (document.getElementById('downloadAudioButton')) document.getElementById('downloadAudioButton').style.display = 'none';
    if (trainingTitleInput) trainingTitleInput.value = '';
    originalPageUrl = '';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0 && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'hideOverlayButtons' }, response => {
              if(chrome.runtime.lastError) console.warn("Popup.js: Error hiding overlay on backToRecord: " + chrome.runtime.lastError.message);
          });
        }
      });
  }
});


document.getElementById('savePDF').addEventListener('click', () => {
  const filteredScreenshots = getVisibleScreenshots(); // Use helper to get non-deleted

  if (filteredScreenshots.length > 0) {
    const fileName = trainingTitleInput.value.trim() || "training_guide";
    generatePDF(filteredScreenshots, fileName);
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
    imgElement.addEventListener('click', () => openModal(originalIndex)); // Open modal on click


    const canvas = document.createElement('canvas');
    canvas.style.pointerEvents = 'none';

    pagePreviewDiv.appendChild(imgElement);
    pagePreviewDiv.appendChild(canvas);

    imgElement.onload = () => {
      const displayedWidth = imgElement.clientWidth;
      const displayedHeight = imgElement.clientHeight;
      canvas.width = displayedWidth;
      canvas.height = displayedHeight;
      canvas.style.top = imgElement.offsetTop + 'px';
      canvas.style.left = imgElement.offsetLeft + 'px';
      pagePreviewDiv.canvas = canvas;

      const ssObject = currentScreenshots.find(s => s.originalIndex === originalIndex);
      if (ssObject) {
          ssObject.previewWidth = displayedWidth;
          ssObject.previewHeight = displayedHeight;
      }
      redrawCanvas(canvas, screenshot.drawings || [], screenshot.cropRegion);
    };
    
    pagePreviewDiv.addEventListener('mousedown', (event) => {
      if (currentDrawingTool === 'none') return;
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

      const tempDrawings = [...(ssObject.drawings || [])];
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
      } else if (currentDrawingTool !== 'none') {
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
        if (!Array.isArray(ssObject.drawings)) {
            ssObject.drawings = [];
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
      updateModalNavButtons(); // Update carousel when page is deleted/undeleted
    };

    const undoDrawingBtn = document.createElement('button');
    undoDrawingBtn.className = 'undo-btn';
    undoDrawingBtn.textContent = 'Undo Drawing';
    undoDrawingBtn.onclick = () => {
      const ssToUpdate = currentScreenshots.find(s => s.originalIndex === originalIndex);
      if(ssToUpdate && pagePreviewDiv.canvas && ssToUpdate.drawings && ssToUpdate.drawings.length > 0){
        ssToUpdate.drawings.pop();
        redrawCanvas(pagePreviewDiv.canvas, ssToUpdate.drawings, ssToUpdate.cropRegion);
      }
    };

    const undoCropBtn = document.createElement('button');
    undoCropBtn.className = 'undo-btn';
    undoCropBtn.textContent = 'Undo Crop';
    undoCropBtn.onclick = () => {
      const ssToUpdate = currentScreenshots.find(s => s.originalIndex === originalIndex);
      if(ssToUpdate && pagePreviewDiv.canvas){
        ssToUpdate.cropRegion = null;
        redrawCanvas(pagePreviewDiv.canvas, ssToUpdate.drawings, null);
      }
    };

    controlsDiv.appendChild(deleteBtn);
    controlsDiv.appendChild(undoDrawingBtn);
    controlsDiv.appendChild(undoCropBtn);

    pagePreviewDiv.appendChild(annotationInput);
    pagePreviewDiv.appendChild(controlsDiv);
    pagePreviews.appendChild(pagePreviewDiv);
  });
  document.querySelectorAll('#editControls button').forEach(btn => btn.disabled = false);
  updateModalNavButtons(); // Initial call to set up modal buttons correctly
}

function redrawCanvas(canvas, drawings, cropRegion, isTemporaryDrawing = false) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (cropRegion) {
    if (!isTemporaryDrawing) {
        const img = canvas.previousElementSibling;
        if (img && img.tagName === 'IMG') {
            const ssObject = currentScreenshots.find(s => s.originalIndex === parseInt(canvas.parentElement.dataset.index));
            if (ssObject && ssObject.previewWidth && ssObject.previewHeight) {
                const scaleX = ssObject.previewWidth / (ssObject.imageWidth || ssObject.previewWidth) ;
                const scaleY = ssObject.previewHeight / (ssObject.imageHeight || ssObject.previewHeight);
                const sx = cropRegion.x;
                const sy = cropRegion.y;
                const sWidth = cropRegion.width;
                const sHeight = cropRegion.height;
                ctx.drawImage(img, sx, sy, sWidth, sHeight, sx, sy, sWidth, sHeight);
            }
        }
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

async function generatePDF(screenshotsToProcess, fileName = 'training_guide.pdf') {
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
      
      const originalImgWidth = originalImage.naturalWidth;
      const originalImgHeight = originalImage.naturalHeight;

      const sourceCanvas = document.createElement('canvas');
      const sourceCtx = sourceCanvas.getContext('2d');
      
      let sX = 0, sY = 0, sWidth = originalImgWidth, sHeight = originalImgHeight;
      let dX = 0, dY = 0, dWidth = originalImgWidth, dHeight = originalImgHeight;

      const previewWidth = screenshot.previewWidth || originalImgWidth;
      const previewHeight = screenshot.previewHeight || originalImgHeight;


      if (screenshot.cropRegion && screenshot.cropRegion.width > 0 && screenshot.cropRegion.height > 0) {
          sX = screenshot.cropRegion.x * (originalImgWidth / previewWidth);
          sY = screenshot.cropRegion.y * (originalImgHeight / previewHeight);
          sWidth = screenshot.cropRegion.width * (originalImgWidth / previewWidth);
          sHeight = screenshot.cropRegion.height * (originalImgHeight / previewHeight);

          sX = Math.max(0, Math.min(sX, originalImgWidth - 1));
          sY = Math.max(0, Math.min(sY, originalImgHeight - 1));
          sWidth = Math.max(1, Math.min(sWidth, originalImgWidth - sX));
          sHeight = Math.max(1, Math.min(sHeight, originalImgHeight - sY));
          
          sourceCanvas.width = sWidth;
          sourceCanvas.height = sHeight;
          dWidth = sWidth; 
          dHeight = sHeight;
      } else {
          sourceCanvas.width = originalImgWidth;
          sourceCanvas.height = originalImgHeight;
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
    pdf.save(fileName.endsWith('.pdf') ? fileName : fileName + '.pdf');
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
        if (trainingTitleInput) trainingTitleInput.value = '';
        originalPageUrl = '';
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

document.getElementById('toolHighlighter').addEventListener('click', () => {
    currentDrawingTool = (currentDrawingTool === 'highlighter' ? 'none' : 'highlighter');
    updateActiveToolButton(currentDrawingTool === 'highlighter' ? 'toolHighlighter' : null);
    setCanvasPointerEvents(currentDrawingTool !== 'none');
});

document.getElementById('toolCircle').addEventListener('click', () => {
    currentDrawingTool = (currentDrawingTool === 'circle' ? 'none' : 'circle');
    updateActiveToolButton(currentDrawingTool === 'circle' ? 'toolCircle' : null);
    setCanvasPointerEvents(currentDrawingTool !== 'none');
});

document.getElementById('toolCrop').addEventListener('click', () => {
    currentDrawingTool = (currentDrawingTool === 'crop' ? 'none' : 'crop');
    updateActiveToolButton(currentDrawingTool === 'crop' ? 'toolCrop' : null);
    setCanvasPointerEvents(currentDrawingTool !== 'none');
});

function setCanvasPointerEvents(enableDrawing) {
    const canvases = document.querySelectorAll('.page-preview canvas');
    canvases.forEach(c => {
        c.style.cursor = enableDrawing ? 'crosshair' : 'default';
        c.style.pointerEvents = enableDrawing ? 'auto' : 'none';
    });
     if (!enableDrawing && activeCanvas) {
        activeCanvas.style.pointerEvents = 'none';
        isDrawing = false; 
    }
}


function updateDrawingToolButtons() {
  if (currentDrawingTool !== 'none') {
    updateActiveToolButton(`tool${currentDrawingTool.charAt(0).toUpperCase() + currentDrawingTool.slice(1)}`);
  } else {
    updateActiveToolButton(null); 
  }
  setCanvasPointerEvents(currentDrawingTool !== 'none');
}


function updateActiveToolButton(activeButtonId) {
    ['toolHighlighter', 'toolCircle', 'toolCrop'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.classList.toggle('active', id === activeButtonId && currentDrawingTool !== 'none');
        }
    });
}

// --- New Modal Functions ---
function getVisibleScreenshots() {
  return currentScreenshots.filter(s => {
    const previewDiv = document.querySelector(`.page-preview[data-index="${s.originalIndex}"]`);
    return previewDiv && !previewDiv.classList.contains('deleted');
  });
}

function openModal(originalIdx) {
  const visibleScreenshots = getVisibleScreenshots();
  const targetScreenshot = visibleScreenshots.find(s => s.originalIndex === originalIdx);
  
  if (!targetScreenshot || !screenshotModal || !modalImage) return;

  modalCurrentIndex = visibleScreenshots.findIndex(s => s.originalIndex === originalIdx);
  if (modalCurrentIndex === -1) return;

  modalImage.src = targetScreenshot.dataUrl;
  screenshotModal.style.display = "block";
  updateModalNavButtons();
}

function closeModal() {
  if (screenshotModal) screenshotModal.style.display = "none";
}

function showModalImage(index) {
  const visibleScreenshots = getVisibleScreenshots();
  if (index >= 0 && index < visibleScreenshots.length && modalImage) {
    modalImage.src = visibleScreenshots[index].dataUrl;
    modalCurrentIndex = index;
    updateModalNavButtons();
  }
}

function showPrevModalImage() {
  const visibleScreenshots = getVisibleScreenshots();
  if (visibleScreenshots.length === 0) return;
  let newIndex = modalCurrentIndex - 1;
  if (newIndex < 0) {
    newIndex = visibleScreenshots.length - 1; // Loop to last
  }
  showModalImage(newIndex);
}

function showNextModalImage() {
  const visibleScreenshots = getVisibleScreenshots();
  if (visibleScreenshots.length === 0) return;
  let newIndex = modalCurrentIndex + 1;
  if (newIndex >= visibleScreenshots.length) {
    newIndex = 0; // Loop to first
  }
  showModalImage(newIndex);
}

function updateModalNavButtons() {
    const visibleScreenshots = getVisibleScreenshots();
    if (prevScreenshotModalBtn) {
        prevScreenshotModalBtn.style.display = visibleScreenshots.length > 1 ? 'block' : 'none';
    }
    if (nextScreenshotModalBtn) {
        nextScreenshotModalBtn.style.display = visibleScreenshots.length > 1 ? 'block' : 'none';
    }
}


// Event Listeners for Modal
if (closeScreenshotModalBtn) {
  closeScreenshotModalBtn.onclick = closeModal;
}
if (prevScreenshotModalBtn) {
  prevScreenshotModalBtn.onclick = showPrevModalImage;
}
if (nextScreenshotModalBtn) {
  nextScreenshotModalBtn.onclick = showNextModalImage;
}

window.onclick = function(event) {
  if (event.target == screenshotModal) {
    closeModal();
  }
}

document.addEventListener('keydown', function(event) {
  if (screenshotModal && screenshotModal.style.display === "block") {
    if (event.key === "ArrowLeft") {
      showPrevModalImage();
    } else if (event.key === "ArrowRight") {
      showNextModalImage();
    } else if (event.key === "Escape") {
      closeModal();
    }
  }
});

if (screenshotModal) {
    screenshotModal.addEventListener('wheel', function(event) {
        if (screenshotModal.style.display === "block") {
            event.preventDefault(); 
            if (event.deltaY < 0) {
                showPrevModalImage();
            } else {
                showNextModalImage();
            }
        }
    });
}
