/***********************
 * NOTEBOOK EXPORT FUNCTIONS
 ***********************/
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import * as state from './state.js';
import { getNotebookImage } from './database.js';
import { getImageDimensions } from './utils.js';

/***********************
 * PDF EXPORT
 ***********************/
export async function exportPageAsPDF() {
  if (!state.currentPageId) return;

  const page = state.notebookItems.find(i => i.id === state.currentPageId);
  if (!page) return;

  const doc = new jsPDF();

  let yPos = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;

  // Title with "Note:" prefix
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  const titleLines = doc.splitTextToSize(`Note: ${page.name}`, maxWidth);
  titleLines.forEach(line => {
    doc.text(line, margin, yPos);
    yPos += 10;
  });
  yPos += 5;

  // Content
  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');

  const editorEl = document.getElementById('pageEditor');
  if (!editorEl) return;

  // Process content
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = editorEl.innerHTML;

  const childNodes = tempDiv.childNodes;
  for (let i = 0; i < childNodes.length; i++) {
    const node = childNodes[i];

    if (node.nodeName === 'IMG') {
      try {
        let imgSrc = node.dataset.src || node.src;

        // Try to get from IndexedDB
        if (node.dataset.imageId) {
          const dbSrc = await getNotebookImage(state.currentPageId, node.dataset.imageId);
          if (dbSrc) imgSrc = dbSrc;
        }

        if (imgSrc && imgSrc.startsWith('data:')) {
          const dimensions = await getImageDimensions(imgSrc);
          let imgWidth = Math.min(dimensions.width, maxWidth);
          let imgHeight = (imgWidth / dimensions.width) * dimensions.height;
          const maxHeight = 120;
          if (imgHeight > maxHeight) {
            imgHeight = maxHeight;
            imgWidth = (imgHeight / dimensions.height) * dimensions.width;
          }

          if (yPos + imgHeight > doc.internal.pageSize.getHeight() - 20) {
            doc.addPage();
            yPos = 20;
          }

          doc.addImage(imgSrc, 'JPEG', margin, yPos, imgWidth, imgHeight);
          yPos += imgHeight + 10;
        }
      } catch (err) {
        console.warn('Could not add image to PDF:', err);
      }
    } else {
      const text = node.textContent || '';
      if (text.trim()) {
        const lines = doc.splitTextToSize(text, maxWidth);
        for (const line of lines) {
          if (yPos > doc.internal.pageSize.getHeight() - 20) {
            doc.addPage();
            yPos = 20;
          }
          doc.text(line, margin, yPos);
          yPos += 6;
        }
      }
    }
  }

  const safeFileName = page.name.replace(/[^a-z0-9]/gi, '_');
  doc.save(`Note_${safeFileName}.pdf`);
}

/***********************
 * ZIP EXPORT
 ***********************/

// Generate PDF for a page and return as blob
export async function generatePagePDFBlob(pageId) {
  const page = state.notebookItems.find(i => i.id === pageId);
  if (!page || page.type !== 'page') return null;

  const doc = new jsPDF();

  let yPos = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;

  // Title with "Note:" prefix
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  const titleLines = doc.splitTextToSize(`Note: ${page.name}`, maxWidth);
  titleLines.forEach(line => {
    doc.text(line, margin, yPos);
    yPos += 10;
  });
  yPos += 5;

  // Content
  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');

  // Process content
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = page.content || '';

  const childNodes = tempDiv.childNodes;
  for (let i = 0; i < childNodes.length; i++) {
    const node = childNodes[i];

    if (node.nodeName === 'IMG') {
      try {
        let imgSrc = node.dataset.src || node.src;

        // Try to get from IndexedDB
        if (node.dataset.imageId) {
          const dbSrc = await getNotebookImage(pageId, node.dataset.imageId);
          if (dbSrc) imgSrc = dbSrc;
        }

        if (imgSrc && imgSrc.startsWith('data:')) {
          const dimensions = await getImageDimensions(imgSrc);
          let imgWidth = Math.min(dimensions.width, maxWidth);
          let imgHeight = (imgWidth / dimensions.width) * dimensions.height;
          const maxHeight = 120;
          if (imgHeight > maxHeight) {
            imgHeight = maxHeight;
            imgWidth = (imgHeight / dimensions.height) * dimensions.width;
          }

          if (yPos + imgHeight > doc.internal.pageSize.getHeight() - 20) {
            doc.addPage();
            yPos = 20;
          }

          doc.addImage(imgSrc, 'JPEG', margin, yPos, imgWidth, imgHeight);
          yPos += imgHeight + 10;
        }
      } catch (err) {
        console.warn('Could not add image to PDF:', err);
      }
    } else {
      const text = node.textContent || '';
      if (text.trim()) {
        const lines = doc.splitTextToSize(text, maxWidth);
        for (const line of lines) {
          if (yPos > doc.internal.pageSize.getHeight() - 20) {
            doc.addPage();
            yPos = 20;
          }
          doc.text(line, margin, yPos);
          yPos += 6;
        }
      }
    }
  }

  return doc.output('blob');
}

