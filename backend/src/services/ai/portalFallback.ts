import prisma from '../../config/prisma.js';
import { GenerateInsightInput, GenerateInsightResult } from './types.js';

type ProductVolumeRow = {
  id: number;
  name: string;
  sku?: string | null;
  unitOfMeasure?: string | null;
  totalQuantity: number;
  orderCount: number;
  totalValue: number;
};

const PORTAL_MODEL = 'portal-rules-v1';

const normalizeQuestion = (question: string) =>
  question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const sectionedAnswer = ({
  observation,
  risk,
  opportunity,
  action,
  conclusion
}: {
  observation: string;
  risk: string;
  opportunity: string;
  action: string;
  conclusion: string;
}): string => `1. Key Observation
${observation}

2. Risk Area
${risk}

3. Growth Opportunity
${opportunity}

4. Suggested Action
${action}

5. Conclusion
${conclusion}`;

const result = (answer: string): GenerateInsightResult => ({
  answer,
  provider: 'portal-fallback',
  model: PORTAL_MODEL,
  fallback: true
});

const portalKeywords = [
  'portal',
  'dashboard',
  'msme',
  'buyer',
  'seller',
  'admin',
  'marketplace',
  'product',
  'service',
  'procurement',
  'tender',
  'quotation',
  'rfq',
  'reverse auction',
  'auction',
  'purchase order',
  'po',
  'invoice',
  'payment',
  'escrow',
  'delivery',
  'grn',
  'gst',
  'gstin',
  'onboarding',
  'organization',
  'approval',
  'catalogue',
  'requirement',
  'vendor',
  'supplier',
  'volume',
  'highest'
];

const isGreeting = (normalized: string) => {
  return ['hello', 'hi', 'hey', 'greetings', 'who are you', 'what are you', 'good morning', 'good afternoon', 'good evening'].some(w => normalized === w || normalized.startsWith(w + ' '));
};

const isClearlyOutOfScope = (normalized: string) => {
  if (!normalized) return true;
  
  const unrelatedKeywords = [
    'movie', 'song', 'music', 'cricket', 'sport', 'game', 'weather', 'joke', 'love', 'recipe', 
    'astrology', 'horoscope', 'celebrity', 'gossip', 'politics', 'president', 'capital of', 
    'history', 'poem', 'story', 'translate', 'programming', 'code', 'python', 'javascript', 
    'html', 'css', 'sql', 'react', 'java', 'c++', 'rust', 'go-lang', 'mathematics', 'physics', 
    'chemistry', 'biology', 'medical', 'workout', 'diet', 'crypto', 'stock market'
  ];

  if (unrelatedKeywords.some(keyword => normalized.includes(keyword))) {
    const strongPortalKeywords = ['portal', 'msme', 'marketplace', 'tender', 'procurement', 'gstin'];
    const hasStrongPortal = strongPortalKeywords.some(kw => normalized.includes(kw));
    if (!hasStrongPortal) {
      return true;
    }
  }

  if (isGreeting(normalized) || normalized === 'help' || normalized === 'guide') {
    return false;
  }

  const hasPortalKeyword = portalKeywords.some(keyword => normalized.includes(keyword));
  if (!hasPortalKeyword) {
    return true;
  }

  return false;
};

const asksForTopProducts = (normalized: string) =>
  (normalized.includes('highest') || normalized.includes('top') || normalized.includes('most') || normalized.includes('popular')) &&
  (normalized.includes('volume') || normalized.includes('purchased') || normalized.includes('ordered') || normalized.includes('product') || normalized.includes('list'));

const asksForPortalHelp = (normalized: string) =>
  ['how', 'where', 'what', 'help', 'guide', 'create', 'open', 'use', 'submit'].some(word => normalized.includes(word)) &&
  portalKeywords.some(keyword => normalized.includes(keyword));

