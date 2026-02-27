/***********************
 * EXPORT/IMPORT FUNCTIONS
 ***********************/
import * as state from './state.js';
import { saveNotesToLocalStorage } from './storage.js';
import { getImage, storeImage } from './database.js';
import {
  getColumnName,
  getCurrentDate,
  escapeHtml,
  formatTime,
  getImageDimensions
} from './utils.js';
import { getPriorityLabel } from './priority.js';
import { createNoteElement } from './tasks.js';

/***********************
 * PDF EXPORT (Individual Task)
 ***********************/
export async function exportTaskAsPDF(taskId = null) {
  const id = taskId || state.currentTaskId;
  if (!id) return;

  const task = state.notesData.find(t => t.id === id);
  if (!task) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  let yPos = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const maxWidth = pageWidth - (margin * 2);

  // Title (split to fit page width)
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  const titleLines = doc.splitTextToSize(task.title, maxWidth);
  titleLines.forEach(line => {
    doc.text(line, margin, yPos);
    yPos += 10;
  });
  yPos += 2;

  // Priority
  doc.setFontSize(12);
  doc.setFont(undefined, 'normal');
  const priorityColor = task.priority === 'high' ? [244, 67, 54] :
                        task.priority === 'low' ? [76, 175, 80] :
                        task.priority === 'medium' ? [255, 152, 0] : [128, 128, 128];
  doc.setTextColor(...priorityColor);
  doc.text(`Priority: ${getPriorityLabel(task.priority)}`, margin, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 8;

  // Timer
  doc.text(`Total Worked Time: ${formatTime(task.timer || 0)}`, margin, yPos);
  yPos += 15;

  // Merge timeline (notes + history) in chronological order
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('Timeline:', margin, yPos);
  yPos += 8;

  if (task.actions && task.actions.length > 0) {
    for (const action of task.actions) {
      if (yPos > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        yPos = 20;
      }

      if (action.type === 'note') {
        // This is a note entry
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(76, 175, 80); // Green for notes
        doc.text(`[${action.timestamp}] Note added:`, margin, yPos);
        yPos += 6;

        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(0, 0, 0); // Reset to black for content

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = action.notesHTML;

        const childNodes = tempDiv.childNodes;
        for (let i = 0; i < childNodes.length; i++) {
          const node = childNodes[i];

          if (node.nodeName === 'IMG') {
            try {
              let imgSrc = null;

              // Try to get from IndexedDB first using imageId
              if (node.dataset.imageId) {
                imgSrc = await getImage(id, node.dataset.imageId);
              }

              // If not found, try data-src attribute
              if (!imgSrc && node.dataset.src) {
                imgSrc = node.dataset.src;
              }

              // Fallback to src if still not found
              if (!imgSrc) {
                imgSrc = node.src;
              }

              if (imgSrc && imgSrc.startsWith('data:')) {
                // Calculate proper dimensions maintaining aspect ratio
                const dimensions = await getImageDimensions(imgSrc);

                const imgMaxWidth = 150;
                const imgMaxHeight = 100;

                // Scale down to fit within max dimensions while maintaining aspect ratio
                const widthRatio = imgMaxWidth / dimensions.width;
                const heightRatio = imgMaxHeight / dimensions.height;
                const scale = Math.min(widthRatio, heightRatio, 1); // Don't scale up

                const imgWidth = dimensions.width * scale;
                const imgHeight = dimensions.height * scale;

                if (yPos + imgHeight > doc.internal.pageSize.getHeight() - 20) {
                  doc.addPage();
                  yPos = 20;
                }

                doc.addImage(imgSrc, 'PNG', margin, yPos, imgWidth, imgHeight);
                yPos += imgHeight + 5;
              }
            } catch (err) {
              console.error('Error adding image to PDF:', err);
            }
          } else if (node.textContent && node.textContent.trim()) {
            const text = node.textContent.trim();
            const lines = doc.splitTextToSize(text, maxWidth);

            lines.forEach(line => {
              if (yPos > doc.internal.pageSize.getHeight() - 20) {
                doc.addPage();
                yPos = 20;
              }
              doc.text(line, margin, yPos);
              yPos += 7;
            });
          }
        }

        yPos += 5;
      } else {
        // Regular history action with color coding
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');

        // Set color based on action type
        switch (action.type) {
          case 'created':
            doc.setTextColor(33, 150, 243); // Blue
            break;
          case 'deleted':
            doc.setTextColor(244, 67, 54); // Red
            break;
          case 'status':
            doc.setTextColor(156, 39, 176); // Purple
            break;
          case 'timer':
            doc.setTextColor(255, 152, 0); // Orange
            break;
          case 'priority':
            doc.setTextColor(38, 198, 218); // Cyan
            break;
          case 'subtask':
            doc.setTextColor(236, 64, 122); // Pink for sub-tasks
            break;
          default:
            doc.setTextColor(0, 0, 0); // Black
        }

        doc.text(`[${action.timestamp}] ${action.action}`, margin, yPos);
        doc.setTextColor(0, 0, 0); // Reset to black
        yPos += 6;
      }
    }
  } else {
    doc.setFontSize(11);
    doc.text('No timeline events', margin, yPos);
    yPos += 10;
  }

  const filename = `${task.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
  doc.save(filename);
}

/***********************
 * HTML EXPORT/IMPORT (Full Board)
 ***********************/
export async function exportBoardAsHTML() {
  const exportData = {
    exportDate: new Date().toISOString(),
    tasks: []
  };

  for (const task of state.notesData) {
    const taskExport = { ...task };

    if (task.noteEntries && task.noteEntries.length > 0) {
      taskExport.noteEntriesWithImages = [];
      for (const entry of task.noteEntries) {
        const entryExport = { ...entry };
        if (entry.images && entry.images.length > 0) {
          entryExport.imageData = {};
          for (const imageId of entry.images) {
            const dataUrl = await getImage(task.id, imageId);
            if (dataUrl) {
              entryExport.imageData[imageId] = dataUrl;
            }
          }
        }
        taskExport.noteEntriesWithImages.push(entryExport);
      }
      delete taskExport.noteEntries;
    }

    exportData.tasks.push(taskExport);
  }

  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Kanban Board Export - ${getCurrentDate()}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #1e1e1e; color: #e0e0e0; padding: 20px; }
    h1 { color: #4caf50; }
    .task { background: #2c2c2c; padding: 15px; margin: 10px 0; border-radius: 5px; }
    .task h3 { color: #4caf50; margin-top: 0; }
    img { max-width: 100%; margin: 10px 0; border-radius: 5px; }
  </style>
</head>
<body>
  <h1>Kanban Board Export</h1>
  <p>Export Date: ${new Date().toLocaleString()}</p>
  <script type="application/json" id="kanbanData">
${JSON.stringify(exportData, null, 2)}
  </script>
  <div id="preview">
    ${generatePreviewHTML(exportData.tasks)}
  </div>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Kanban_Board_${getCurrentDate()}.html`;
  link.click();
}

function generatePreviewHTML(tasks) {
  let html = '';

  tasks.forEach(task => {
    if (task.deleted) return;

    const priorityColor = task.priority === 'high' ? '#f44336' :
                          task.priority === 'low' ? '#4caf50' :
                          task.priority === 'medium' ? '#ff9800' : 'rgba(255, 255, 255, 0.5)';

    html += `<div class="task">
      <h3>${escapeHtml(task.title)} - ${getColumnName(task.column)}</h3>
      <p><strong>Priority:</strong> <span style="color: ${priorityColor}">${getPriorityLabel(task.priority)}</span></p>
      <p><strong>Timer:</strong> ${formatTime(task.timer || 0)}</p>
    </div>`;
  });

  return html || '<p>No tasks to display</p>';
}

// Main import handler - routes to appropriate parser based on file type
export async function importBoardFromFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.html')) {
    await importBoardFromHTML(file);
  } else if (fileName.endsWith('.txt')) {
    await importBoardFromTXT(file);
  } else {
    alert('Unsupported file type. Please use .html or .txt files.');
  }

  // Reset file input
  event.target.value = '';
}

