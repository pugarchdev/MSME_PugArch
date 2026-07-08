/**
 * Shared utility functions for formatting and downloading exported data.
 */

/**
 * Formats a value for inclusion in a CSV file.
 * Handles quoting strings that contain commas, quotes, or newlines.
 * Escapes internal quotes by doubling them ("").
 */
export const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '""';
  }
  const str = String(value);
  // Always wrap in quotes and escape internal quotes to ensure safe CSV parsing
  return `"${str.replace(/"/g, '""')}"`;
};

/**
 * Triggers a browser download for a Blob.
 */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Triggers a browser download for a file with the given string content.
 */
export const downloadFile = (filename: string, content: string, type: string): void => {
  const blob = new Blob([content], { type: `${type};charset=utf-8;` });
  downloadBlob(blob, filename);
};

/**
 * Formats an array of objects or an array of string arrays into CSV and triggers download.
 * If data is an array of objects, the keys of the first object are used as headers.
 */
export const downloadCsv = (filename: string, rows: unknown[] | unknown[][]): void => {
  if (!rows || rows.length === 0) return;

  let csvContent = '';

  if (Array.isArray(rows[0])) {
    // Array of arrays
    csvContent = (rows as unknown[][])
      .map(row => row.map(cell => csvCell(cell)).join(','))
      .join('\n');
  } else if (typeof rows[0] === 'object' && rows[0] !== null) {
    // Array of objects
    const headers = Object.keys(rows[0] as Record<string, unknown>);
    const headerRow = headers.map(h => csvCell(h)).join(',');
    
    const dataRows = (rows as Record<string, unknown>[]).map(row => {
      return headers.map(key => csvCell(row[key])).join(',');
    });
    
    csvContent = [headerRow, ...dataRows].join('\n');
  }

  downloadFile(filename, csvContent, 'text/csv');
};

/**
 * Triggers a download of a JSON file for the given object.
 */
export const downloadJson = (filename: string, data: unknown): void => {
  downloadFile(filename, JSON.stringify(data, null, 2), 'application/json');
};
