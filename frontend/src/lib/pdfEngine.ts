import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate } from '../features/shared/format';

/**
 * Enterprise PDF Engine for MSME Procurement Portal
 * Generates SAP/Odoo style ERP documents.
 */

export interface DocumentParty {
  title: string;
  name?: string;
  email?: string;
  address?: string;
  phone?: string;
  gstin?: string;
  pan?: string;
  details?: string[]; // Extra details (e.g. Vendor ID, Dept)
}

export interface DocumentFinancials {
  subtotal?: number;
  discount?: number;
  taxableAmount?: number;
  igst?: number;
  cgst?: number;
  sgst?: number;
  totalTax?: number;
  tds?: number;
  shipping?: number;
  grandTotal: number;
  amountInWords?: string;
}

export interface DocumentConfig {
  documentTitle: string;
  documentNumber: string;
  referenceNumber?: string;
  dateStr: string;
  status?: string;
  parties: DocumentParty[]; // Usually Buyer and Seller
  infoGrid?: Record<string, string>; // Small grid of info (e.g. Delivery Type, Payment Terms)
  tableHeaders: string[];
  tableData: any[][];
  financials?: DocumentFinancials;
  notes?: string[];
  terms?: string[];
  footerNote?: string;
  currency?: string;
  logoBase64?: string;
  watermark?: string;
}

const PRIMARY_COLOR: [number, number, number] = [11, 36, 71]; // #0b2447 deep navy
const SECONDARY_COLOR: [number, number, number] = [30, 64, 114];
const ACCENT_COLOR: [number, number, number] = [230, 235, 241];
const TEXT_DARK: [number, number, number] = [15, 23, 42];
const TEXT_MUTED: [number, number, number] = [100, 116, 139];

export const fallbackStr = (val: any, fallback = 'N/A') => {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'number' && Number.isNaN(val)) return fallback;
  return String(val);
};

