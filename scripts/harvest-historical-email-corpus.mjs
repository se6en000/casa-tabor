// scripts/harvest-historical-email-corpus.mjs
// Casa Tabor Autonomous Household Email Intelligence System
// Multi-Source Historical Corpus Harvester & 1,000+ Synthetic Generator

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

import {
  clusterEmailCorpus,
  deduplicateEmailCorpus,
  redactEmailPII,
  anonymizeEmail,
  extractEmailEntities,
  classifyEmail,
  SEMANTIC_ARCHETYPES,
} from '../supabase/functions/_shared/email-clusterer.mjs'

// ============================================================================
// 1. DETERMINISTIC PRNG (Mulberry32)
// ============================================================================

function createPRNG(seed = 42) {
  let s = Math.floor(seed) >>> 0
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ============================================================================
// 2. KNOWN PII TEST VECTORS & TEMPLATES
// ============================================================================

export const KNOWN_PII_SEEDS = {
  names: [
    'Jacob Tabor',
    'Jake Tabor',
    'Kelly Tabor',
    'Kelly Loucks',
    'Olivia Tabor',
    'Liv Tabor',
    'Emerson Tabor',
    'Emme Tabor',
    'Owen Tabor',
    'Milo Tabor',
    'Giselle',
    'Michael Tabor',
    'Rachel Tabor',
    'Sarah Tabor',
    'Alex Tabor',
    'Renée Tabor',
    'François Müller',
  ],
  phones: [
    '(561) 555-0199',
    '+1-561-555-0144',
    '561.555.0198',
    '561-379-6111',
    '(561) 379-6111',
    '+1 561 555 0198',
    '+44 7911 123456',
    '+44 20 7946 0919',
    '+33 1 42 68 55 00',
    '+81 3 1234 5678',
  ],
  emails: [
    'sarah.tabor@gmail.com',
    'johntabor@icloud.com',
    'michael@taborfamily.net',
    'michael.tabor@private.com',
    'jacobrtabor@gmail.com',
    'kellyroseloucks@gmail.com',
    'taborfamilyemail@gmail.com',
  ],
  addresses: [
    '123 Ocean Boulevard, Apt 4B, Palm Beach, FL 33480',
    '4520 PGA Blvd, Suite 200, Palm Beach Gardens, FL 33418',
    '789 Mirasol Way, Palm Beach Gardens, FL 33418',
    '500 S Australian Ave, West Palm Beach, FL 33401',
    '1000 North Military Trail, Jupiter, FL 33458',
    'PO Box 4920, Palm Beach, FL 33480',
    'P.O. Box 123, Palm Beach, FL 33480',
    'Unit 4B, 123 Ocean Blvd, Palm Beach, FL 33480',
  ],
  creditCards: [
    '4111-2222-3333-4444',
    '4000 1234 5678 9010',
    '4532.1234.5678.9010',
    '5500 0000 0000 0004',
    '3782 822463 10005',
  ],
  ssns: [
    '123-45-6789',
    '123.45.6789',
    '123_45_6789',
    '123 45 6789',
    '987-65-4321',
    '456-78-1234',
  ],
  bankAccounts: [
    'Routing: 021000021, Acct: 9876543210',
    'Routing: 063100277, Account: 1029384756',
    'Checking Account: 8877665544, Transit: 123456789',
  ],
  credentials: [
    'PIN: 4829',
    'Temp Password: Pass#2026!',
    'Security Code: 839201',
    'Verification Code: 994812',
  ],
  studentIds: [
    'Student ID: STU-987654',
    'Student ID: PBC-442819',
    'Patient ID: MED-88234',
  ],
  dobs: [
    'DOB: 05/14/1982',
    'DOB: 04/12/2014',
    'Date of Birth: 11/23/2016',
  ],
}

// 32 Sender domains across realistic household categories
export const SENDER_POOL = [
  // E-commerce & Logistics
  { domain: 'amazon.com', from: 'Amazon.com <auto-confirm@amazon.com>', vendor: 'Amazon', category: 'CATEGORY_UPDATES', archetype: 'logistics_parcels' },
  { domain: 'amazon.com', from: 'Amazon Shipping <shipment-tracking@amazon.com>', vendor: 'Amazon', category: 'CATEGORY_UPDATES', archetype: 'logistics_parcels' },
  { domain: 'walmart.com', from: 'Walmart Orders <help@walmart.com>', vendor: 'Walmart', category: 'CATEGORY_UPDATES', archetype: 'logistics_parcels' },
  { domain: 'walmart.com', from: 'Walmart InHome Delivery <inhome@walmart.com>', vendor: 'Walmart', category: 'CATEGORY_UPDATES', archetype: 'logistics_parcels' },
  { domain: 'target.com', from: 'Target Orders <orders@target.com>', vendor: 'Target', category: 'CATEGORY_UPDATES', archetype: 'logistics_parcels' },
  { domain: 'nike.com', from: 'Nike <order-status@nike.com>', vendor: 'Nike', category: 'CATEGORY_UPDATES', archetype: 'logistics_parcels' },
  { domain: 'apple.com', from: 'Apple Store <no_reply@email.apple.com>', vendor: 'Apple', category: 'CATEGORY_UPDATES', archetype: 'logistics_parcels' },
  { domain: 'chewy.com', from: 'Chewy Service <service@chewy.com>', vendor: 'Chewy', category: 'CATEGORY_UPDATES', archetype: 'logistics_parcels' },
  { domain: 'jiffy.com', from: 'Jiffy Shirts <support@jiffyshirts.com>', vendor: 'Jiffy.com', category: 'CATEGORY_UPDATES', archetype: 'logistics_parcels' },
  { domain: 'hellofresh.com', from: 'HelloFresh <delivery@hellofresh.com>', vendor: 'HelloFresh', category: 'CATEGORY_UPDATES', archetype: 'logistics_parcels' },
  { domain: 'blueapron.com', from: 'Blue Apron <orders@blueapron.com>', vendor: 'Blue Apron', category: 'CATEGORY_UPDATES', archetype: 'logistics_parcels' },
  { domain: 'instacart.com', from: 'Instacart Delivery <orders@instacart.com>', vendor: 'Instacart', category: 'CATEGORY_UPDATES', archetype: 'logistics_parcels' },
  { domain: 'ups.com', from: 'UPS My Choice <pkginfo@ups.com>', vendor: 'UPS', category: 'CATEGORY_UPDATES', archetype: 'logistics_parcels' },
  { domain: 'fedex.com', from: 'FedEx Tracking <trackingupdates@fedex.com>', vendor: 'FedEx', category: 'CATEGORY_UPDATES', archetype: 'logistics_parcels' },
  { domain: 'usps.com', from: 'USPS Informed Delivery <auto-reply@usps.com>', vendor: 'USPS', category: 'CATEGORY_UPDATES', archetype: 'logistics_parcels' },
  { domain: 'dhl.com', from: 'DHL Express <donotreply_us@dhl.com>', vendor: 'DHL', category: 'CATEGORY_UPDATES', archetype: 'logistics_parcels' },

  // Executive Actions (Bills, Waivers, Permission Slips, Forms)
  { domain: 'palmbeachschools.org', from: 'Principal Davis <principal@palmbeachschools.org>', vendor: 'Palm Beach County Schools', category: 'CATEGORY_PERSONAL', archetype: 'executive_actions' },
  { domain: 'schoolcashonline.com', from: 'SchoolCash Online <notifications@schoolcashonline.com>', vendor: 'SchoolCash Online', category: 'CATEGORY_PERSONAL', archetype: 'executive_actions' },
  { domain: 'superstartennis.com', from: 'Coach Mark <coach@superstartennis.com>', vendor: 'Superstar Tennis', category: 'CATEGORY_PERSONAL', archetype: 'executive_actions' },
  { domain: 'fpl.com', from: 'Florida Power & Light <ebill@fpl.com>', vendor: 'Florida Power & Light', category: 'CATEGORY_UPDATES', archetype: 'executive_actions' },
  { domain: 'pbcwater.org', from: 'PBC Water Utilities <billing@pbcwater.org>', vendor: 'PBC Water Utilities', category: 'CATEGORY_UPDATES', archetype: 'executive_actions' },
  { domain: 'chase.com', from: 'Chase Alerts <service@chase.com>', vendor: 'Chase', category: 'CATEGORY_UPDATES', archetype: 'executive_actions' },
  { domain: 'americanexpress.com', from: 'American Express <notifications@americanexpress.com>', vendor: 'American Express', category: 'CATEGORY_UPDATES', archetype: 'executive_actions' },

  // Temporal Appointments (Medical, School Calendar, Sports, Travel)
  { domain: 'palmpediatrics.com', from: 'Palm Pediatrics <appointments@palmpediatrics.com>', vendor: 'Palm Pediatrics', category: 'CATEGORY_PERSONAL', archetype: 'temporal_appointments' },
  { domain: 'smiledental.com', from: 'Smile Dental Care <reminders@smiledental.com>', vendor: 'Smile Dental', category: 'CATEGORY_PERSONAL', archetype: 'temporal_appointments' },
  { domain: 'coastalortho.com', from: 'Coastal Orthodontics <frontdesk@coastalortho.com>', vendor: 'Coastal Ortho', category: 'CATEGORY_PERSONAL', archetype: 'temporal_appointments' },
  { domain: 'mychart.com', from: 'MyChart Health <no-reply@mychart.com>', vendor: 'MyChart', category: 'CATEGORY_PERSONAL', archetype: 'temporal_appointments' },
  { domain: 'delta.com', from: 'Delta Air Lines <ticketreceipt@delta.com>', vendor: 'Delta Air Lines', category: 'CATEGORY_UPDATES', archetype: 'temporal_appointments' },
  { domain: 'united.com', from: 'United Airlines <customercare@united.com>', vendor: 'United Airlines', category: 'CATEGORY_UPDATES', archetype: 'temporal_appointments' },
  { domain: 'pbaquatics.org', from: 'PB Aquatics Swim <swim@pbaquatics.org>', vendor: 'PB Aquatics', category: 'CATEGORY_PERSONAL', archetype: 'temporal_appointments' },
  { domain: 'floridayouthorchestra.org', from: 'Florida Youth Orchestra <director@floridayouthorchestra.org>', vendor: 'Florida Youth Orchestra', category: 'CATEGORY_PERSONAL', archetype: 'temporal_appointments' },

  // Estate Knowledge (HOA, Newsletters, Maintenance)
  { domain: 'mirasolhoa.com', from: 'Mirasol HOA Board <manager@mirasolhoa.com>', vendor: 'Mirasol HOA', category: 'CATEGORY_FORUMS', archetype: 'estate_knowledge' },
  { domain: 'superioracrepairs.com', from: 'Superior AC Repairs <service@superioracrepairs.com>', vendor: 'Superior AC Repairs', category: 'CATEGORY_UPDATES', archetype: 'estate_knowledge' },
  { domain: 'flpremierpools.com', from: 'FL Premier Pools <support@flpremierpools.com>', vendor: 'Florida Premier Pools', category: 'CATEGORY_UPDATES', archetype: 'estate_knowledge' },
  { domain: 'enverasystems.com', from: 'Envera Gate Security <security@enverasystems.com>', vendor: 'Envera Systems', category: 'CATEGORY_UPDATES', archetype: 'estate_knowledge' },

  // Promotional Noise
  { domain: 'jcrew.com', from: 'J.Crew <news@jcrew.com>', vendor: 'J.Crew', category: 'CATEGORY_PROMOTIONS', archetype: 'promotional_noise' },
  { domain: 'potterybarn.com', from: 'Pottery Barn <specialoffers@potterybarn.com>', vendor: 'Pottery Barn', category: 'CATEGORY_PROMOTIONS', archetype: 'promotional_noise' },
  { domain: 'bestbuy.com', from: 'Best Buy Deals <deals@bestbuy.com>', vendor: 'Best Buy', category: 'CATEGORY_PROMOTIONS', archetype: 'promotional_noise' },
  { domain: 'crateandbarrel.com', from: 'Crate & Barrel <promotions@crateandbarrel.com>', vendor: 'Crate & Barrel', category: 'CATEGORY_PROMOTIONS', archetype: 'promotional_noise' },
  { domain: 'williams-sonoma.com', from: 'Williams Sonoma <news@williams-sonoma.com>', vendor: 'Williams Sonoma', category: 'CATEGORY_PROMOTIONS', archetype: 'promotional_noise' },
  { domain: 'doordash.com', from: 'DoorDash Deals <deals@doordash.com>', vendor: 'DoorDash', category: 'CATEGORY_PROMOTIONS', archetype: 'promotional_noise' },
  { domain: 'amazon.com', from: 'Amazon Deals <store-news@amazon.com>', vendor: 'Amazon', category: 'CATEGORY_PROMOTIONS', archetype: 'promotional_noise' },
  { domain: 'walmart.com', from: 'Walmart Savings <savings@walmart.com>', vendor: 'Walmart', category: 'CATEGORY_PROMOTIONS', archetype: 'promotional_noise' },
  { domain: 'chewy.com', from: 'Chewy Promotions <promotions@chewy.com>', vendor: 'Chewy', category: 'CATEGORY_PROMOTIONS', archetype: 'promotional_noise' },
  { domain: 'instacart.com', from: 'Instacart Offers <offers@instacart.com>', vendor: 'Instacart', category: 'CATEGORY_PROMOTIONS', archetype: 'promotional_noise' },
  { domain: 'hellofresh.com', from: 'HelloFresh <hello@hellofresh.com>', vendor: 'HelloFresh', category: 'CATEGORY_PROMOTIONS', archetype: 'promotional_noise' },
  { domain: 'morningbrew.com', from: 'Morning Brew <newsletter@morningbrew.com>', vendor: 'Morning Brew', category: 'CATEGORY_PROMOTIONS', archetype: 'promotional_noise' },
]

// ============================================================================
// 3. SYNTHETIC EMAIL GENERATOR
// ============================================================================

export function generateSyntheticEmail(index, prng, options = {}) {
  const injectPii = options.injectKnownPii || (index % 4 === 0)
  const isGoldBenchmark = options.isGoldBenchmark || false

  // Pick target archetype with realistic proportions
  // Logistics ~22%, Executive ~18%, Temporal ~18%, Lifecycle ~14%, Estate ~15%, Promo ~13%
  const archRoll = prng()
  let targetArch = 'logistics_parcels'
  if (archRoll < 0.22) targetArch = 'logistics_parcels'
  else if (archRoll < 0.40) targetArch = 'executive_actions'
  else if (archRoll < 0.58) targetArch = 'temporal_appointments'
  else if (archRoll < 0.72) targetArch = 'lifecycle_updates'
  else if (archRoll < 0.87) targetArch = 'estate_knowledge'
  else targetArch = 'promotional_noise'

  // Pick suitable sender
  const sendersForArch = SENDER_POOL.filter(s => {
    if (targetArch === 'lifecycle_updates') {
      return ['delta.com', 'united.com', 'amazon.com', 'walmart.com', 'ups.com', 'palmpediatrics.com', 'fpl.com'].includes(s.domain)
    }
    return s.archetype === targetArch
  })
  const sender = sendersForArch.length > 0
    ? sendersForArch[Math.floor(prng() * sendersForArch.length)]
    : SENDER_POOL[Math.floor(prng() * SENDER_POOL.length)]

  const id = `syn_msg_${String(index + 1).padStart(5, '0')}`
  const threadId = `syn_thd_${String(Math.floor(index / 2) + 1).padStart(5, '0')}`
  const messageId = `<msg_${id}_${Math.floor(prng() * 100000)}@${sender.domain}>`

  // PII tokens to track
  const piiTokens = []
  const familyName = KNOWN_PII_SEEDS.names[Math.floor(prng() * KNOWN_PII_SEEDS.names.length)]
  const phone = KNOWN_PII_SEEDS.phones[Math.floor(prng() * KNOWN_PII_SEEDS.phones.length)]
  const personalEmail = KNOWN_PII_SEEDS.emails[Math.floor(prng() * KNOWN_PII_SEEDS.emails.length)]
  const address = KNOWN_PII_SEEDS.addresses[Math.floor(prng() * KNOWN_PII_SEEDS.addresses.length)]
  const creditCard = KNOWN_PII_SEEDS.creditCards[Math.floor(prng() * KNOWN_PII_SEEDS.creditCards.length)]
  const ssn = KNOWN_PII_SEEDS.ssns[Math.floor(prng() * KNOWN_PII_SEEDS.ssns.length)]
  const credential = KNOWN_PII_SEEDS.credentials[Math.floor(prng() * KNOWN_PII_SEEDS.credentials.length)]
  const studentId = KNOWN_PII_SEEDS.studentIds[Math.floor(prng() * KNOWN_PII_SEEDS.studentIds.length)]
  const dob = KNOWN_PII_SEEDS.dobs[Math.floor(prng() * KNOWN_PII_SEEDS.dobs.length)]

  if (injectPii) {
    piiTokens.push(familyName, phone, personalEmail, address, creditCard, ssn)
  }

  let subject = ''
  let bodyText = ''
  let subCategory = ''
  let agencyLevel = 0

  const orderNumAmazon = `114-${String(1000000 + Math.floor(prng() * 8999999))}-${String(1000000 + Math.floor(prng() * 8999999))}`
  const orderNumWalmart = `2000154-${String(10000000 + Math.floor(prng() * 89999999))}`
  const trackingUps = `1Z${String(Math.floor(prng() * 10000000000000000)).padStart(16, '9')}`

  // Generate archetype-specific content
  if (targetArch === 'logistics_parcels') {
    agencyLevel = 0
    if (sender.vendor === 'Amazon') {
      subCategory = 'ecommerce_order'
      subject = `📦 Shipped: Your Amazon order #${orderNumAmazon}`
      bodyText = `Hi ${familyName},\n\nYour package containing 3 items has shipped with UPS (Tracking: ${trackingUps}).\nDelivery Address: ${address}\nEstimated arrival: Thursday by 8:00 PM.\n\nNote: Items eligible for return within 30 days of receipt.`
    } else if (sender.vendor === 'Walmart') {
      subCategory = 'grocery_delivery'
      subject = `Walmart InHome: Your groceries are on the way! (Order #${orderNumWalmart})`
      bodyText = `Hello ${familyName},\n\nYour InHome delivery driver is on the way to ${address}.\nOrder total: $84.23 paid with card ending in 4444.\nItems: Organic milk, strawberries, sourdough bread.\nDelivery window: Today, 2:00 PM - 4:00 PM.`
    } else if (sender.vendor === 'HelloFresh') {
      subCategory = 'meal_kit'
      subject = `Your HelloFresh box is on the way! (Order #HF-992834)`
      bodyText = `Hi ${familyName},\n\nYour meal kit box for 4 people has shipped via FedEx tracking 9400111899562537620192.\nDelivering to: ${address}.\nKeep refrigerated upon delivery.`
    } else {
      subCategory = 'courier_tracking'
      subject = `UPS My Choice: Package arriving today (Tracking ${trackingUps})`
      bodyText = `UPS Delivery Notice for ${familyName}.\nYour shipment from ${sender.vendor} is scheduled for delivery today by 7:00 PM at ${address}.\nTracking Number: ${trackingUps}.\nClaims for damaged packages must be filed within 3 days.`
    }
  } else if (targetArch === 'executive_actions') {
    agencyLevel = 2
    if (sender.vendor === 'Palm Beach County Schools') {
      subCategory = 'permission_slip'
      subject = `⚠️ ACTION REQUIRED: Sign field trip permission slip for ${familyName}`
      bodyText = `Dear Parents,\n\nPlease sign and return the annual science museum permission slip for ${familyName} (${studentId}) by Friday, Sept 4.\nClick here to sign electronic consent: https://palmbeachschools.org/forms/sign-slip?id=4991\nContact: (561) 555-0199.`
    } else if (sender.vendor === 'SchoolCash Online') {
      subCategory = 'bill_invoice_due'
      subject = `Invoice Due: Middle School Band Fee ($75.00) - Action Required`
      bodyText = `Dear ${familyName},\n\nA new fee of $75.00 has been posted for ${studentId}.\nDue Date: Friday, Sept 11, 2026.\nPayment link: https://schoolcashonline.com/pay/inv_88291\nBalance due: $75.00.`
    } else if (sender.vendor === 'Florida Power & Light') {
      subCategory = 'bill_invoice_due'
      subject = `Your FPL Electric Statement is Ready - Amount Due: $245.18`
      bodyText = `Account for ${address}.\nDear ${familyName},\nYour electric bill of $245.18 is past due. Pay now at https://fpl.com/pay to avoid disruption of service.\nPayment due by 09/15/2026.`
    } else {
      subCategory = 'liability_waiver'
      subject = `Action Required: Superstar Tennis Liability Waiver for ${familyName}`
      bodyText = `Hi ${familyName},\n\nPlease complete the online liability waiver before the first tennis clinic on Saturday.\nSign and return form at: https://superstartennis.com/waiver/sign?ref=884\nEmergency phone: ${phone}.`
    }
  } else if (targetArch === 'temporal_appointments') {
    agencyLevel = 1
    if (sender.vendor === 'Palm Pediatrics') {
      subCategory = 'medical_doctor'
      subject = `Appointment Confirmed: Annual Pediatric Wellness Exam for ${familyName}`
      bodyText = `Appointment Reminder:\nPatient: ${familyName} (${dob}, ${studentId})\nDate: Tuesday, September 8, 2026 at 3:00 PM\nProvider: Dr. Martinez, MD\nLocation: 4520 PGA Blvd, Suite 200, Palm Beach Gardens, FL 33418\nPhone: (561) 555-0198.`
    } else if (sender.vendor === 'Smile Dental') {
      subCategory = 'dental_ortho'
      subject = `Reminder: Dental Checkup & Teeth Cleaning scheduled for ${familyName}`
      bodyText = `Hello ${familyName},\nThis is a confirmation for your upcoming teeth cleaning appointment on Wednesday, September 9 at 10:00 AM.\nLocation: Smile Dental Clinic.\nPlease arrive 10 minutes early.`
    } else if (sender.vendor === 'Delta Air Lines') {
      subCategory = 'travel_itinerary'
      subject = `Delta Flight Itinerary: Flight DL1492 (MIA -> LGA) Confirmation #DL8942`
      bodyText = `Passenger: ${familyName}\nConfirmation Code: DL8942\nFlight DL1492 departing Miami (MIA) on Friday, Oct 2 at 8:45 AM, arriving New York (LGA) at 11:55 AM.\nE-ticket receipt paid with Visa ending in 4444.`
    } else {
      subCategory = 'sports_practice_game'
      subject = `PB Aquatics Swim Meet Schedule - Saturday 8:00 AM`
      bodyText = `Swimmers & Parents,\n\nThe fall kickoff swim meet is scheduled for Saturday, Sept 12 at 8:00 AM at the North County Aquatic Complex.\nWarmups start at 7:15 AM.\nCoach Mark: ${phone}.`
    }
  } else if (targetArch === 'lifecycle_updates') {
    agencyLevel = 1
    if (sender.domain.includes('delta') || sender.domain.includes('united')) {
      subCategory = 'flight_schedule_change'
      subject = `✈️ Flight DL1492 Schedule Change: Delayed Departure`
      bodyText = `Flight Update for ${familyName} (Confirmation DL8942):\nFlight DL1492 has been delayed due to air traffic control.\nNew departure time: 10:15 AM (was 8:45 AM).\nNew Gate: C14.`
    } else if (sender.domain.includes('amazon') || sender.domain.includes('walmart')) {
      subCategory = 'order_item_cancellation'
      subject = `Update on Order #${orderNumAmazon}: Item out of stock & cancelled`
      bodyText = `Hi ${familyName},\n\nWe are writing to let you know that 1 item in your order #${orderNumAmazon} was out of stock and has been cancelled.\nA refund of $24.99 has been issued to your credit card ending in 4444.`
    } else if (sender.domain.includes('ups') || sender.domain.includes('fedex')) {
      subCategory = 'delivery_delay_exception'
      subject = `Delivery Delay Alert: Package ${trackingUps} rescheduled`
      bodyText = `UPS Exception Notification for ${address}.\nYour delivery has been rescheduled to tomorrow due to severe weather conditions along the route.\nUpdated delivery date: Tomorrow by 7:00 PM.`
    } else {
      subCategory = 'appointment_reschedule'
      subject = `Appointment Rescheduled: Dr. Martinez Pediatric Visit`
      bodyText = `Hi ${familyName},\nYour wellness exam originally scheduled for 3:00 PM has been rescheduled to Thursday at 4:30 PM due to a clinic schedule conflict.\nCall (561) 555-0198 if you need to choose another time.`
    }
  } else if (targetArch === 'estate_knowledge') {
    agencyLevel = 0
    if (sender.vendor === 'Mirasol HOA') {
      subCategory = 'hoa_rules_digest'
      subject = `Mirasol Community Weekly Newsletter & Pool Maintenance Schedule`
      bodyText = `Dear Residents,\n\nHere is this week's community newsletter:\n1. Pool Deck Resurfacing: The clubhouse pool will undergo maintenance from Sept 14-16.\n2. Landscaping schedule: Mowing on Tuesdays.\n3. Gate Security: New guest gate code in effect starting Oct 1.\nManagement Office: ${phone}.`
    } else if (sender.vendor === 'Superior AC Repairs') {
      subCategory = 'home_maintenance_guide'
      subject = `Seasonal AC Maintenance Guide & Quarterly Filter Replacement Tips`
      bodyText = `Homeowner Maintenance Bulletin for ${address}:\nIt is time for your quarterly HVAC air filter inspection. High-efficiency filters should be replaced every 90 days in South Florida humidity to prevent evaporator freeze-ups.\nCall Superior AC for scheduling.`
    } else {
      subCategory = 'school_newsletter'
      subject = `Principal Davis Weekly Newsletter - Back to School Announcements`
      bodyText = `Palm Beach Elementary Family Digest:\nWelcome back students and parents! Please review the 2026-2027 school handbook and dress code guidelines on our website.\nImportant Dates to Note:\n- Open House: Sept 17\n- Picture Day: Sept 24\nGrade level school supply lists are now posted.`
    }
  } else {
    // Promotional Noise
    agencyLevel = 0
    subCategory = 'retail_sale'
    if (sender.vendor === 'DoorDash') {
      subCategory = 'coupon_discount'
      subject = `Get $0 delivery fees on your next 3 dinner orders with DashPass!`
      bodyText = `Enjoy unlimited free delivery on orders over $12. Use promo code ZERO at checkout.\nUnsubscribe: https://doordash.com/unsub`
    } else if (sender.vendor === 'Amazon') {
      subject = `Save 50% on Echo Dot and Fire TV - Prime Exclusive Sale!`
      bodyText = `Prime Exclusive Deals for ${familyName}!\nSave up to 50% off smart home devices this weekend only.\nShop deals now at amazon.com/deals.`
    } else if (sender.vendor === 'Walmart') {
      subject = `Rollbacks on electronics: Up to 40% off this weekend only`
      bodyText = `Discover massive rollbacks and save up to 40% on 4K TVs, laptops, and headphones.\nShop rollbacks at walmart.com.`
    } else if (sender.vendor === 'Chewy') {
      subCategory = 'coupon_discount'
      subject = `Save $20 on your first pet food order + free shipping`
      bodyText = `Stock up on healthy treats and food for your pets. Use coupon code PET20 for $20 off $49+.\nShop now at chewy.com.`
    } else if (sender.vendor === 'Instacart') {
      subCategory = 'coupon_discount'
      subject = `Save $15 on your grocery order of $50 or more!`
      bodyText = `Get fresh groceries delivered to your door in as fast as 1 hour. Use promo code FRESH15 at checkout.\nShop instacart.com.`
    } else if (sender.vendor === 'HelloFresh') {
      subCategory = 'coupon_discount'
      subject = `Claim 16 Free Meals + 3 Surprise Gifts when you reactivate!`
      bodyText = `We miss cooking with you! Reactivate your HelloFresh subscription and claim 16 free meals across your next 7 boxes.\nReactivate at hellofresh.com.`
    } else if (sender.vendor === 'Morning Brew') {
      subCategory = 'marketing_digest'
      subject = `The Daily Brew: Tech stocks rally and markets digest rate cut signals`
      bodyText = `Good morning! Markets reached fresh record highs as investors evaluated central bank commentary. Plus, retail trends this week.\nUnsubscribe at morningbrew.com.`
    } else {
      subject = `🔥 40% OFF Flash Sale This Weekend Only + Free Shipping!`
      bodyText = `Exclusive VIP Offer for ${familyName}!\nSave 40% on all new fall arrivals with coupon code FALL40 at checkout.\nFree shipping on orders over $50.\nShop now at ${sender.domain}/sale.\n\nTo stop receiving these emails, click unsubscribe.`
    }
  }

  // Inject extreme PII if specified
  if (injectPii && index % 10 === 0) {
    bodyText += `\n\n[CONFIDENTIAL RECORD]\nParent: ${familyName} (${ssn})\nHome: ${address}\nPhone: ${phone}\nEmail: ${personalEmail}\nCard: ${creditCard}\n${credential}`
  }

  return {
    id,
    threadId,
    messageId,
    from: sender.from,
    to: [`${familyName} <${personalEmail}>`],
    subject,
    snippet: bodyText.slice(0, 140).replace(/\n/g, ' '),
    bodyText,
    bodyHtml: `<div style="font-family:sans-serif;"><p>${bodyText.replace(/\n/g, '<br/>')}</p></div>`,
    internalDate: new Date(1787000000000 + index * 60000).toISOString(),
    labelIds: ['INBOX', sender.category],
    mailboxOwner: index % 2 === 0 ? 'jacob' : 'kelly',
    groundTruth: isGoldBenchmark || true
      ? {
          archetype: targetArch,
          subCategory,
          agencyLevel,
          expectedEntities: {
            vendor: sender.vendor,
            orderId: orderNumAmazon,
            trackingNumber: trackingUps,
            carrier: 'ups',
            piiTokens,
          },
        }
      : undefined,
  }
}

/**
 * Generates a full deterministic synthetic corpus (1,000+ emails).
 */
export function generateSyntheticCorpus(options = {}) {
  const count = Math.max(100, Number(options.count || 1100))
  const seed = options.seed !== undefined ? options.seed : 42
  const prng = createPRNG(seed)
  const corpus = []

  for (let i = 0; i < count; i++) {
    corpus.push(generateSyntheticEmail(i, prng, options))
  }

  return corpus
}

// ============================================================================
// 4. SUPABASE / GMAIL EXTRACTION CONNECTORS
// ============================================================================

export async function fetchSupabaseCorpus(options = {}) {
  const limit = options.limit || 1000
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.log('[Harvester] Supabase credentials not found in environment, using synthetic generator.')
    return generateSyntheticCorpus({ count: limit, seed: 42 })
  }

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(supabaseUrl, serviceKey)

    const { data: messages, error } = await client
      .from('gmail_processed_messages')
      .select('id, gmail_message_id, subject, from_email, received_at, email_body, intent')
      .not('email_body', 'is', null)
      .limit(limit)

    if (error || !messages || messages.length === 0) {
      console.log(`[Harvester] Supabase query returned ${messages?.length || 0} messages (error: ${error?.message}), falling back to synthetic.`)
      return generateSyntheticCorpus({ count: limit, seed: 42 })
    }

    console.log(`[Harvester] Retrieved ${messages.length} live messages from Supabase.`)
    return messages.map((m) => ({
      id: m.id,
      threadId: m.gmail_message_id,
      messageId: `<${m.gmail_message_id}@gmail.com>`,
      from: m.from_email || 'unknown@domain.com',
      subject: m.subject || '',
      bodyText: m.email_body || '',
      snippet: (m.email_body || '').slice(0, 140),
      internalDate: m.received_at || new Date().toISOString(),
      labelIds: ['INBOX', 'CATEGORY_UPDATES'],
      mailboxOwner: 'family',
    }))
  } catch (err) {
    console.log(`[Harvester] Error connecting to Supabase: ${err.message}, falling back to synthetic.`)
    return generateSyntheticCorpus({ count: limit, seed: 42 })
  }
}

