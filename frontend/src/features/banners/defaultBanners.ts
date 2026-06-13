export const DEFAULT_MARKETPLACE_BANNERS = [
  {
    id: -9001,
    title: 'Discover Verified MSME\nProducts & Services',
    subtitle: 'Browse quality products from verified local manufacturers and service providers in Jharsuguda District',
    ctaText: 'Explore Marketplace',
    ctaLink: '#products',
    imageUrl: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1400&q=75&auto=format&fit=crop',
    displayOrder: 1,
    displayLocation: 'HOME_HERO',
    status: 'DEFAULT'
  },
  {
    id: -9002,
    title: 'Register as Seller &\nGrow Your Business',
    subtitle: 'List your products and services. Reach government, institutional, and enterprise buyers across the district.',
    ctaText: 'Register as Seller',
    ctaLink: '/seller/register',
    imageUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1400&q=75&auto=format&fit=crop',
    displayOrder: 2,
    displayLocation: 'HOME_HERO',
    status: 'DEFAULT'
  },
  {
    id: -9003,
    title: 'Transparent Procurement\nfor All Buyers',
    subtitle: 'Access verified suppliers, compare products, request quotations, and manage your procurement needs in one place.',
    ctaText: 'Register as Buyer',
    ctaLink: '/buyer/register',
    imageUrl: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=1400&q=75&auto=format&fit=crop',
    displayOrder: 3,
    displayLocation: 'HOME_HERO',
    status: 'DEFAULT'
  },
  {
    id: -9004,
    title: 'Empowering Jharsuguda\nMSMEs Digitally',
    subtitle: 'A government-grade marketplace connecting local industries, suppliers, and buyers through transparent digital procurement.',
    ctaText: 'Learn More',
    ctaLink: '#how-it-works',
    imageUrl: 'https://images.unsplash.com/photo-1565043666747-69f6646db940?w=1400&q=75&auto=format&fit=crop',
    displayOrder: 4,
    displayLocation: 'HOME_HERO',
    status: 'DEFAULT'
  }
] as const;