export const moneyPdf = (val: any, currency = 'INR') => {
  const num = Number(val || 0);
  if (!Number.isFinite(num) || num === 0) return `${currency} 0.00`;
  return `${currency} ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const numberToWords = (amount: number): string => {
  if (amount === 0) return 'Zero Rupees';
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  const toWords = (num: number): string => {
    if (num < 20) return units[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + units[num % 10] : '');
    if (num < 1000) return units[Math.floor(num / 100)] + ' Hundred' + (num % 100 !== 0 ? ' and ' + toWords(num % 100) : '');
    if (num < 100000) return toWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 !== 0 ? ' ' + toWords(num % 1000) : '');
    if (num < 10000000) return toWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 !== 0 ? ' ' + toWords(num % 100000) : '');
    return toWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 !== 0 ? ' ' + toWords(num % 10000000) : '');
  };

  const whole = Math.floor(amount);
  const fraction = Math.round((amount - whole) * 100);
  
  let words = toWords(whole) + ' Rupees';
  if (fraction > 0) {
    words += ' and ' + toWords(fraction) + ' Paise';
  }
  return words + ' Only';
};

export class PdfEngine {
  private doc: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private cursorY: number = 0;
  
  constructor(orientation: 'p' | 'l' = 'p') {
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', orientation });
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
  }

  public getDoc() {
    return this.doc;
  }

  private drawHeader(config: DocumentConfig) {
    // Top colored band
    this.doc.setFillColor(...PRIMARY_COLOR);
    this.doc.rect(0, 0, this.pageWidth, 36, 'F');
    
    // Header Text
    this.doc.setTextColor(255, 255, 255);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(18);
    if (config.logoBase64) {
      this.doc.addImage(config.logoBase64, 'PNG', 14, 5, 26, 26);
      this.doc.text('JSGSMILE MSME Procurement', 45, 16);
      this.doc.text('A Unified Enterprise Network', 45, 23);
    } else {
      this.doc.text('JSGSMILE MSME Procurement', 14, 16);
      this.doc.text('A Unified Enterprise Network', 14, 23);
    }

    // Document Title & Number
    this.doc.setFontSize(16);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(config.documentTitle.toUpperCase(), this.pageWidth - 14, 16, { align: 'right' });
    
    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'normal');
    this.doc.text(`No: ${config.documentNumber}`, this.pageWidth - 14, 23, { align: 'right' });
    this.doc.text(`Date: ${config.dateStr}`, this.pageWidth - 14, 28, { align: 'right' });
    
    if (config.status) {
      this.doc.text(`Status: ${config.status}`, this.pageWidth - 14, 33, { align: 'right' });
    }

    this.cursorY = 44;
  }

  private drawParties(parties: DocumentParty[]) {
    if (!parties || parties.length === 0) return;

    const head: string[] = parties.map(p => p.title);
    const body: string[][] = [parties.map(p => {
      const lines: string[] = [];
      if (p.name) lines.push(p.name);
      if (p.address) lines.push(`Address: ${p.address}`);
      if (p.email) lines.push(`Email: ${p.email}`);
      if (p.phone) lines.push(`Phone: ${p.phone}`);
      if (p.gstin) lines.push(`GSTIN: ${p.gstin}`);
      if (p.pan) lines.push(`PAN: ${p.pan}`);
      if (p.details && p.details.length > 0) {
        lines.push(...p.details);
      }
      return lines.filter(Boolean).join('\n');
    })];

    autoTable(this.doc, {
      startY: this.cursorY,
      theme: 'grid',
      head: [head],
      body: body,
      headStyles: { fillColor: SECONDARY_COLOR, fontStyle: 'bold', textColor: 255 },
      styles: { fontSize: 8.5, cellPadding: 3.5, valign: 'top', textColor: TEXT_DARK },
      columnStyles: parties.reduce((acc, _, idx) => ({ ...acc, [idx]: { cellWidth: (this.pageWidth - 28) / parties.length } }), {})
    });
    
    this.cursorY = (this.doc as any).lastAutoTable.finalY + 6;
  }

  private drawInfoGrid(infoGrid?: Record<string, string>) {
    if (!infoGrid || Object.keys(infoGrid).length === 0) return;

    const keys = Object.keys(infoGrid);
    const values = Object.values(infoGrid);

    autoTable(this.doc, {
      startY: this.cursorY,
      theme: 'grid',
      head: [keys],
      body: [values],
      headStyles: { fillColor: ACCENT_COLOR, textColor: TEXT_DARK, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2.5, textColor: TEXT_DARK },
    });

    this.cursorY = (this.doc as any).lastAutoTable.finalY + 6;
  }

  private drawItems(config: DocumentConfig) {
    if (!config.tableData || config.tableData.length === 0) return;

    autoTable(this.doc, {
      startY: this.cursorY,
      theme: 'striped',
      head: [config.tableHeaders],
      body: config.tableData,
      headStyles: { fillColor: PRIMARY_COLOR, fontStyle: 'bold', textColor: 255 },
      bodyStyles: { textColor: TEXT_DARK },
      styles: { fontSize: 8.5, cellPadding: 3, overflow: 'linebreak' },
      didParseCell: (data) => {
        // Right align money columns if it matches expected patterns
        if (data.section === 'body' || data.section === 'head') {
          const text = String(data.cell.raw || '').toLowerCase();
          if (text.includes('amount') || text.includes('total') || text.includes('rate') || text.includes('qty') || text.includes('tax') || text.includes('price')) {
            data.cell.styles.halign = 'right';
          }
        }
      }
    });

    this.cursorY = (this.doc as any).lastAutoTable.finalY + 6;
  }

  private drawFinancials(financials?: DocumentFinancials) {
    if (!financials) return;

    const boxWidth = 80;
    const startX = this.pageWidth - boxWidth - 14;
    let y = this.cursorY;
    const currency = (this as any)._currentCurrency || 'INR';

    // Check if we need a new page for financials
    if (y + 40 > this.pageHeight - 30) {
      this.doc.addPage();
      y = 20;
    }

    this.doc.setFontSize(9);
    
    const drawLine = (label: string, val: number | undefined, isBold = false) => {
      if (val === undefined || Number.isNaN(val)) return;
      if (isBold) this.doc.setFont('helvetica', 'bold');
      else this.doc.setFont('helvetica', 'normal');
      
      this.doc.text(label, startX, y);
      this.doc.text(moneyPdf(val, currency), this.pageWidth - 14, y, { align: 'right' });
      y += 5;
    };

    drawLine('Subtotal', financials.subtotal);
    drawLine('Discount', financials.discount);
    drawLine('Taxable Amount', financials.taxableAmount);
    drawLine('CGST', financials.cgst);
    drawLine('SGST', financials.sgst);
    drawLine('IGST', financials.igst);
    drawLine('Total Tax', financials.totalTax);
    drawLine('TDS', financials.tds);
    drawLine('Shipping/Freight', financials.shipping);
    
    y += 2;
    this.doc.setDrawColor(200, 200, 200);
    this.doc.line(startX, y - 4, this.pageWidth - 14, y - 4);
    
    this.doc.setFontSize(11);
    drawLine('Grand Total', financials.grandTotal, true);
    
    y += 2;
    
    // Amount in Words
    if (financials.grandTotal > 0 && !Number.isNaN(financials.grandTotal)) {
      this.doc.setFontSize(8.5);
      this.doc.setFont('helvetica', 'italic');
      this.doc.setTextColor(...TEXT_MUTED);
      
      const words = financials.amountInWords || numberToWords(financials.grandTotal);
      
      const lines = this.doc.splitTextToSize(`Amount in words: ${words}`, this.pageWidth - 28);
      this.doc.text(lines, 14, y);
      y += (lines.length * 4) + 4;
    }

    this.cursorY = Math.max(this.cursorY, y);
  }

  private drawNotesAndTerms(config: DocumentConfig) {
    let y = this.cursorY + 6;

    if (y > this.pageHeight - 40) {
      this.doc.addPage();
      y = 20;
    }

    this.doc.setTextColor(...TEXT_DARK);
    
    if (config.notes && config.notes.length > 0) {
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(9);
      this.doc.text('Notes / Remarks:', 14, y);
      y += 5;
      
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      config.notes.forEach(note => {
        const lines = this.doc.splitTextToSize(`• ${note}`, this.pageWidth - 28);
        this.doc.text(lines, 14, y);
        y += (lines.length * 4);
      });
      y += 4;
    }

    if (config.terms && config.terms.length > 0) {
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(9);
      this.doc.text('Terms & Conditions:', 14, y);
      y += 5;
      
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      config.terms.forEach((term, i) => {
        const lines = this.doc.splitTextToSize(`${i + 1}. ${term}`, this.pageWidth - 28);
        this.doc.text(lines, 14, y);
        y += (lines.length * 4);
      });
    }
    
    this.cursorY = y;
  }

  private drawSignatures(config: DocumentConfig) {
    let y = this.cursorY + 15;
    if (y + 30 > this.pageHeight - 20) {
      this.doc.addPage();
      y = 20;
    }

    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.doc.setTextColor(...TEXT_DARK);
    
    // Ensure we have parties to draw sigs for
    if (config.parties && config.parties.length >= 2) {
      this.doc.text(`For ${fallbackStr(config.parties[0].name, 'Buyer')}`, 20, y);
      this.doc.text(`For ${fallbackStr(config.parties[1].name, 'Seller')}`, this.pageWidth - 20, y, { align: 'right' });
      
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      this.doc.setTextColor(...TEXT_MUTED);
      this.doc.text('Authorized Signatory', 20, y + 15);
      this.doc.text('Authorized Signatory', this.pageWidth - 20, y + 15, { align: 'right' });
    } else {
       this.doc.text('Authorized Signatory', this.pageWidth - 20, y + 15, { align: 'right' });
    }
    
    this.cursorY = y + 20;
  }

  private drawFooter() {
    const pageCount = (this.doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      this.doc.setPage(i);
      this.doc.setFontSize(8);
      this.doc.setTextColor(...TEXT_MUTED);
      
      this.doc.setDrawColor(200, 200, 200);
      this.doc.line(14, this.pageHeight - 12, this.pageWidth - 14, this.pageHeight - 12);
      
      this.doc.text('Generated via JSGSMILE MSME Procurement ERP', 14, this.pageHeight - 8);
      this.doc.text(`Page ${i} of ${pageCount}`, this.pageWidth - 14, this.pageHeight - 8, { align: 'right' });
    }
  }

  public generate(config: DocumentConfig) {
    (this as any)._currentCurrency = config.currency || 'INR';
    this.drawHeader(config);
    this.drawParties(config.parties);
    this.drawInfoGrid(config.infoGrid);
    this.drawItems(config);
    this.drawFinancials(config.financials);
    this.drawNotesAndTerms(config);
    this.drawSignatures(config);
    this.drawFooter();
    
    if (config.watermark) {
      const pageCount = (this.doc as any).internal.getNumberOfPages();
      this.doc.setFontSize(60);
      this.doc.setTextColor(200, 200, 200);
      for (let i = 1; i <= pageCount; i++) {
        this.doc.setPage(i);
        this.doc.text(config.watermark.toUpperCase(), this.pageWidth / 2, this.pageHeight / 2, { angle: 45, align: 'center' });
      }
    }
    
    return this.doc;
  }
}
