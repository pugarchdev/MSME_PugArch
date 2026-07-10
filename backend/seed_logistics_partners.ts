/**
 * Seed common Indian logistics partners used for procurement / MSME shipping.
 *
 * Idempotent: each row is upserted by `code` so the script can safely be re-run
 * without producing duplicates.
 *
 * Run with:  npx tsx seed_logistics_partners.ts
 */

import prisma from './src/lib/prisma.js';

const partners = [
    // Government / public sector
    {
        code: 'INDIAPOST',
        name: 'India Post (Speed Post / Business Parcel)',
        contactName: 'Department of Posts',
        contactEmail: 'support@indiapost.gov.in',
        contactPhone: '1800-11-2011',
        trackingUrl: 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx'
    },
    // Major private domestic couriers
    {
        code: 'BLUEDART',
        name: 'Blue Dart Express',
        contactName: 'Customer Service',
        contactEmail: 'customerservice@bluedart.com',
        contactPhone: '1860-233-1234',
        trackingUrl: 'https://www.bluedart.com/tracking'
    },
    {
        code: 'DTDC',
        name: 'DTDC Express',
        contactEmail: 'customer.service@dtdc.com',
        contactPhone: '1800-208-1234',
        trackingUrl: 'https://www.dtdc.in/tracking.asp'
    },
    {
        code: 'DELHIVERY',
        name: 'Delhivery',
        contactEmail: 'support@delhivery.com',
        contactPhone: '0124-671-9500',
        trackingUrl: 'https://www.delhivery.com/track-package'
    },
    {
        code: 'EKART',
        name: 'Ekart Logistics',
        contactEmail: 'cs@ekartlogistics.com',
        trackingUrl: 'https://ekartlogistics.com/shipmenttrack'
    },
    {
        code: 'XPRESSBEES',
        name: 'XpressBees',
        contactEmail: 'support@xpressbees.com',
        trackingUrl: 'https://www.xpressbees.com/track'
    },
    {
        code: 'ECOMEXPRESS',
        name: 'Ecom Express',
        contactEmail: 'customercare@ecomexpress.in',
        trackingUrl: 'https://ecomexpress.in/tracking'
    },
    {
        code: 'SHADOWFAX',
        name: 'Shadowfax',
        contactEmail: 'support@shadowfax.in',
        trackingUrl: 'https://www.shadowfax.in/track'
    },
    // Heavy / surface / B2B logistics
    {
        code: 'GATI',
        name: 'Gati-KWE',
        contactEmail: 'customerservice@gati.com',
        contactPhone: '1800-180-4284',
        trackingUrl: 'https://www.gati.com/track-shipment'
    },
    {
        code: 'SAFEXPRESS',
        name: 'Safexpress',
        contactEmail: 'customercare@safexpress.com',
        contactPhone: '1800-113-113',
        trackingUrl: 'https://www.safexpress.com/track-shipment.aspx'
    },
    {
        code: 'VRL',
        name: 'VRL Logistics',
        contactEmail: 'info@vrllogistics.com',
        contactPhone: '0831-246-2299',
        trackingUrl: 'https://www.vrlgroup.in/track_consignment.aspx'
    },
    {
        code: 'TCI',
        name: 'TCI Express',
        contactEmail: 'corporate@tciexpress.in',
        contactPhone: '1800-200-0977',
        trackingUrl: 'https://www.tciexpress.in/Tracking'
    },
    {
        code: 'ALLCARGO',
        name: 'Allcargo Logistics',
        contactEmail: 'info@allcargologistics.com',
        trackingUrl: 'https://www.allcargologistics.com/track-shipment'
    },
    {
        code: 'MAHINDRA',
        name: 'Mahindra Logistics',
        contactEmail: 'customer.care@mahindralogistics.com',
        trackingUrl: 'https://www.mahindralogistics.com'
    },
    // Couriers
    {
        code: 'PROCOURIER',
        name: 'Professional Couriers',
        contactEmail: 'customercare@tpcindia.com',
        contactPhone: '1800-419-2929',
        trackingUrl: 'https://www.tpcindia.com/Tracking2.aspx'
    },
    {
        code: 'SHREEMARUTI',
        name: 'Shree Maruti Courier Service',
        contactEmail: 'customercare@shreemaruti.com',
        trackingUrl: 'https://www.shreemaruti.com/Tracking.aspx'
    },
    // International players with strong India operations
    {
        code: 'FEDEXIND',
        name: 'FedEx Express India',
        contactPhone: '1800-419-4343',
        trackingUrl: 'https://www.fedex.com/en-in/tracking.html'
    },
    {
        code: 'DHLIND',
        name: 'DHL Express India',
        contactPhone: '1800-111-345',
        trackingUrl: 'https://www.dhl.com/in-en/home/tracking.html'
    },
    {
        code: 'ARAMEXIND',
        name: 'Aramex India',
        contactPhone: '1860-500-0500',
        trackingUrl: 'https://www.aramex.com/in/en/track/track-results-new'
    },
    {
        code: 'OTHER',
        name: 'Other / Self-arranged',
        contactName: 'Buyer-arranged or in-house transport'
    }
];

const main = async () => {
    const db = prisma as any;
    let created = 0;
    let updated = 0;

    for (const partner of partners) {
        const existing = await db.logisticsPartner.findUnique({ where: { code: partner.code } });
        if (existing) {
            await db.logisticsPartner.update({
                where: { code: partner.code },
                data: { ...partner, isActive: true }
            });
            updated += 1;
        } else {
            await db.logisticsPartner.create({ data: { ...partner, isActive: true } });
            created += 1;
        }
    }

    const total = await db.logisticsPartner.count({ where: { isActive: true } });
    console.log(`Logistics partners seeded. created=${created} updated=${updated} active_total=${total}`);
    process.exit(0);
};

main().catch(err => {
    console.error(err);
    process.exit(1);
});
