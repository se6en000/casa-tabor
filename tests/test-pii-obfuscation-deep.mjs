// tests/test-pii-obfuscation-deep.mjs
import { redactEmailPII } from '../supabase/functions/_shared/email-clusterer.mjs'

const piiTestCases = [
  // SSNs
  { category: 'SSN', input: '123-45-6789', desc: 'Standard hyphen' },
  { category: 'SSN', input: '123 45 6789', desc: 'Spaced format' },
  { category: 'SSN', input: '123.45.6789', desc: 'Dot separated' },
  { category: 'SSN', input: '123_45_6789', desc: 'Underscore separated' },
  { category: 'SSN', input: 'SSN: 123456789', desc: 'Unformatted 9-digit with SSN label' },

  // Credit Cards
  { category: 'Credit Card', input: '4000 1234 5678 9010', desc: 'Visa 16-digit spaced' },
  { category: 'Credit Card', input: '4000-1234-5678-9010', desc: 'Visa 16-digit dashed' },
  { category: 'Credit Card', input: '4000123456789010', desc: 'Visa 16-digit unspaced' },
  { category: 'Credit Card', input: '3782 822463 10005', desc: 'Amex 15-digit spaced' },
  { category: 'Credit Card', input: '3782-822463-10005', desc: 'Amex 15-digit dashed' },
  { category: 'Credit Card', input: '4111.2222.3333.4444', desc: 'Dot-separated 16-digit' },

  // Phones
  { category: 'Phone', input: '(561) 555-0199', desc: 'US standard parens' },
  { category: 'Phone', input: '561-555-0199', desc: 'US standard dashed' },
  { category: 'Phone', input: '561.555.0199', desc: 'US dot separated' },
  { category: 'Phone', input: '+1-561-555-0144', desc: 'US with +1' },
  { category: 'Phone', input: '+1 (561) 555-0144', desc: 'US +1 with parens' },
  { category: 'Phone', input: '5615550199', desc: 'US 10-digit raw' },
  { category: 'Phone', input: '+44 20 7946 0919', desc: 'UK International' },
  { category: 'Phone', input: '+33 1 42 68 55 00', desc: 'France International' },
  { category: 'Phone', input: '+81 3 1234 5678', desc: 'Japan International' },

  // Addresses
  { category: 'Address', input: '123 Ocean Boulevard, Apt 4B, Palm Beach, FL 33480', desc: 'Standard street with Apt' },
  { category: 'Address', input: '4520 PGA Blvd, Suite 200, Palm Beach Gardens, FL 33418', desc: 'Blvd with Suite' },
  { category: 'Address', input: '789 Mirasol Way, Palm Beach Gardens, FL 33418', desc: 'Way suffix' },
  { category: 'Address', input: '500 S Australian Ave, West Palm Beach, FL 33401', desc: 'Directional Ave' },
  { category: 'Address', input: '1000 North Military Trail, Jupiter, FL 33458', desc: 'Trail suffix' },
  { category: 'Address', input: 'PO Box 4920, Palm Beach, FL 33480', desc: 'PO Box format' },
  { category: 'Address', input: 'Unit 4B, 123 Ocean Blvd, Palm Beach, FL 33480', desc: 'Leading Unit prefix' },

  // Emails
  { category: 'Email', input: 'sarah.tabor@gmail.com', desc: 'Personal Gmail' },
  { category: 'Email', input: 'sarah.tabor+school@gmail.com', desc: 'Gmail with plus-tag' },
  { category: 'Email', input: 'SARAH.TABOR@GMAIL.COM', desc: 'Uppercase Gmail' },
  { category: 'Email', input: 'michael@taborfamily.net', desc: 'Custom domain email' },

  // Credentials
  { category: 'Credentials', input: 'PIN: 4829', desc: '4-digit PIN' },
  { category: 'Credentials', input: 'Temp Password: Pass#2026!', desc: 'Temporary Password' },
  { category: 'Credentials', input: 'Security Code: 839201', desc: 'Security Code' },
  { category: 'Credentials', input: 'OTP: 994812', desc: 'One Time Password' },
]

console.log('Testing PII Redaction & Leakage Matrix:\n')

let totalTested = 0
let totalRedacted = 0
let totalLeaked = 0

const categoryStats = {}

for (const tc of piiTestCases) {
  totalTested++
  if (!categoryStats[tc.category]) {
    categoryStats[tc.category] = { tested: 0, redacted: 0, leaked: 0 }
  }
  categoryStats[tc.category].tested++

  const inputWrapped = `Confidential record for testing: ${tc.input}. Please keep safe.`
  const result = redactEmailPII(inputWrapped)
  
  // Check if original sensitive token is still present in output
  const leaked = result.includes(tc.input)

  if (!leaked) {
    totalRedacted++
    categoryStats[tc.category].redacted++
    console.log(`[PASS] ${tc.category.padEnd(12)} | ${tc.desc.padEnd(35)} -> "${result.replace(/\n/g, ' ')}"`)
  } else {
    totalLeaked++
    categoryStats[tc.category].leaked++
    console.log(`[FAIL] ${tc.category.padEnd(12)} | ${tc.desc.padEnd(35)} -> LEAKED: "${tc.input}"`)
  }
}

console.log('\n======================================================')
console.log('  PII REDACTION CATEGORY SUMMARY')
console.log('======================================================')
for (const [cat, stats] of Object.entries(categoryStats)) {
  const pct = ((stats.redacted / stats.tested) * 100).toFixed(1)
  console.log(`• ${cat.padEnd(15)}: ${stats.redacted}/${stats.tested} redacted (${pct}% pass, ${stats.leaked} leaked)`)
}
console.log('======================================================')
console.log(`TOTAL: ${totalRedacted}/${totalTested} redacted (${((totalRedacted / totalTested) * 100).toFixed(1)}% pass rate, ${totalLeaked} leaks)`)
console.log('======================================================\n')
