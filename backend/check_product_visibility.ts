import prisma from './src/config/prisma.js';

async function checkProductVisibility() {
  const allProducts = await prisma.product.findMany({
    include: {
      organization: {
        select: {
          organizationName: true,
          verificationStatus: true,
          isBlacklisted: true,
          deletedAt: true
        }
      },
      seller: {
        select: {
          name: true,
          onboardingStatus: true
        }
      }
    }
  });

  console.log(`--- TOTAL PRODUCTS IN DATABASE: ${allProducts.length} ---`);
  
  let countActive = 0;
  let countVisible = 0;

  for (const p of allProducts) {
    const isProductActive = p.status === 'ACTIVE';
    if (isProductActive) countActive++;

    const isOrgVerified = p.organization?.verificationStatus === 'VERIFIED' && !p.organization?.isBlacklisted && !p.organization?.deletedAt;
    const isSellerApproved = p.seller?.onboardingStatus === 'approved_for_procurement';
    const isVisible = isProductActive && (isOrgVerified || isSellerApproved);
    if (isVisible) countVisible++;

    console.log(`Product ID: ${p.id} | Name: "${p.name}" | Status: ${p.status}`);
    console.log(`  Organization: "${p.organization?.organizationName || 'None'}" | Verification Status: ${p.organization?.verificationStatus || 'None'}`);
    console.log(`  Seller: "${p.seller?.name || 'None'}" | Onboarding Status: ${p.seller?.onboardingStatus || 'None'}`);
    console.log(`  Is Visible: ${isVisible} (Product Active: ${isProductActive}, Org Verified: ${isOrgVerified}, Seller Approved: ${isSellerApproved})`);
  }

  console.log(`\nSummary: Active Products = ${countActive}, Visible Products = ${countVisible}, Total = ${allProducts.length}`);
}

checkProductVisibility().catch(console.error);