const safeNumber = (value: unknown) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const loadTopProductsByVolume = async (input: GenerateInsightInput): Promise<ProductVolumeRow[]> => {
  const user = input.user;
  const rows = await prisma.purchaseOrderItem.findMany({
    where: {
      productId: { not: null },
      purchaseOrder: {
        ...(user?.role === 'buyer' ? { buyerId: user.id } : {}),
        ...(user?.role === 'seller' ? { sellerId: user.id } : {}),
        OR: [
          { poStatus: { in: ['ACCEPTED', 'IN_FULFILLMENT', 'DELIVERED', 'CLOSED'] as any } },
          { status: { in: ['accepted', 'delivered', 'closed', 'completed', 'fulfilled', 'paid'] } }
        ],
        NOT: [
          { poStatus: { in: ['CANCELLED'] as any } },
          { status: { in: ['cancelled', 'rejected', 'failed', 'draft', 'pending'] } }
        ]
      }
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          unitOfMeasure: true,
          status: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 500
  }).catch(() => []);

  const aggregate = new Map<number, ProductVolumeRow>();
  for (const row of rows) {
    const product = row.product;
    if (!product || product.status !== 'ACTIVE') continue;

    const current = aggregate.get(product.id) || {
      id: product.id,
      name: product.name,
      sku: product.sku,
      unitOfMeasure: product.unitOfMeasure,
      totalQuantity: 0,
      orderCount: 0,
      totalValue: 0
    };

    current.totalQuantity += safeNumber(row.quantity);
    current.totalValue += safeNumber(row.totalAmount);
    current.orderCount += 1;
    aggregate.set(product.id, current);
  }

  return Array.from(aggregate.values())
    .sort((a, b) => (b.totalQuantity - a.totalQuantity) || (b.orderCount - a.orderCount))
    .slice(0, 10);
};

const greetingAnswer = () => result(sectionedAnswer({
  observation: 'Hello! I am the AI MSME Business Advisor. I can help you with anything related to this MSME Procurement Portal.',
  risk: 'Please ensure your questions are related to portal operations, marketplace, catalog, tenders, or business analytics to get accurate guidance.',
  opportunity: 'You can ask me to list the highest volume products, explain portal features, or guide you through onboarding, cart, and payment steps.',
  action: 'Go ahead and ask a question about the portal or your dashboard metrics.',
  conclusion: 'Ready to assist you with MSME portal workflows.'
}));

const topProductsAnswer = async (input: GenerateInsightInput) => {
  const products = await loadTopProductsByVolume(input);
  if (!products.length) {
    const fallbackActiveProducts = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      take: 10,
      orderBy: { id: 'desc' },
      include: {
        organization: {
          select: {
            organizationName: true
          }
        }
      }
    }).catch(() => []);

    if (fallbackActiveProducts.length > 0) {
      const list = fallbackActiveProducts.map((product, index) => {
        const orgName = product.organization?.organizationName || 'Verified MSME Seller';
        const price = product.price ? `INR ${product.price.toString()}` : 'Quote based';
        const sku = product.sku ? `, SKU: ${product.sku}` : '';
        return `${index + 1}. ${product.name}${sku} - ${price} (Offered by: ${orgName})`;
      }).join('\n');

      return result(sectionedAnswer({
        observation: `No completed purchase-order transaction data was found yet. However, here are the active products available on the MSME Portal catalogue:\n\n${list}`,
        risk: 'This list shows catalog items because no completed/accepted purchase orders with volume are recorded yet.',
        opportunity: 'Buyers can browse these items in the marketplace, add them to their cart, or publish requirements for similar products.',
        action: 'Browse active products in the Buyer Marketplace or contact the respective sellers to initiate orders.',
        conclusion: 'Returned active products list as a transaction-volume fallback.'
      }));
    }

    return result(sectionedAnswer({
      observation: 'No completed purchase-order volume or active catalog products are available in the current portal database.',
      risk: 'A highest-volume list or active product list cannot be calculated because the product catalog is empty.',
      opportunity: 'Sellers can add products through their Seller Dashboard to list them on the marketplace.',
      action: 'Add products to the catalog or complete purchase orders to generate data, then try this query again.',
      conclusion: 'There is no product data in the system at this moment.'
    }));
  }

  const list = products.map((product, index) => {
    const quantity = Number.isInteger(product.totalQuantity)
      ? String(product.totalQuantity)
      : product.totalQuantity.toFixed(2);
    const value = product.totalValue ? `, value INR ${product.totalValue.toFixed(2)}` : '';
    const sku = product.sku ? `, SKU ${product.sku}` : '';
    return `${index + 1}. ${product.name}${sku} - ${quantity} ${product.unitOfMeasure || 'units'} across ${product.orderCount} order line(s)${value}`;
  }).join('\n');

  return result(sectionedAnswer({
    observation: `Highest-volume active products based on completed purchase-order line items:\n\n${list}`,
    risk: 'This ranking uses completed/accepted order data only. Draft, pending, cancelled, rejected, and failed orders are excluded.',
    opportunity: 'Products with high quantity and repeated order lines are good candidates for stock planning, supplier follow-up, and buyer-side repeat procurement.',
    action: 'Review the listed products in catalogue and purchase-order modules, then check pricing, delivery status, and seller capacity before scaling orders.',
    conclusion: 'The current top-volume list is calculated from portal transaction data, so it is safer than a model-only guess.'
  }));
};