// Import from HTML (current format)
async function importBoardFromHTML(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const htmlContent = e.target.result;
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      const dataScript = doc.getElementById('kanbanData');

      if (!dataScript) {
        alert('Invalid import file: No data found');
        return;
      }

      const importData = JSON.parse(dataScript.textContent);

      if (!importData.tasks) {
        alert('Invalid import file: No tasks found');
        return;
      }

      if (confirm(`This will replace your current board with ${importData.tasks.length} tasks.\n\nContinue?`)) {
        state.setNotesData([]);
        document.querySelectorAll('.note').forEach(note => note.remove());

        for (const task of importData.tasks) {
          if (task.noteEntriesWithImages) {
            task.noteEntries = [];
            for (const entry of task.noteEntriesWithImages) {
              if (entry.imageData) {
                for (const [imageId, dataUrl] of Object.entries(entry.imageData)) {
                  await storeImage(task.id, imageId, dataUrl);
                }
                delete entry.imageData;
              }
              task.noteEntries.push(entry);
            }
            delete task.noteEntriesWithImages;
          }

          state.notesData.push(task);

          if (!task.deleted) {
            const noteElement = createNoteElement(task);
            const col = document.getElementById(task.column);
            if (col) col.appendChild(noteElement);
          }
        }

        saveNotesToLocalStorage();
        alert('Board imported successfully!');
      }
    } catch (err) {
      console.error('Import error:', err);
      alert('Error importing file: ' + err.message);
    }
  };

  reader.readAsText(file);
}

