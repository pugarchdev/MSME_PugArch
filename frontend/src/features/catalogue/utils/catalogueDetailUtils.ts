export type DetailField = { label: string; value: unknown; always?: boolean };

export const hasValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  return String(value).trim().length > 0;
};

export const formatCatalogueValue = (value: unknown) => {
  if (!hasValue(value)) return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

export const formatCatalogueMoney = (value: unknown, currency = 'INR') => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `${currency === 'INR' ? 'Rs.' : currency} ${amount.toLocaleString('en-IN')}`;
};

export const formatCatalogueDate = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatCataloguePercent = (value: unknown) => {
  if (!hasValue(value)) return null;
  return `${value}%`;
};

export const filterDetailFields = (fields: DetailField[]) =>
  fields.filter(f => f.always || hasValue(f.value));

export const buildProductDetailFields = (product: Record<string, unknown>) => {
  const org = product.organization as Record<string, unknown> | undefined;
  const seller = product.seller as Record<string, unknown> | undefined;
  const category = product.category as Record<string, unknown> | undefined;
  const location = org?.city || org?.district || org?.state;

  const required: DetailField[] = [
    { label: 'Product Name', value: product.name, always: true },
    { label: 'Category', value: category?.name || 'General', always: true },
    { label: 'Seller', value: org?.organizationName || seller?.name, always: true },
    { label: 'Seller Location', value: location || 'Not specified', always: true },
    { label: 'Description', value: product.description, always: true },
    { label: 'Price', value: formatCatalogueMoney(product.price, String(product.currency || 'INR')) || 'Price on request', always: true },
    { label: 'Currency', value: product.currency || 'INR', always: true },
    { label: 'GST Rate', value: hasValue(product.taxRate) ? formatCataloguePercent(product.taxRate) : '0%', always: true },
    { label: 'Unit of Measure', value: product.unitOfMeasure || 'Unit', always: true },
    { label: 'Status', value: product.status, always: true },
  ];

  const optional: DetailField[] = [
    { label: 'SKU', value: product.sku },
    { label: 'Brand', value: product.brand },
    { label: 'Model Number', value: product.modelNumber },
    { label: 'HSN Code', value: product.hsnCode },
    { label: 'Item Condition', value: product.itemCondition },
    { label: 'MSME Made', value: product.isMsmeMade },
    { label: 'Original Price', value: formatCatalogueMoney(product.originalPrice, String(product.currency || 'INR')) },
    { label: 'Discount Price', value: formatCatalogueMoney(product.discountPrice, String(product.currency || 'INR')) },
    { label: 'Discount Percent', value: hasValue(product.discountPercent) ? formatCataloguePercent(product.discountPercent) : null },
    { label: 'Offer Label', value: product.offerLabel },
    { label: 'Offer Start Date', value: formatCatalogueDate(product.offerStartAt) },
    { label: 'Offer End Date', value: formatCatalogueDate(product.offerEndAt) },
    { label: 'Bulk Deal Available', value: product.bulkDealAvailable },
    { label: 'Bulk Minimum Quantity', value: hasValue(product.bulkMinQuantity) ? `${product.bulkMinQuantity} ${product.unitOfMeasure || ''}`.trim() : null },
    { label: 'Last Updated', value: formatCatalogueDate(product.updatedAt) },
  ];

  return [...required, ...filterDetailFields(optional)];
};

export const buildServiceDetailFields = (service: Record<string, unknown>) => {
  const org = service.organization as Record<string, unknown> | undefined;
  const seller = service.seller as Record<string, unknown> | undefined;
  const category = service.category as Record<string, unknown> | undefined;
  const location = org?.city || org?.district || org?.state;
  const pricingModel = String(service.pricingModel || 'CUSTOM').replace(/_/g, ' ');
  const basePrice = formatCatalogueMoney(service.basePrice, String(service.currency || 'INR'));

  const required: DetailField[] = [
    { label: 'Service Name', value: service.name, always: true },
    { label: 'Category', value: category?.name || 'General', always: true },
    { label: 'Seller', value: org?.organizationName || seller?.name, always: true },
    { label: 'Seller Location', value: location || 'Not specified', always: true },
    { label: 'Description', value: service.description, always: true },
    { label: 'Pricing Model', value: pricingModel, always: true },
    { label: 'Base Price', value: basePrice || 'Custom / on request', always: true },
    { label: 'Currency', value: service.currency || 'INR', always: true },
    { label: 'GST Rate', value: hasValue(service.taxRate) ? formatCataloguePercent(service.taxRate) : '0%', always: true },
    { label: 'Service Area', value: service.serviceArea, always: true },
    { label: 'Status', value: service.status, always: true },
  ];

  const optional: DetailField[] = [
    { label: 'Scope of Work', value: service.scopeOfWork },
    { label: 'Deliverables', value: service.deliverables },
    { label: 'Inclusions', value: service.inclusions },
    { label: 'Exclusions', value: service.exclusions },
    { label: 'SLA / Response Time', value: service.slaResponseTime },
    { label: 'Duration', value: service.duration },
    { label: 'Original Price', value: formatCatalogueMoney(service.originalPrice, String(service.currency || 'INR')) },
    { label: 'Discount Price', value: formatCatalogueMoney(service.discountPrice, String(service.currency || 'INR')) },
    { label: 'Discount Percent', value: hasValue(service.discountPercent) ? formatCataloguePercent(service.discountPercent) : null },
    { label: 'Offer Label', value: service.offerLabel },
    { label: 'Offer Start Date', value: formatCatalogueDate(service.offerStartAt) },
    { label: 'Offer End Date', value: formatCatalogueDate(service.offerEndAt) },
    { label: 'Last Updated', value: formatCatalogueDate(service.updatedAt) },
  ];

  return [...required, ...filterDetailFields(optional)];
};

export const marketplaceVisibilityLabel = (status?: string, sellerApproved?: boolean) => {
  if (status === 'ACTIVE' && sellerApproved) return 'Visible in marketplace';
  if (status === 'ACTIVE') return 'Active (pending seller verification)';
  if (status === 'DRAFT') return 'Draft — seller only';
  if (status === 'INACTIVE') return 'Hidden from marketplace';
  return status?.replace(/_/g, ' ') || 'Unknown';
};