const portalHelpAnswer = (normalized: string) => {
  let focus = 'Use the dashboard to monitor procurement counts, approvals, marketplace activity, invoices, payments, and delivery work.';
  let action = 'Open the matching sidebar module, review the record status, and continue the next allowed action from that module.';

  if (normalized.includes('procurement') || normalized.includes('purchase')) {
    focus = 'Procurement work starts from buyer actions such as create procurement, marketplace purchase, RFQ, tender, requirement, or reverse auction.';
    action = 'For buyer work, open Create Procurement or Buyer Marketplace. For seller work, monitor tenders, RFQs, purchase orders, and delivery tasks.';
  } else if (normalized.includes('marketplace') || normalized.includes('product') || normalized.includes('service') || normalized.includes('catalogue')) {
    focus = 'The marketplace contains active products and services from verified sellers, plus requirement discovery for buyer demand.';
    action = 'Browse marketplace products/services, compare shortlisted items, add to cart, request quotation, or publish a buyer requirement depending on the purchase intent.';
  } else if (normalized.includes('payment') || normalized.includes('escrow') || normalized.includes('invoice')) {
    focus = 'Payments, escrow, and invoices are tied to purchase orders and delivery progress.';
    action = 'Open invoice, payment, or escrow modules and verify status before approving settlement or uploading payment proof.';
  } else if (normalized.includes('onboarding') || normalized.includes('gst') || normalized.includes('gstin') || normalized.includes('organization')) {
    focus = 'Onboarding and organization verification control whether users can operate as trusted buyers, sellers, or admins.';
    action = 'Complete profile, GSTIN, documents, organization membership, and approval steps before using restricted procurement workflows.';
  }

  return result(sectionedAnswer({
    observation: focus,
    risk: 'The portal is status-driven, so skipping approval, verification, or required document steps can block the next workflow action.',
    opportunity: 'Using the correct module keeps procurement, marketplace, finance, delivery, and compliance records connected instead of creating disconnected work.',
    action,
    conclusion: 'Ask a specific portal question with the module name or record type, and the advisor can give a more targeted answer.'
  }));
};

const dashboardSummaryAnswer = (input: GenerateInsightInput) => {
  const dashboardData = input.dashboardData as any;
  const metrics = dashboardData?.metrics && typeof dashboardData.metrics === 'object' ? dashboardData.metrics : {};
  const entries = Object.entries(metrics)
    .filter(([, value]) => ['number', 'string', 'boolean'].includes(typeof value))
    .slice(0, 12)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('\n');

  return result(sectionedAnswer({
    observation: entries ? `Current dashboard signals:\n${entries}` : 'No detailed dashboard metrics are available in this request.',
    risk: 'Missing or zero metrics can mean either there is no activity yet or the related module data has not loaded.',
    opportunity: 'Dashboard counts help decide whether to focus on approvals, procurement activity, invoices, delivery, catalogue, or marketplace discovery.',
    action: 'Open the module behind any non-zero count and complete the pending workflow action there.',
    conclusion: 'This is a portal-data fallback summary, available even when external AI providers are unavailable.'
  }));
};

const outOfScopeAnswer = () => result(sectionedAnswer({
  observation: 'This advisor is limited to MSME portal, marketplace, procurement, onboarding, finance, delivery, and dashboard questions.',
  risk: 'Answering unrelated personal, entertainment, or general web questions here can produce misleading guidance because this assistant is connected to portal context.',
  opportunity: 'Ask about products, services, highest-volume items, approvals, tenders, RFQs, purchase orders, invoices, payments, escrow, delivery, GST, or onboarding.',
  action: 'Rephrase the question with the relevant portal module or record type.',
  conclusion: 'I can help with portal operations and portal data, but I will not answer unrelated questions from this advisor block.'
}));

export const portalFallback = {
  shouldAnswerBeforeProvider(input: GenerateInsightInput) {
    const normalized = normalizeQuestion(input.question);
    return isGreeting(normalized) || isClearlyOutOfScope(normalized) || asksForTopProducts(normalized);
  },

  async answer(input: GenerateInsightInput): Promise<GenerateInsightResult> {
    const normalized = normalizeQuestion(input.question);
    if (isGreeting(normalized)) return greetingAnswer();
    if (isClearlyOutOfScope(normalized)) return outOfScopeAnswer();
    if (asksForTopProducts(normalized)) return topProductsAnswer(input);
    if (asksForPortalHelp(normalized)) return portalHelpAnswer(normalized);
    return dashboardSummaryAnswer(input);
  }
};
