import * as XLSX from 'xlsx';
import path from 'path';
import { ApiError } from '../../utils/ApiError.js';
import { auditWorkflow, db, type WorkflowActor } from './workflow-common.js';
import { catalogueWorkflow } from './catalogue-workflow.service.js';
import { uploadFile } from '../storage/storage.service.js';

const parseUrls = (value: unknown): string[] => {
  const str = String(value ?? '').trim();
  if (!str) return [];
  const splitChar = str.includes(',') ? ',' : (str.includes(';') ? ';' : ' ');
  return str
    .split(splitChar)
    .map(u => u.trim())
    .filter(u => u && (u.startsWith('http://') || u.startsWith('https://')));
};

async function downloadAndUploadUrl(
  url: string,
  userId: number,
  role: string,
  entityType: 'catalogue_product' | 'catalogue_service'
) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[Catalogue Import] Failed to fetch URL: ${url}, status: ${res.status}`);
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) {
      console.warn(`[Catalogue Import] Empty file downloaded from URL: ${url}`);
      return null;
    }

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    let originalName = 'imported_file';
    try {
      originalName = path.basename(new URL(url).pathname) || 'imported_file';
    } catch (e) {
      // Ignore
    }
    if (!path.extname(originalName)) {
      const ext = contentType.includes('jpeg') ? '.jpg' : (contentType.includes('png') ? '.png' : (contentType.includes('pdf') ? '.pdf' : '.bin'));
      originalName += ext;
    }

    const mockFile: Express.Multer.File = {
      buffer,
      originalname: originalName,
      mimetype: contentType,
      size: buffer.length,
      fieldname: 'file',
      encoding: '7bit',
      destination: '',
      filename: '',
      path: '',
      stream: null as any
    };

    const asset = await uploadFile(mockFile, {
      ownerId: userId,
      ownerRole: role,
      entityType
    });

    return asset.id;
  } catch (err: any) {
    console.error(`[Catalogue Import] Error downloading/uploading file from URL ${url}:`, err);
    return null;
  }
}


const MAX_ROWS = 1000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const clean = (value: unknown) => String(value ?? '').trim();
const sanitizeText = (value: unknown, max = 4000) => clean(value).slice(0, max) || null;

const parseBool = (value: unknown): boolean | null => {
  const v = clean(value).toLowerCase();
  if (!v) return null;
  if (['yes', 'true', '1', 'y'].includes(v)) return true;
  if (['no', 'false', '0', 'n'].includes(v)) return false;
  return null;
};

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const parseDate = (value: unknown): Date | null => {
  const v = clean(value);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const normalizeHeader = (h: unknown) => clean(h).toLowerCase().replace(/\s+/g, ' ');

const PRODUCT_STATUSES = new Set(['DRAFT', 'ACTIVE', 'INACTIVE']);
const PRICING_MODELS = new Set(['FIXED', 'HOURLY', 'DAILY', 'MONTHLY', 'PER_PROJECT', 'CUSTOM']);

type RowError = { rowNumber: number; field?: string; message: string; rawData?: Record<string, unknown> };

const readSheetRows = (workbook: XLSX.WorkBook, sheetName: string) => {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { headers: [] as string[], rows: [] as Record<string, unknown>[] };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
  if (matrix.length === 0) return { headers: [], rows: [] };
  const headers = (matrix[0] || []).map(h => clean(h));
  const rows = matrix.slice(1).map((row, idx) => {
    const record: Record<string, unknown> = { __rowNumber: idx + 2 };
    headers.forEach((header, colIdx) => {
      if (header) record[header] = row?.[colIdx] ?? '';
    });
    return record;
  }).filter(row => Object.keys(row).some(k => k !== '__rowNumber' && clean(row[k])));
  return { headers, rows };
};

const col = (row: Record<string, unknown>, ...names: string[]) => {
  const keys = Object.keys(row);
  for (const name of names) {
    const target = normalizeHeader(name);
    const key = keys.find(k => normalizeHeader(k) === target);
    if (key) return row[key];
  }
  return '';
};

const assertApprovedSeller = async (actor: WorkflowActor) => {
  if (actor.role === 'admin') return;
  const user = await db.user.findUnique({ where: { id: actor.id }, select: { role: true, onboardingStatus: true } });
  if (user?.role !== 'seller' || !['approved_for_procurement', 'approved'].includes(String(user.onboardingStatus))) {
    throw new ApiError(403, 'Your seller account must be approved before importing catalogue items.', 'SELLER_NOT_APPROVED');
  }
};

const categoryMap = async (type: 'PRODUCT' | 'SERVICE') => {
  const categories = await db.category.findMany({
    where: { isActive: true, OR: [{ type: type === 'PRODUCT' ? 'PRODUCT' : 'SERVICE' }, { type: 'BOTH' }] },
    select: { id: true, name: true }
  });
  const map = new Map<string, number>();
  categories.forEach(c => map.set(c.name.trim().toLowerCase(), c.id));
  return map;
};

const productInstructions = () => [
  ['Catalogue Product Import Instructions'],
  [''],
  ['1. Do not rename column headers in the Products or Product Specifications sheets.'],
  ['2. Required columns must be filled for each product row.'],
  ['3. Status allowed values: DRAFT, ACTIVE, INACTIVE'],
  ['4. Currency allowed: INR (defaults to INR if blank)'],
  ['5. MSME Made / Bulk Deal Available: Yes or No'],
  ['6. Dates must be YYYY-MM-DD format'],
  ['7. Price and GST Rate must be numeric'],
  ['8. Imported records save as DRAFT unless Status is ACTIVE and you confirm publish'],
  ['9. SKU must be unique per seller'],
  ['10. Link specifications using Product SKU or Product Name']
];

const serviceInstructions = () => [
  ['Catalogue Service Import Instructions'],
  [''],
  ['1. Do not rename column headers in the Services or Service Specifications sheets.'],
  ['2. Required columns must be filled for each service row.'],
  ['3. Status allowed values: DRAFT, ACTIVE, INACTIVE'],
  ['4. Pricing Model: FIXED, HOURLY, DAILY, MONTHLY, PER_PROJECT, CUSTOM'],
  ['5. Currency allowed: INR'],
  ['6. Dates must be YYYY-MM-DD format'],
  ['7. Imported records save as DRAFT by default on confirm']
];

export const catalogueImportService = {
  async generateProductTemplate() {
    const categories = await db.category.findMany({
      where: { isActive: true, OR: [{ type: 'PRODUCT' }, { type: 'BOTH' }] },
      select: { name: true },
      orderBy: { name: 'asc' }
    });
    const wb = XLSX.utils.book_new();
    const productHeaders = [
      'Product Name', 'Category', 'Status', 'Description', 'Price', 'Currency', 'GST Rate',
      'Unit Of Measure', 'HSN Code', 'SKU', 'Brand', 'Model Number', 'Item Condition', 'MSME Made',
      'Original Price', 'Discount Price', 'Discount Percent', 'Offer Label', 'Offer Start Date',
      'Offer End Date', 'Bulk Deal Available', 'Bulk Minimum Quantity', 'Image URLs', 'Document URLs'
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([productHeaders]), 'Products');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Product SKU', 'Product Name', 'Specification Name', 'Specification Value', 'Unit']
    ]), 'Product Specifications');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(productInstructions()), 'Instructions');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Categories', 'Statuses', 'Units', 'Item Conditions'],
      ...Array.from({ length: Math.max(categories.length, 4) }, (_, i) => [
        categories[i]?.name || '',
        ['DRAFT', 'ACTIVE', 'INACTIVE'][i] || '',
        ['Nos', 'Kg', 'Ltr', 'Set', 'Box'][i] || '',
        ['NEW', 'USED', 'REFURBISHED'][i] || ''
      ])
    ]), 'Dropdown Values');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  },

  async generateServiceTemplate() {
    const categories = await db.category.findMany({
      where: { isActive: true, OR: [{ type: 'SERVICE' }, { type: 'BOTH' }] },
      select: { name: true },
      orderBy: { name: 'asc' }
    });
    const wb = XLSX.utils.book_new();
    const serviceHeaders = [
      'Service Name', 'Category', 'Status', 'Description', 'Pricing Model', 'Base Price', 'Currency',
      'GST Rate', 'Service Area', 'Scope Of Work', 'Deliverables', 'SLA Response Time', 'Duration',
      'Offer Label', 'Offer Start Date', 'Offer End Date', 'Document URLs'
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([serviceHeaders]), 'Services');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Service Name', 'Specification Name', 'Specification Value', 'Unit']
    ]), 'Service Specifications');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(serviceInstructions()), 'Instructions');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Categories', 'Pricing Models', 'Statuses'],
      ...Array.from({ length: Math.max(categories.length, 6) }, (_, i) => [
        categories[i]?.name || '',
        ['FIXED', 'HOURLY', 'DAILY', 'MONTHLY', 'PER_PROJECT', 'CUSTOM'][i] || '',
        ['DRAFT', 'ACTIVE', 'INACTIVE'][i] || ''
      ])
    ]), 'Dropdown Values');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  },

  async previewProductImport(actor: WorkflowActor, file: Express.Multer.File) {
    await assertApprovedSeller(actor);
    return this.previewImport(actor, file, 'PRODUCT');
  },

  async previewServiceImport(actor: WorkflowActor, file: Express.Multer.File) {
    await assertApprovedSeller(actor);
    return this.previewImport(actor, file, 'SERVICE');
  },

  async previewImport(actor: WorkflowActor, file: Express.Multer.File, type: 'PRODUCT' | 'SERVICE') {
    if (!file?.buffer) throw new ApiError(400, 'Excel file is required', 'FILE_REQUIRED');
    if (file.size > MAX_FILE_BYTES) throw new ApiError(400, 'File exceeds 10MB limit', 'FILE_TOO_LARGE');
    const ext = clean(file.originalname).toLowerCase();
    if (!ext.endsWith('.xlsx')) throw new ApiError(400, 'Only .xlsx files are supported', 'INVALID_FILE_TYPE');

    const workbook = XLSX.read(file.buffer, { type: 'buffer', cellFormula: false, cellHTML: false });
    const mainSheet = type === 'PRODUCT' ? 'Products' : 'Services';
    const specSheet = type === 'PRODUCT' ? 'Product Specifications' : 'Service Specifications';
    const { headers, rows } = readSheetRows(workbook, mainSheet);
    if (rows.length === 0) {
      const fallback = readSheetRows(workbook, workbook.SheetNames[0] || '');
      if (fallback.rows.length === 0) throw new ApiError(400, 'Workbook contains no data rows', 'EMPTY_FILE');
    }
    const dataRows = rows.length > 0 ? rows : readSheetRows(workbook, workbook.SheetNames[0] || '').rows;
    if (dataRows.length > MAX_ROWS) throw new ApiError(400, `Maximum ${MAX_ROWS} rows allowed per import`, 'TOO_MANY_ROWS');

    const specData = readSheetRows(workbook, specSheet).rows;
    const categories = await categoryMap(type);
    const existingSkus = type === 'PRODUCT'
      ? new Set((await db.product.findMany({ where: { sellerId: actor.id, sku: { not: null } }, select: { sku: true } })).map(p => clean(p.sku).toLowerCase()))
      : new Set<string>();

    const rowErrors: RowError[] = [];
    const warnings: string[] = [];
    const validRows: Record<string, unknown>[] = [];
    const seenKeys = new Set<string>();
    let duplicateRows = 0;

    const unknownHeaders = headers.filter(h => h && ![
      'Product Name', 'Service Name', 'Category', 'Status', 'Description', 'Price', 'Currency', 'GST Rate',
      'Unit Of Measure', 'HSN Code', 'SKU', 'Brand', 'Model Number', 'Item Condition', 'MSME Made',
      'Original Price', 'Discount Price', 'Discount Percent', 'Offer Label', 'Offer Start Date', 'Offer End Date',
      'Bulk Deal Available', 'Bulk Minimum Quantity', 'Image URLs', 'Document URLs',
      'Pricing Model', 'Base Price', 'Service Area', 'Scope Of Work', 'Deliverables', 'SLA Response Time', 'Duration'
    ].some(k => normalizeHeader(k) === normalizeHeader(h)));
    if (unknownHeaders.length) warnings.push(`Unknown columns ignored: ${unknownHeaders.join(', ')}`);

    for (const row of dataRows) {
      const rowNumber = Number(row.__rowNumber || 0);
      const errors: RowError[] = [];
      const name = sanitizeText(col(row, 'Product Name', 'Service Name'), 200);
      const categoryName = sanitizeText(col(row, 'Category'), 120);
      const statusRaw = clean(col(row, 'Status')).toUpperCase() || 'DRAFT';
      const description = sanitizeText(col(row, 'Description'));
      const price = parseNumber(col(row, 'Price', 'Base Price'));
      const gst = parseNumber(col(row, 'GST Rate'));
      const currency = clean(col(row, 'Currency')).toUpperCase() || 'INR';

      if (!name) errors.push({ rowNumber, field: 'name', message: 'Name is required', rawData: row });
      if (!categoryName) errors.push({ rowNumber, field: 'category', message: 'Category is required', rawData: row });
      else if (!categories.has(categoryName.toLowerCase())) errors.push({ rowNumber, field: 'category', message: `Category "${categoryName}" not found`, rawData: row });
      if (!PRODUCT_STATUSES.has(statusRaw)) errors.push({ rowNumber, field: 'status', message: 'Status must be DRAFT, ACTIVE, or INACTIVE', rawData: row });
      if (!description) errors.push({ rowNumber, field: 'description', message: 'Description is required', rawData: row });
      if (type === 'PRODUCT') {
        const uom = sanitizeText(col(row, 'Unit Of Measure'), 40);
        if (!uom) errors.push({ rowNumber, field: 'unitOfMeasure', message: 'Unit Of Measure is required', rawData: row });
        if (price === null || price < 0) errors.push({ rowNumber, field: 'price', message: 'Price must be a number >= 0', rawData: row });
      } else {
        const pricingModel = clean(col(row, 'Pricing Model')).toUpperCase() || 'FIXED';
        if (!PRICING_MODELS.has(pricingModel)) errors.push({ rowNumber, field: 'pricingModel', message: 'Invalid pricing model', rawData: row });
        const serviceArea = sanitizeText(col(row, 'Service Area'), 300);
        if (!serviceArea) errors.push({ rowNumber, field: 'serviceArea', message: 'Service Area is required', rawData: row });
        const basePrice = parseNumber(col(row, 'Base Price'));
        if (pricingModel === 'FIXED' && (basePrice === null || basePrice < 0)) {
          errors.push({ rowNumber, field: 'basePrice', message: 'Base Price required for FIXED pricing', rawData: row });
        }
      }
      if (gst !== null && (gst < 0 || gst > 40)) errors.push({ rowNumber, field: 'gstRate', message: 'GST Rate must be between 0 and 40', rawData: row });
      if (currency !== 'INR') errors.push({ rowNumber, field: 'currency', message: 'Only INR currency is supported', rawData: row });

      const offerStart = parseDate(col(row, 'Offer Start Date'));
      const offerEnd = parseDate(col(row, 'Offer End Date'));
      if (offerStart && offerEnd && offerEnd < offerStart) {
        errors.push({ rowNumber, field: 'offerEndAt', message: 'Offer end date cannot be before start date', rawData: row });
      }

      const sku = type === 'PRODUCT' ? sanitizeText(col(row, 'SKU'), 80) : null;
      const dedupeKey = type === 'PRODUCT' ? (sku || name || '').toLowerCase() : (name || '').toLowerCase();
      if (dedupeKey) {
        if (seenKeys.has(dedupeKey)) {
          duplicateRows += 1;
          errors.push({ rowNumber, field: 'duplicate', message: 'Duplicate row in file', rawData: row });
        } else {
          seenKeys.add(dedupeKey);
        }
        if (type === 'PRODUCT' && sku && existingSkus.has(sku.toLowerCase())) {
          errors.push({ rowNumber, field: 'sku', message: `SKU "${sku}" already exists in your catalogue`, rawData: row });
        }
      }

      if (errors.length) {
        rowErrors.push(...errors);
        continue;
      }

      const specs = specData.filter(s => {
        const specName = type === 'PRODUCT'
          ? clean(col(s, 'Product SKU', 'Product Name')).toLowerCase()
          : clean(col(s, 'Service Name')).toLowerCase();
        const key = type === 'PRODUCT' ? (sku || name || '').toLowerCase() : (name || '').toLowerCase();
        return specName && key && specName === key;
      }).map(s => ({
        name: sanitizeText(col(s, 'Specification Name'), 120),
        value: sanitizeText(col(s, 'Specification Value'), 500),
        unit: sanitizeText(col(s, 'Unit'), 40)
      })).filter(s => s.name && s.value);

      const imageUrls = parseUrls(col(row, 'Image URLs'));
      const docUrls = parseUrls(col(row, 'Document URLs'));

      const imageIds: number[] = [];
      const imageResults = await Promise.all(
        imageUrls.map(url => downloadAndUploadUrl(url, actor.id, actor.role, 'catalogue_product'))
      );
      for (const id of imageResults) {
        if (id) imageIds.push(id);
      }

      const documentIds: number[] = [];
      const docResults = await Promise.all(
        docUrls.map(url => downloadAndUploadUrl(url, actor.id, actor.role, type === 'PRODUCT' ? 'catalogue_product' : 'catalogue_service'))
      );
      for (const id of docResults) {
        if (id) documentIds.push(id);
      }

      validRows.push({
        rowNumber,
        name,
        categoryId: categories.get(String(categoryName).toLowerCase()),
        status: statusRaw,
        description,
        currency: 'INR',
        taxRate: gst ?? 0,
        specifications: specs,
        imageIds,
        documentIds,
        ...(type === 'PRODUCT'
          ? {
            price,
            unitOfMeasure: sanitizeText(col(row, 'Unit Of Measure'), 40),
            hsnCode: sanitizeText(col(row, 'HSN Code'), 30),
            sku,
            brand: sanitizeText(col(row, 'Brand'), 120),
            modelNumber: sanitizeText(col(row, 'Model Number'), 120),
            itemCondition: sanitizeText(col(row, 'Item Condition'), 40),
            isMsmeMade: parseBool(col(row, 'MSME Made')) ?? false,
            originalPrice: parseNumber(col(row, 'Original Price')),
            discountPrice: parseNumber(col(row, 'Discount Price')),
            discountPercent: parseNumber(col(row, 'Discount Percent')),
            offerLabel: sanitizeText(col(row, 'Offer Label'), 120),
            offerStartAt: offerStart,
            offerEndAt: offerEnd,
            bulkDealAvailable: parseBool(col(row, 'Bulk Deal Available')) ?? false,
            bulkMinQuantity: parseNumber(col(row, 'Bulk Minimum Quantity'))
          }
          : {
            pricingModel: clean(col(row, 'Pricing Model')).toUpperCase() || 'FIXED',
            basePrice: parseNumber(col(row, 'Base Price')),
            serviceArea: sanitizeText(col(row, 'Service Area'), 300),
            scopeOfWork: sanitizeText(col(row, 'Scope Of Work')),
            deliverables: sanitizeText(col(row, 'Deliverables')),
            slaResponseTime: sanitizeText(col(row, 'SLA Response Time'), 120),
            duration: sanitizeText(col(row, 'Duration'), 120),
            offerLabel: sanitizeText(col(row, 'Offer Label'), 120),
            offerStartAt: offerStart,
            offerEndAt: offerEnd
          })
      });
    }

    const batch = await db.catalogueImportBatch.create({
      data: {
        sellerId: actor.id,
        type,
        fileName: file.originalname,
        totalRows: dataRows.length,
        validRows: validRows.length,
        invalidRows: rowErrors.length,
        duplicateRows,
        status: 'PREVIEWED',
        previewData: validRows,
        warnings: warnings.length ? warnings : undefined
      }
    });

    if (rowErrors.length) {
      await db.catalogueImportError.createMany({
        data: rowErrors.map(err => ({
          batchId: batch.id,
          rowNumber: err.rowNumber,
          field: err.field || null,
          message: err.message,
          rawData: err.rawData || undefined
        }))
      });
    }

    return {
      batchId: batch.id,
      totalRows: dataRows.length,
      validRows: validRows.length,
      invalidRows: rowErrors.length,
      duplicateRows,
      warnings,
      rowErrors,
      preview: validRows.slice(0, 50)
    };
  },

  async confirmImport(actor: WorkflowActor, batchId: number, publish = false) {
    await assertApprovedSeller(actor);
    const batch = await db.catalogueImportBatch.findFirst({ where: { id: batchId, sellerId: actor.id } });
    if (!batch) throw new ApiError(404, 'Import batch not found', 'BATCH_NOT_FOUND');
    if (batch.status !== 'PREVIEWED' && batch.status !== 'FAILED') {
      throw new ApiError(400, 'Import batch already processed', 'BATCH_ALREADY_PROCESSED');
    }

    const rows = Array.isArray(batch.previewData) ? batch.previewData as Record<string, unknown>[] : [];
    if (rows.length === 0) {
      await db.catalogueImportBatch.update({ where: { id: batchId }, data: { status: 'FAILED' } });
      throw new ApiError(400, 'No valid rows to import', 'NO_VALID_ROWS');
    }

    let successCount = 0;
    try {
      await db.$transaction(async (tx) => {
        for (const row of rows) {
          const status = publish && row.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT';
          const { specifications, rowNumber, categoryId, ...data } = row;
          if (batch.type === 'PRODUCT') {
            await catalogueWorkflow.createProductWithClient(tx, actor, {
              ...data,
              categoryId,
              status,
              specifications: Array.isArray(specifications) ? specifications : []
            });
          } else {
            await catalogueWorkflow.createServiceWithClient(tx, actor, {
              ...data,
              categoryId,
              status,
              specifications: Array.isArray(specifications) ? specifications : []
            });
          }
          successCount += 1;
        }
        await tx.catalogueImportBatch.update({
          where: { id: batchId },
          data: { status: 'CONFIRMED', validRows: successCount }
        });
      }, {
        maxWait: 15000,
        timeout: 90000
      });
    } catch (err) {
      await db.catalogueImportBatch.update({ where: { id: batchId }, data: { status: 'FAILED' } });
      throw err;
    }

    await auditWorkflow(actor, 'workflow.catalogue.import_confirmed', 'catalogue_import_batch', batchId, { type: batch.type, successCount });
    return { batchId, imported: successCount, status: 'CONFIRMED' };
  },

  async listHistory(actor: WorkflowActor) {
    return db.catalogueImportBatch.findMany({
      where: { sellerId: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { _count: { select: { errors: true } } }
    });
  },

  async getErrors(actor: WorkflowActor, batchId: number) {
    const batch = await db.catalogueImportBatch.findFirst({ where: { id: batchId, sellerId: actor.id } });
    if (!batch) throw new ApiError(404, 'Import batch not found', 'BATCH_NOT_FOUND');
    return db.catalogueImportError.findMany({ where: { batchId }, orderBy: { rowNumber: 'asc' } });
  },

  async exportErrorReport(actor: WorkflowActor, batchId: number) {
    const batch = await db.catalogueImportBatch.findFirst({ where: { id: batchId, sellerId: actor.id } });
    if (!batch) throw new ApiError(404, 'Import batch not found', 'BATCH_NOT_FOUND');
    const errors = await db.catalogueImportError.findMany({ where: { batchId }, orderBy: { rowNumber: 'asc' } });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(errors.map(e => ({
      Row: e.rowNumber,
      Field: e.field || '',
      Message: e.message,
      RawData: e.rawData ? JSON.stringify(e.rawData) : ''
    }))), 'Errors');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
};
