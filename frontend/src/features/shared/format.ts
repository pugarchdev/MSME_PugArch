export const formatCurrency = (value: unknown) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
}).format(Number(value || 0));

export const formatDate = (value?: string | Date | null) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const maskEmail = (value?: string) => {
  if (!value || !value.includes('@')) return value || 'Hidden';
  const [name, domain] = value.split('@');
  return `${name.slice(0, 2)}***@${domain}`;
};