// Import from TXT (old format - backward compatibility)
async function importBoardFromTXT(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const txtContent = e.target.result;

      // Parse the text format
      const sections = txtContent.split('----------------------').filter(s => s.trim().length > 0);
      const convertedTasks = [];

      // Helper function to map column names to IDs
      function mapColumnToId(columnName) {
        const mapping = {
          'To Do': 'todo',
          'In Progress': 'inProgress',
          'On Hold': 'onHold',
          'Done': 'done'
        };
        return mapping[columnName] || 'todo';
      }

      // Helper function to parse action type from action text
      function parseActionType(actionText) {
        if (actionText.includes('Created')) return 'created';
        if (actionText.includes('Moved')) return 'moved';
        if (actionText.includes('Edited Notes')) return 'edited';
        if (actionText.includes('Timer')) return 'timer';
        return 'other';
      }

      // Parse each section
      for (let section of sections) {
        const lines = section.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        let title = 'Untitled';
        let notes = '';
        let column = 'todo';
        let actions = [];
        let inActionsSection = false;
        let hasValidData = false;

        for (let line of lines) {
          // Skip header and footer lines
          if (line.includes('Kanban Board Export') || line === 'Deleted Items:') {
            continue;
          }

          if (line.startsWith('Title: ')) {
            title = line.substring(7).trim();
            hasValidData = true;
          } else if (line.startsWith('Notes: ')) {
            notes = line.substring(7).trim();
            if (notes === 'No additional notes') {
              notes = '';
            }
          } else if (line.startsWith('Current Column: ')) {
            const columnName = line.substring(16).trim();
            column = mapColumnToId(columnName);
          } else if (line === 'Actions:') {
            inActionsSection = true;
          } else if (inActionsSection && line.startsWith('- ')) {
            // Parse action line
            const actionText = line.substring(2).trim();

            // Extract timestamp (text after " at ")
            let timestamp = new Date().toLocaleString();
            const atIndex = actionText.lastIndexOf(' at ');
            if (atIndex !== -1) {
              timestamp = actionText.substring(atIndex + 4).trim();
            }

            actions.push({
              action: actionText,
              timestamp: timestamp,
              type: parseActionType(actionText)
            });
          }
        }

        // Only create task if we found valid data
        if (!hasValidData) {
          continue;
        }

        // Create the task object with exact same structure as new notes
        const newTask = {
          id: Date.now() + Math.random(),
          title: title,
          noteEntries: [],
          timer: 0,
          priority: null,
          column: column,
          actions: actions.length > 0 ? actions : [{
            action: 'Created (imported from TXT)',
            timestamp: new Date().toLocaleString(),
            type: 'created'
          }]
        };

        // If there are notes, add them as a note entry
        if (notes && notes.length > 0) {
          newTask.noteEntries.push({
            timestamp: actions.length > 0 ? actions[0].timestamp : new Date().toLocaleString(),
            notesHTML: notes,
            images: []
          });
        }

        convertedTasks.push(newTask);
      }

      if (convertedTasks.length === 0) {
        alert('No valid tasks found in TXT file');
        return;
      }

      if (confirm(`This will replace your current board with ${convertedTasks.length} imported tasks.\n\nContinue?`)) {
        state.setNotesData([]);
        document.querySelectorAll('.note').forEach(note => note.remove());

        convertedTasks.forEach(task => {
          state.notesData.push(task);
          const noteElement = createNoteElement(task);
          const col = document.getElementById(task.column);
          if (col) col.appendChild(noteElement);
        });

        saveNotesToLocalStorage();
        alert('Board imported successfully from TXT!');
      }
    } catch (err) {
      console.error('TXT Import error:', err);
      alert('Error importing TXT file: ' + err.message);
    }
  };

  reader.readAsText(file);
}
