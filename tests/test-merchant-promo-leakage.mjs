// tests/test-merchant-promo-leakage.mjs
import { classifyEmail } from '../supabase/functions/_shared/email-clusterer.mjs'

const merchantPromos = [
  {
    vendor: 'DoorDash',
    email: {
      from: 'DoorDash <deals@doordash.com>',
      subject: 'Get $0 delivery fees on your next 3 dinner orders with DashPass!',
      bodyText: 'Enjoy unlimited free delivery from your favorite local restaurants. Use promo code ZERO at checkout.',
    }
  },
  {
    vendor: 'Amazon',
    email: {
      from: 'Amazon Deals <store-news@amazon.com>',
      subject: 'Save 50% on Echo Dot and Fire TV - Prime Exclusive Sale!',
      bodyText: 'Shop limited time deals now. Save big on smart home devices. Use coupon code ECHO50.',
    }
  },
  {
    vendor: 'Walmart',
    email: {
      from: 'Walmart <savings@walmart.com>',
      subject: 'Rollbacks on electronics: Up to 40% off this weekend only',
      bodyText: 'Check out our weekly circular and save on thousands of rollback items. Shop now.',
    }
  },
  {
    vendor: 'Chewy',
    email: {
      from: 'Chewy <promotions@chewy.com>',
      subject: 'Save $20 on your first pet food order + free shipping over $49',
      bodyText: 'Join Autoship today and get 30% off your first order with coupon code PETS30.',
    }
  },
  {
    vendor: 'Instacart',
    email: {
      from: 'Instacart <offers@instacart.com>',
      subject: 'Save $15 on your grocery order of $50 or more!',
      bodyText: 'Limited time coupon. Save $15 on fresh groceries. Shop local supermarkets now.',
    }
  },
  {
    vendor: 'HelloFresh',
    email: {
      from: 'HelloFresh <hello@hellofresh.com>',
      subject: 'Claim 16 Free Meals + 3 Surprise Gifts when you reactivate!',
      bodyText: 'We miss you! Come back and save 50% on your next 4 boxes. Limited time offer.',
    }
  },
]

console.log('Testing Merchant Promotional Emails Classification:\n')
for (const mp of merchantPromos) {
  const result = classifyEmail(mp.email)
  console.log(`Merchant: ${mp.vendor.padEnd(12)} -> Classified: ${result.archetype.padEnd(20)} (Confidence: ${result.confidence}) Reason: ${result.reasoning}`)
}