// ============================================================================
// 5. MAIN HARVESTING RUNNER & CLI HANDLER
// ============================================================================

export async function harvestCorpus(options = {}) {
  const source = options.source || 'synthetic'
  const limit = options.limit || 1100
  const outPath = options.out || 'data/historical-email-corpus.json'
  const anonymize = options.anonymize !== false
  const runClustering = options.cluster !== false

  console.log(`\n================================================================`)
  console.log(`  CASA TABOR HISTORICAL EMAIL CORPUS HARVESTER & CLUSTERER`)
  console.log(`================================================================`)
  console.log(`Source:     ${source}`)
  console.log(`Target Limit: ${limit}`)
  console.log(`Anonymize:  ${anonymize}`)
  console.log(`Clustering: ${runClustering}`)
  console.log(`Output:     ${outPath}\n`)

  const startMs = performance.now()

  let rawCorpus = []
  if (source === 'supabase') {
    rawCorpus = await fetchSupabaseCorpus({ limit })
  } else if (source === 'gmail') {
    console.log('[Harvester] Live Gmail API mode requires active OAuth session, falling back to synthetic generator.')
    rawCorpus = generateSyntheticCorpus({ count: limit, seed: 42 })
  } else {
    rawCorpus = generateSyntheticCorpus({ count: limit, seed: 42 })
  }

  const harvestMs = performance.now() - startMs
  console.log(`✓ Harvested ${rawCorpus.length} raw emails in ${harvestMs.toFixed(1)}ms.`)

  let resultData = rawCorpus
  let clusterResult = null

  if (runClustering) {
    const clusterStart = performance.now()
    clusterResult = clusterEmailCorpus(rawCorpus, { anonymize, deduplicate: true })
    const clusterMs = performance.now() - clusterStart
    resultData = clusterResult

    const throughput = (rawCorpus.length / (clusterMs / 1000)).toFixed(0)
    console.log(`✓ Processed & clustered ${clusterResult.processedEmails.length} emails in ${clusterMs.toFixed(1)}ms (${throughput} emails/sec).\n`)

    console.log(`--- Semantic Archetype Distribution ---`)
    for (const [arch, stat] of Object.entries(clusterResult.stats.archetypeDistribution)) {
      console.log(`  • ${arch.padEnd(25)}: ${String(stat.count).padStart(4)} (${stat.percentage}%)`)
    }

    if (anonymize) {
      console.log(`\n--- PII Redaction Statistics ---`)
      const pii = clusterResult.stats.piiStats
      console.log(`  • Names Redacted:         ${pii.names}`)
      console.log(`  • Phone Numbers:          ${pii.phones}`)
      console.log(`  • Personal Emails:        ${pii.personal_emails}`)
      console.log(`  • Physical Addresses:     ${pii.addresses}`)
      console.log(`  • Credit Cards:           ${pii.credit_cards}`)
      console.log(`  • Bank Accounts:          ${pii.bank_accounts}`)
      console.log(`  • SSNs:                   ${pii.ssns}`)
      console.log(`  • Credentials / PINs:     ${pii.credentials}`)
      console.log(`  • Total Redactions:       ${pii.total_redactions}`)
    }
  }

  // Write output
  const resolvedOut = resolve(process.cwd(), outPath)
  const dir = dirname(resolvedOut)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(resolvedOut, JSON.stringify(resultData, null, 2), 'utf-8')
  console.log(`\n✓ Anonymized corpus written to: ${resolvedOut}`)

  const totalMs = performance.now() - startMs
  console.log(`✓ Total execution completed in ${totalMs.toFixed(1)}ms.\n`)

  return {
    rawCount: rawCorpus.length,
    result: resultData,
    clusterResult,
    elapsedMs: totalMs,
  }
}

// Parse CLI arguments if executed directly
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename || 'scripts/harvest-historical-email-corpus.mjs')) {
  const args = process.argv.slice(2)
  const options = {}

  for (const arg of args) {
    if (arg.startsWith('--source=')) options.source = arg.split('=')[1]
    else if (arg.startsWith('--limit=')) options.limit = parseInt(arg.split('=')[1], 10)
    else if (arg.startsWith('--out=')) options.out = arg.split('=')[1]
    else if (arg === '--anonymize') options.anonymize = true
    else if (arg === '--no-anonymize') options.anonymize = false
    else if (arg === '--cluster') options.cluster = true
    else if (arg === '--stats') options.stats = true
    else if (arg === '--synthetic') options.source = 'synthetic'
  }

  harvestCorpus(options).catch((err) => {
    console.error('Fatal Harvester Error:', err)
    process.exit(1)
  })
}
