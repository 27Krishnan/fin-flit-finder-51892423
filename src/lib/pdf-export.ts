import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export async function exportPDF(element: HTMLElement, title: string = 'Portfolio Report') {
  // Find all pages by data attribute
  const pages = element.querySelectorAll<HTMLElement>('[data-pdf-page]');
  
  if (pages.length === 0) {
    // Fallback: single page export
    await exportSinglePage(element, title);
    return;
  }

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();

    const canvas = await html2canvas(pages[i], {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 1400,
      imageTimeout: 0,
      removeContainer: false,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.85);
    
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');

    const margin = 2;
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (imgHeight > pageHeight - margin * 2) {
      const scale = (pageHeight - margin * 2) / imgHeight;
      const scaledWidth = imgWidth * scale;
      const scaledHeight = imgHeight * scale;
      const xOffset = (pageWidth - scaledWidth) / 2;
      pdf.addImage(imgData, 'JPEG', xOffset, margin, scaledWidth, scaledHeight);
    } else {
      const xOffset = (pageWidth - imgWidth) / 2;
      const yOffset = (pageHeight - imgHeight) / 2;
      pdf.addImage(imgData, 'JPEG', xOffset, yOffset, imgWidth, imgHeight);
    }
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  pdf.save(`${title.replace(/\s+/g, '_')}_${dateStr}.pdf`);
}

async function exportSinglePage(element: HTMLElement, title: string) {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: 1400,
    imageTimeout: 0,
    removeContainer: false,
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.85);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');

  const margin = 3;
  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  if (imgHeight > pageHeight - margin * 2) {
    const scale = (pageHeight - margin * 2) / imgHeight;
    const scaledWidth = imgWidth * scale;
    const scaledHeight = imgHeight * scale;
    const xOffset = (pageWidth - scaledWidth) / 2;
    pdf.addImage(imgData, 'JPEG', xOffset, margin, scaledWidth, scaledHeight);
  } else {
    const xOffset = (pageWidth - imgWidth) / 2;
    const yOffset = (pageHeight - imgHeight) / 2;
    pdf.addImage(imgData, 'JPEG', xOffset, yOffset, imgWidth, imgHeight);
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  pdf.save(`${title.replace(/\s+/g, '_')}_${dateStr}.pdf`);
}
