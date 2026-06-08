/**
 * Centralized dropdown option constants for the MSME Portal.
 * Each array contains { value, label } objects for use in <Select> / <option> elements.
 */

// ── Quantity / Unit of Measure ──────────────────────────────────────────────
export const QUANTITY_UNITS = [
  { value: 'Nos', label: 'Nos.' },
  { value: 'Kg', label: 'Kg' },
  { value: 'Ton', label: 'Ton' },
  { value: 'MT', label: 'MT' },
  { value: 'Bag', label: 'Bag' },
  { value: 'Box', label: 'Box' },
  { value: 'Packet', label: 'Packet' },
  { value: 'Set', label: 'Set' },
  { value: 'Pair', label: 'Pair' },
  { value: 'Roll', label: 'Roll' },
  { value: 'Litre', label: 'Litre' },
  { value: 'Meter', label: 'Meter' },
  { value: 'Feet', label: 'Feet' },
  { value: 'Piece', label: 'Piece' },
  { value: 'Unit', label: 'Unit' },
  { value: 'Coil', label: 'Coil' },
  { value: 'Drum', label: 'Drum' },
  { value: 'Bundle', label: 'Bundle' },
  { value: 'Carton', label: 'Carton' },
  { value: 'Cylinder', label: 'Cylinder' },
  { value: 'Dozen', label: 'Dozen' },
  { value: 'Sheet', label: 'Sheet' },
  { value: 'Plate', label: 'Plate' },
  { value: 'Bucket', label: 'Bucket' },
  { value: 'Kit', label: 'Kit' },
  { value: 'Bottle', label: 'Bottle' },
  { value: 'Container', label: 'Container' },
  { value: 'Cum', label: 'Cum' },
  { value: 'SqFt', label: 'Sq. Ft' },
  { value: 'SqMeter', label: 'Sq. Meter' },
] as const;

// ── MSME Type ───────────────────────────────────────────────────────────────
export const MSME_TYPES = [
  { value: 'MSME', label: 'MSME' },
  { value: 'NON_MSME', label: 'Non-MSME' },
  { value: 'LOCAL_MSME', label: 'Local MSME' },
  { value: 'ANCILLARY_UNIT', label: 'Ancillary Unit' },
  { value: 'STARTUP_MSME', label: 'Startup MSME' },
] as const;

// ── Vendor Type ─────────────────────────────────────────────────────────────
export const VENDOR_TYPES = [
  { value: 'MANUFACTURER', label: 'Manufacturer' },
  { value: 'TRADER', label: 'Trader' },
  { value: 'DISTRIBUTOR', label: 'Distributor' },
  { value: 'DEALER', label: 'Dealer' },
  { value: 'SERVICE_PROVIDER', label: 'Service Provider' },
  { value: 'CONTRACTOR', label: 'Contractor' },
  { value: 'OEM', label: 'OEM' },
  { value: 'RETAIL_SUPPLIER', label: 'Retail Supplier' },
  { value: 'WHOLESALER', label: 'Wholesaler' },
] as const;

// ── Registration Type ───────────────────────────────────────────────────────
export const REGISTRATION_TYPES = [
  { value: 'GST_REGISTERED', label: 'GST Registered' },
  { value: 'UDYAM_REGISTERED', label: 'UDYAM Registered' },
  { value: 'NSIC_REGISTERED', label: 'NSIC Registered' },
  { value: 'ISO_CERTIFIED', label: 'ISO Certified' },
  { value: 'PAN_AVAILABLE', label: 'PAN Available' },
] as const;

// ── Product / Service Categories ────────────────────────────────────────────
export const PRODUCT_CATEGORIES = [
  'Electrical & Electronics',
  'Mechanical & Engineering',
  'Construction & Building Materials',
  'Industrial Chemicals',
  'Refractories',
  'Automobile Parts & Services',
  'Tyres & Rubber Products',
  'IT & Computer Equipment',
  'Office Equipment & Stationery',
  'Medical & Healthcare Supplies',
  'Agriculture & Nursery',
  'Safety Equipment & Industrial Safety',
  'Fuel, Oil & Gas',
  'Hydraulics & Pneumatics',
  'Steel & Metal Products',
  'Cement & Concrete Products',
  'Pipes, Tiles & Hardware',
  'Industrial Machinery & Spare Parts',
  'Automation & Robotics',
  'Fabrication & Welding Services',
  'Bearings & Mechanical Components',
  'Electrical Cables & Power Equipment',
  'Industrial Consumables',
  'Packaging & Printing',
  'Polymer & Plastic Products',
  'Trading & Distribution',
  'Logistics & Supply Services',
  'Tools & Industrial Hardware',
  'Laboratory Equipment & Chemicals',
  'Engineering Consultancy Services',
  'Industrial Maintenance Services',
  'Construction & Civil Work Services',
  'Environmental & Waste Management',
  'Telecom & Communication Equipment',
  'Furniture & Interior Supplies',
  'General Industrial Supplier',
  'Mining & Coal Equipment',
  'Power & Energy Equipment',
  'Gas Equipment & Cylinders',
  'Conveyor & Material Handling Equipment',
  'Pumps, Motors & Hydraulics',
  'Industrial Seals & Gaskets',
  'Welding & Cutting Equipment',
  'Industrial Fasteners & Components',
  'Retail & Commercial Supply',
  'FMCG & Daily Utility Supply',
  'Textile & Garments Supply',
  'OEM / Manufacturing Vendor',
  'Repair & Service Provider',
  'Multi-category Industrial Vendor',
] as const;

// Sentinel value for the "Other" option that lets users type a custom category.
export const PRODUCT_CATEGORY_OTHER = 'Other';

// ── Item Condition ──────────────────────────────────────────────────────────
export const ITEM_CONDITIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'REFURBISHED', label: 'Refurbished' },
  { value: 'USED', label: 'Used' },
  { value: 'CUSTOM_MANUFACTURED', label: 'Custom Manufactured' },
] as const;

// ── Payment Terms ───────────────────────────────────────────────────────────
export const PAYMENT_TERMS = [
  { value: 'ADVANCE_PAYMENT', label: 'Advance Payment' },
  { value: 'CREDIT_PAYMENT', label: 'Credit Payment' },
  { value: 'PARTIAL_ADVANCE', label: 'Partial Advance' },
  { value: 'MILESTONE_BASED', label: 'Milestone Based' },
  { value: 'ON_DELIVERY', label: 'On Delivery' },
] as const;

// ── Delivery Type ───────────────────────────────────────────────────────────
export const DELIVERY_TYPES = [
  { value: 'IMMEDIATE_DELIVERY', label: 'Immediate Delivery' },
  { value: 'SCHEDULED_DELIVERY', label: 'Scheduled Delivery' },
  { value: 'URGENT_DELIVERY', label: 'Urgent Delivery' },
  { value: 'PARTIAL_DELIVERY', label: 'Partial Delivery' },
  { value: 'PROJECT_DELIVERY', label: 'Project Delivery' },
] as const;
