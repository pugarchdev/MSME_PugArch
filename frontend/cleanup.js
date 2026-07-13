const fs = require('fs');
const path = require('path');

let appTsx = fs.readFileSync('c:/Pugarch/jsgSMILE/MSME_PugArch/frontend/src/App.tsx', 'utf8');

const componentsToRemove = [
  'BuyerRequirementListPage',
  'BuyerRequirementDetailPage',
  'PublicBuyerRequirements',
  'SellerTenders',
  'RequirementsPage',
  'BuyerPublishBidPage',
  'ApprovalQueuePage',
  'Quotations',
  'RfqPage',
  'Tenders',
  'SellerProcurementHub',
  'CreateQuotation',
  'CartApprovalPage',
  'TechnicalReviewPage',
  'FactoringDashboard'
];

// Remove lazy imports
componentsToRemove.forEach(comp => {
  const regex = new RegExp(`^const ${comp} = lazy\\(\\(.*?\\n`, 'gm');
  appTsx = appTsx.replace(regex, '');
});

// Remove route definitions in App.tsx (using strings)
const routesToRemove = [
  "if (pathname === '/marketplace/requirements') return <BuyerRequirementListPage />;",
  "if (/^\\/marketplace\\/requirements\\/-?\\d+$/.test(pathname)) return <BuyerRequirementDetailPage />;",
  "if (pathname === '/tenders') return <SellerTenders />;",
  "if (pathname === '/buyer/publish-bid') {\n      if (!user) return <Redirect to=\"/login?returnUrl=/buyer/publish-bid\" />;\n      if (user.role !== 'buyer') return <Redirect to={authenticatedHome} />;\n      return <BuyerPublishBidPage />;\n    }",
  "{\n      const buyerRequirementsMatch = pathname.match(/^\\/buyer-requirements\\/(\\d+)$/);\n      if (buyerRequirementsMatch) {\n        const buyerId = Number(buyerRequirementsMatch[1]);\n        if (Number.isFinite(buyerId) && buyerId > 0) return <PublicBuyerRequirements buyerId={buyerId} />;\n      }\n    }",
  "if (pathname === '/buyer/procurements' && roleOk(user.role, ['buyer'])) return <RequirementsPage />;",
  "if (pathname === '/buyer/requirements' && roleOk(user.role, ['buyer'])) return <RequirementsPage />;",
  "if (pathname === '/buyer/procurement/responses' && roleOk(user.role, ['buyer'])) return <Quotations />;",
  "if (pathname === '/buyer/procurement/approvals' && roleOk(user.role, ['buyer'])) return <ApprovalQueuePage />;",
  "if (pathname === '/buyer/rfq' && roleOk(user.role, ['buyer'])) return <RfqPage />;",
  "if (pathname === '/seller/rfq' && roleOk(user.role, ['seller'])) return <RfqPage />;",
  "if (/^\\/buyer\\/tenders\\/[^/]+$/.test(pathname) && roleOk(user.role, ['buyer'])) return <GenericFeaturePage title=\"Tender Detail\" eyebrow=\"Tendering\" description=\"Tender detail and linked procurement records.\" endpoint=\"/api/tenders\" />;",
  "if (pathname === '/buyer/tenders' && roleOk(user.role, ['buyer'])) return <Tenders />;",
  "if (pathname === '/seller/procurement' && roleOk(user.role, ['seller'])) return <SellerProcurementHub />;",
  "if (pathname === '/seller/tenders' && roleOk(user.role, ['seller'])) return <SellerTenders />;",
  "if (/^\\/seller\\/tenders\\/[^/]+\\/bid$/.test(pathname) && roleOk(user.role, ['seller'])) return <CreateQuotation />;",
  "if (pathname === '/cart/approvals') return <CartApprovalPage />;",
  "if (pathname === '/cart/technical-review') return <TechnicalReviewPage />;",
  "if (pathname === '/approvals') return <ApprovalQueuePage />;",
  "if (pathname === '/quotations' && roleOk(user.role, ['seller'])) return <Redirect to=\"/seller/procurement/events?filter=submitted\" />;",
  "if (pathname === '/quotations' && roleOk(user.role, ['buyer'])) return <Quotations />;",
  "if (pathname === '/factoring' && roleOk(user.role, ['seller', 'financier', 'admin'])) return <FactoringDashboard />;"
];

routesToRemove.forEach(route => {
  if (appTsx.includes(route)) {
    appTsx = appTsx.replace(route + '\n', '');
    appTsx = appTsx.replace(route, '');
  }
});

// Clean up publicPaths array
appTsx = appTsx.replace(/'\/marketplace\/requirements',\n?\s*/g, '');
appTsx = appTsx.replace(/'\/tenders',\n?\s*/g, '');

// Save App.tsx
fs.writeFileSync('c:/Pugarch/jsgSMILE/MSME_PugArch/frontend/src/App.tsx', appTsx);
console.log('App.tsx cleaned up.');

// Update Navbar.tsx
let navbarTsx = fs.readFileSync('c:/Pugarch/jsgSMILE/MSME_PugArch/frontend/src/components/layout/Navbar.tsx', 'utf8');

const preloadKeysToRemove = [
  "'/buyer/procurements': () => import('../../features/requirements/pages/RequirementsPage'),\n",
  "'/seller/procurement': () => import('../../features/sellerOpportunities/pages/SellerProcurementHub'),\n",
  "'/buyer/tenders': () => import('../../views/Tenders'),\n",
  "'/seller/tenders': () => import('../../views/SellerTenders'),\n",
  "'/quotations': () => import('../../views/Quotations'),\n",
  "'/buyer/requirements': () => import('../../features/requirements/pages/RequirementsPage'),\n",
  "'/buyer/rfq': () => import('../../features/rfq/pages/RfqPage'),\n",
  "'/seller/rfq': () => import('../../features/rfq/pages/RfqPage'),\n",
  "'/cart/approvals': () => import('../../features/cart/pages/CartApprovalPage'),\n",
  "'/cart/technical-review': () => import('../../features/cart/pages/TechnicalReviewPage'),\n",
  "'/approvals': () => import('../../features/approvals/pages/ApprovalQueuePage'),\n"
];

preloadKeysToRemove.forEach(key => {
  navbarTsx = navbarTsx.replace(key, '');
  // sometimes indenting is different, let's also remove them without newline
  navbarTsx = navbarTsx.replace(key.trim() + '\n', '');
  navbarTsx = navbarTsx.replace(key.trim(), '');
});

const menuPathsToRemove = [
  "  '/buyer/procurement/responses',\n",
  "  '/buyer/procurement/approvals',\n"
];

menuPathsToRemove.forEach(p => {
  navbarTsx = navbarTsx.replace(p, '');
});

const navItemsToRemove = [
  "      { label: 'Supplier Responses', path: '/buyer/procurement/responses', icon: FileText, roles: ['buyer'], featureCode: 'bid-submission' },\n",
  "      { label: 'Pending Approvals', path: '/buyer/procurement/approvals', icon: CheckSquare, roles: ['buyer'] },\n",
  "      { label: 'Public Tenders', path: '/seller/tenders', icon: Globe, roles: ['seller'] },\n"
];

navItemsToRemove.forEach(item => {
  navbarTsx = navbarTsx.replace(item, '');
});

fs.writeFileSync('c:/Pugarch/jsgSMILE/MSME_PugArch/frontend/src/components/layout/Navbar.tsx', navbarTsx);
console.log('Navbar.tsx cleaned up.');