// Get all descendants of a folder (recursive)
export function getAllDescendants(parentId) {
  const children = state.notebookItems.filter(i => i.parentId === parentId);
  let descendants = [...children];
  children.forEach(child => {
    if (child.type === 'folder') {
      descendants = descendants.concat(getAllDescendants(child.id));
    }
  });
  return descendants;
}

// Build folder path for an item
export function getItemPath(itemId) {
  const parts = [];
  let current = state.notebookItems.find(i => i.id === itemId);

  while (current) {
    parts.unshift(current.name.replace(/[^a-z0-9 ]/gi, '_'));
    current = current.parentId ? state.notebookItems.find(i => i.id === current.parentId) : null;
  }

  return parts.join('/');
}

// Export a folder and all its contents as ZIP
export async function exportFolderAsZip(folderId) {
  const folder = state.notebookItems.find(i => i.id === folderId && i.type === 'folder');
  if (!folder) return;

  const zip = new JSZip();
  const folderName = folder.name.replace(/[^a-z0-9 ]/gi, '_');

  // Get all items in this folder (recursive)
  const descendants = getAllDescendants(folderId);
  const pages = descendants.filter(i => i.type === 'page');
  const folders = descendants.filter(i => i.type === 'folder');

  if (pages.length === 0) {
    alert('This folder has no pages to export.');
    return;
  }

  // Include notebook data JSON for reimport (folder + all descendants)
  const allItems = [folder, ...descendants];
  const notebookData = {
    exportDate: new Date().toISOString(),
    version: 1,
    items: allItems.map(item => ({
      ...item,
      // Reset parentId for the root folder to null (so it imports at root level)
      parentId: item.id === folderId ? null : item.parentId,
      images: [],
    })),
  };

  // Fetch images from IndexedDB and include them
  for (const item of notebookData.items) {
    if (item.type === 'page' && item.content) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = item.content;
      const images = tempDiv.querySelectorAll('img[data-image-id]');
      for (const img of images) {
        const imageId = img.dataset.imageId;
        if (imageId) {
          const dataUrl = await getNotebookImage(item.id, imageId);
          if (dataUrl) {
            item.images.push({ id: imageId, data: dataUrl });
          }
        }
      }
    }
  }

  zip.file('notebook_data.json', JSON.stringify(notebookData, null, 2));

  // Also include PDFs for readability
  for (const page of pages) {
    const pdfBlob = await generatePagePDFBlob(page.id);
    if (pdfBlob) {
      const fullPath = getItemPath(page.id);
      const folderPath = getItemPath(folderId);
      let relativePath = fullPath;
      if (fullPath.startsWith(folderPath + '/')) {
        relativePath = fullPath.substring(folderPath.length + 1);
      }

      const safeName = page.name.replace(/[^a-z0-9 ]/gi, '_');
      zip.file(`${relativePath.replace(safeName, '')}Note_${safeName}.pdf`, pdfBlob);
    }
  }

  // Generate and download ZIP
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${folderName}_Notes.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export all notebook items as ZIP
export async function exportAllNotebook() {
  const allPages = state.notebookItems.filter(i => i.type === 'page');

  if (allPages.length === 0) {
    alert('No pages to export.');
    return;
  }

  const zip = new JSZip();

  // Include notebook data JSON for reimport (contains all items with content)
  const notebookData = {
    exportDate: new Date().toISOString(),
    version: 1,
    items: state.notebookItems.map(item => ({
      ...item,
      // Include images inline for pages
      images: [],
    })),
  };

  // Fetch images from IndexedDB and include them
  for (const item of notebookData.items) {
    if (item.type === 'page' && item.content) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = item.content;
      const images = tempDiv.querySelectorAll('img[data-image-id]');
      for (const img of images) {
        const imageId = img.dataset.imageId;
        if (imageId) {
          const dataUrl = await getNotebookImage(item.id, imageId);
          if (dataUrl) {
            item.images.push({ id: imageId, data: dataUrl });
          }
        }
      }
    }
  }

  zip.file('notebook_data.json', JSON.stringify(notebookData, null, 2));

  // Also include PDFs for readability
  for (const page of allPages) {
    const pdfBlob = await generatePagePDFBlob(page.id);
    if (pdfBlob) {
      const fullPath = getItemPath(page.id);
      const pathParts = fullPath.split('/');
      const pageName = pathParts.pop();
      const folderPath = pathParts.join('/');

      const safeName = page.name.replace(/[^a-z0-9 ]/gi, '_');
      const filePath = folderPath ? `${folderPath}/Note_${safeName}.pdf` : `Note_${safeName}.pdf`;
      zip.file(filePath, pdfBlob);
    }
  }

  // Generate and download ZIP
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  const timestamp = new Date().toISOString().split('T')[0];
  a.download = `Notebook_Export_${timestamp}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
