export const PROCUREMENT_TYPE_OPTIONS = [
  { value: 'PRODUCT', label: 'Product / Goods' },
  { value: 'SERVICE', label: 'Service' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const CATEGORY_OPTIONS = [
  
  'Raw Materials',
  'Steel, Plates & Structural Materials',
  'Cement, Sand & Civil Materials',
  'Pipes, Hume Pipes & Fittings',
  'Mechanical Spares',
  'Bearings & Industrial Components',
  'Electrical Equipment',
  'Automobile & HEMM Spares',
  'Lubricants, Oils & Filters',
  'Refractory & Furnace Materials',
  'Hardware, Fasteners & Consumables',
  'Lab Chemicals & Reagents',
  'IT Hardware, Printers & Toners',
  'Office Supplies & Stationery',
  'Safety, Medical & Ambulance Supplies',
  'Transport, Cab & Vehicle Hiring',
  'Facility Management & Canteen Services',
  'Repair, AMC & Overhauling Services',
  'Mining, Material Handling & Crane Services',
  'Construction & Works Contract',
  'Other',
];

export const UNIT_OPTIONS = [
  { value: 'NO', label: 'NO - Number' },
  { value: 'NOS', label: 'NOS - Numbers' },
  { value: 'EA', label: 'EA - Each' },
  { value: 'SET', label: 'SET - Set' },
  { value: 'ST', label: 'ST - Set / Standard unit' },
  { value: 'KG', label: 'KG - Kilogram' },
  { value: 'KGS', label: 'KGS - Kilograms' },
  { value: 'MT', label: 'MT - Metric Ton' },
  { value: 'GRAMS', label: 'Grams' },
  { value: 'M', label: 'M - Meter' },
  { value: 'METER', label: 'Meter' },
  { value: 'SQ FT', label: 'Sq ft' },
  { value: 'CU.MTRS', label: 'Cu.Mtrs - Cubic meters' },
  { value: 'LTR', label: 'LTR - Litre' },
  { value: 'L', label: 'L - Litre' },
  { value: 'M.LTR', label: 'M.Ltr - Millilitre' },
  { value: 'RL', label: 'RL - Roll' },
  { value: 'PKT', label: 'PKT - Packet' },
  { value: 'BOX', label: 'Box' },
  { value: 'PACK', label: 'Pack' },
  { value: 'BK', label: 'BK - Book' },
  { value: 'BT', label: 'BT - Bottle' },
  { value: 'MR', label: 'MR - Manpower / monthly rate' },
  { value: 'HOUR', label: 'Hour' },
  { value: 'DAY', label: 'Day' },
  { value: 'MONTH', label: 'Month' },
  { value: 'LOT', label: 'Lot' },
  { value: 'LS', label: 'LS - Lump sum' },
];

export const PAYMENT_TERM_OPTIONS = [
  '100% after delivery and acceptance',
  '100% on delivery',
  '50% advance, 50% on delivery',
  '30% advance, 70% after inspection',
  'Milestone based payment',
  'Monthly running bill',
  'Against invoice after GRN/service entry',
  'Net 15 days',
  'Net 30 days',
  'Net 45 days',
  'As per purchase order terms',
];

export const DELIVERY_TYPE_OPTIONS = [
  'Door delivery',
  'Buyer pickup',
  'Seller dispatch',
  'Courier / parcel',
  'Transport / freight',
  'Site delivery',
  'On-site service',
  'Monthly service',
  'Phased delivery',
  'Digital delivery',
];

export const ITEM_SUGGESTIONS = [
  'Custom Bid for Services',
  'BOQ based procurement',
  'Monthly Basis Cab & Taxi Hiring Services',
  'Short Term Cab & Taxi Hiring Services',
  'Goods Transportation Service',
  'Facility Management Services',
  'Repair and Overhauling Service',
  'Operation and Maintenance Services',
  'Mining and Material Handling Services',
  'Bearings',
  'Nut & Bolt',
  'MS Plate',
  'RCC Hume Pipe',
  'Cement',
  'Bed Material',
  'Refractory Bed Materials',
  'Quartzite Base Powder',
  'Transformer Oil',
  'Oil Filter',
  'Pump Spares',
  'Motor Spares',
  'Electrical Equipment',
  'Automobile Spares',
  'Lab Reagents',
  'Printer Toner Cartridges',
  'Safety and Medical Supplies',
];

export const getProcurementInsights = ({
  itemType,
  categoryName,
  paymentTerms,
  deliveryType,
  specificationDocumentName,
}: {
  itemType: string;
  categoryName: string;
  paymentTerms: string;
  deliveryType: string;
  specificationDocumentName: string;
}) => {
  const insights: string[] = [];
  const category = categoryName.toLowerCase();

  if (itemType === 'SERVICE') {
    insights.push('Service procurements in the sample data usually need service start/end dates, scope, SLA, manpower or monthly billing terms.');
  } else if (itemType === 'PRODUCT') {
    insights.push('Product procurements should capture quantity, unit, value per unit, total value, delivery location, and acceptance criteria.');
  } else {
    insights.push('For Other procurement, keep the type text specific so the next workflow can route it correctly.');
  }

  if (category.includes('boq') || category.includes('custom')) {
    insights.push('BOQ/custom bids should include a specification or BOQ document before seller comparison.');
  }

  if (category.includes('cab') || category.includes('transport') || category.includes('vehicle')) {
    insights.push('Transport and vehicle hiring should mention route, hours/km, duty pattern, fuel/toll responsibility, and service period.');
  }

  if (category.includes('repair') || category.includes('amc') || category.includes('maintenance')) {
    insights.push('Repair/AMC requirements should mention asset details, spares responsibility, downtime expectations, and warranty.');
  }

  if (!paymentTerms) {
    insights.push('Select payment terms early so suppliers quote against the same cash-flow assumption.');
  }

  if (!deliveryType) {
    insights.push('Select delivery type to avoid ambiguity between dispatch, site delivery, pickup, and on-site service.');
  }

  if (!specificationDocumentName) {
    insights.push('Attach a specification, drawing, BOQ, or scope document when available; the source formats repeatedly depend on item description and unit clarity.');
  }

  return insights.slice(0, 4);
};

export const formatDocumentSize = (bytes?: number) => {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const getDocumentTypeLabel = (fileName?: string, mimeType?: string) => {
  const extension = fileName?.split('.').pop()?.toUpperCase();
  if (extension) return `${extension} document`;
  if (mimeType) return mimeType;
  return 'Specification document';
};
