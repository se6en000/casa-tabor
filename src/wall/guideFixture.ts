import type { GuidePlace } from '../../supabase/functions/_shared/guide.mjs'

// The local guide's places worth trying on the wall fixture (canvas 85B): fourteen from its first real run, Oct 9 —
// their names, labels and what it heard, as saved.
export const GUIDE_PLACES: GuidePlace[] = [
  {
    "id": "g1",
    "name": "Sports & Rec",
    "address": "1035 N Railroad Ave, West Palm Beach, FL 33401, USA",
    "shelf": "gameday",
    "shelf_label": "Game-day bars",
    "drive_min": 8,
    "beyond": false,
    "rating": 4.5,
    "rating_count": 322,
    "maps_url": null,
    "website": null,
    "buzz": [
      {
        "kind": "press",
        "new": true,
        "said": "New sports bar with 27 TV screens, chic package, clay court patio, and elevated food and drinks.",
        "url": null
      },
      {
        "kind": "press",
        "new": true,
        "said": "New elevated sports bar with 27 TVs, chef-inspired food, and craft cocktails.",
        "url": null
      }
    ],
    "labels": [
      "local",
      "hot"
    ],
    "heard": "Talked up in the local press · 4.5 from 322 Google reviews. New sports bar with 27 TV screens, chic package, clay court patio, and elevated food and drinks.",
    "why": "A game-day bar for a stylish and fun outing.",
    "touristy": false,
    "status": "live"
  },
  {
    "id": "g2",
    "name": "Bar Capri",
    "address": "185 Banyan Blvd Rooftop, West Palm Beach, FL 33401, USA",
    "shelf": "bars",
    "shelf_label": "Neighborhood bars",
    "drive_min": 7,
    "beyond": false,
    "rating": 4.5,
    "rating_count": 222,
    "maps_url": null,
    "website": null,
    "buzz": [
      {
        "kind": "press",
        "new": true,
        "said": "Rooftop bar with stunning views, high-quality Italian cuisine, pizzas, and high-end snacks.",
        "url": null
      },
      {
        "kind": "press",
        "new": true,
        "said": "Located on Elisabetta's rooftop, it pairs stunning views with high-quality Italian cuisine and aperitifs.",
        "url": null
      }
    ],
    "labels": [
      "local",
      "hot"
    ],
    "heard": "Talked up in the local press · 4.5 from 222 Google reviews. Rooftop bar with stunning views, high-quality Italian cuisine, pizzas, and high-end snacks.",
    "why": "A rooftop bar for stunning views and a special night.",
    "touristy": false,
    "status": "live"
  },
  {
    "id": "g3",
    "name": "O'Sheas Irish Pub",
    "address": "531 Clematis St #1, West Palm Beach, FL 33401, USA",
    "shelf": "bars",
    "shelf_label": "Neighborhood bars",
    "drive_min": 6,
    "beyond": false,
    "rating": 4.5,
    "rating_count": 1761,
    "maps_url": null,
    "website": null,
    "buzz": [
      {
        "kind": "reddit",
        "new": false,
        "said": "Beloved local institution with a warm atmosphere and outdoor beer garden.",
        "url": null
      },
      {
        "kind": "press",
        "new": false,
        "said": "Classic pub-style sports bar, authentic and welcoming for soccer fans in downtown WPB.",
        "url": null
      }
    ],
    "labels": [
      "local"
    ],
    "heard": "Talked up on Reddit and in the local press · 4.5 from 1761 Google reviews. Beloved local institution with a warm atmosphere and outdoor beer garden.",
    "why": "An Irish pub for a warm and inviting atmosphere.",
    "touristy": false,
    "status": "live"
  },
  {
    "id": "g4",
    "name": "Civil Society Brewing Co.",
    "address": "425 Kanuga Dr, West Palm Beach, FL 33401, USA",
    "shelf": "trivia",
    "shelf_label": "Trivia nights",
    "drive_min": 9,
    "beyond": false,
    "rating": 4.7,
    "rating_count": 288,
    "maps_url": null,
    "website": null,
    "buzz": [
      {
        "kind": "reddit",
        "new": false,
        "said": "A good crowd on Thursdays, famous for hazy IPAs and a strong community vibe.",
        "url": null
      }
    ],
    "labels": [
      "local"
    ],
    "heard": "Talked up on Reddit · 4.7 from 288 Google reviews. A good crowd on Thursdays, famous for hazy IPAs and a strong community vibe.",
    "why": "A neighborhood spot for fun bar trivia.",
    "touristy": false,
    "status": "live"
  },
  {
    "id": "g5",
    "name": "Lucky Lou's Raw Bar",
    "address": "123 NE 20th Ave, Deerfield Beach, FL 33441, USA",
    "shelf": "oysters",
    "shelf_label": "Oysters & raw bars",
    "drive_min": 42,
    "beyond": false,
    "rating": 4.7,
    "rating_count": 630,
    "maps_url": null,
    "website": null,
    "buzz": [
      {
        "kind": "reddit",
        "new": true,
        "said": "Just opened last week, New Orleans-inspired favorites, grilled Atlantic oysters.",
        "url": null
      }
    ],
    "labels": [
      "local"
    ],
    "heard": "Talked up on Reddit · 4.7 from 630 Google reviews. Just opened last week, New Orleans-inspired favorites, grilled Atlantic oysters.",
    "why": "A new raw bar for delicious oysters and seafood.",
    "touristy": false,
    "status": "live"
  },
  {
    "id": "g6",
    "name": "The Colony Hotel",
    "address": "155 Hammon Ave, Palm Beach, FL 33480, USA",
    "shelf": "hotel",
    "shelf_label": "Boutique hotel bars",
    "drive_min": 10,
    "beyond": false,
    "rating": 4.6,
    "rating_count": 879,
    "maps_url": null,
    "website": null,
    "buzz": [
      {
        "kind": "reddit",
        "new": false,
        "said": "Has a great trivia night on Mondays with a range of questions and hints via Facebook.",
        "url": null
      }
    ],
    "labels": [
      "local"
    ],
    "heard": "Talked up on Reddit · 4.6 from 879 Google reviews. Has a great trivia night on Mondays with a range of questions and hints via Facebook.",
    "why": "A boutique hotel bar for a stylish evening.",
    "touristy": false,
    "status": "live"
  },
  {
    "id": "g7",
    "name": "Lost Weekend WPB",
    "address": "526 Clematis St, West Palm Beach, FL 33401, USA",
    "shelf": "gameday",
    "shelf_label": "Game-day bars",
    "drive_min": 6,
    "beyond": false,
    "rating": 4.4,
    "rating_count": 613,
    "maps_url": null,
    "website": null,
    "buzz": [
      {
        "kind": "reddit",
        "new": false,
        "said": "Vibrant bar with beer, live music, Mexican bites, and retro arcade games.",
        "url": null
      }
    ],
    "labels": [
      "local"
    ],
    "heard": "Talked up on Reddit · 4.4 from 613 Google reviews. Vibrant bar with beer, live music, Mexican bites, and retro arcade games.",
    "why": "A game-day bar for a lively and entertaining date.",
    "touristy": false,
    "status": "live"
  },
  {
    "id": "g8",
    "name": "Southport Raw Bar & Restaurant",
    "address": "1536 Cordova Rd, Fort Lauderdale, FL 33316, USA",
    "shelf": "oysters",
    "shelf_label": "Oysters & raw bars",
    "drive_min": 58,
    "beyond": true,
    "rating": 4.5,
    "rating_count": 5935,
    "maps_url": null,
    "website": null,
    "buzz": [
      {
        "kind": "press",
        "new": false,
        "said": "Low-key waterfront restaurant and raw bar, a Fort Lauderdale institution.",
        "url": null
      },
      {
        "kind": "press",
        "new": false,
        "said": "Beloved institution, casual waterfront dining, fresh raw-bar items, oldest and most popular seafood locale.",
        "url": null
      }
    ],
    "labels": [
      "local"
    ],
    "heard": "Talked up in the local press · 4.5 from 5935 Google reviews. Low-key waterfront restaurant and raw bar, a Fort Lauderdale institution.",
    "why": "A low-key waterfront spot for fresh oysters.",
    "touristy": false,
    "status": "live"
  },
  {
    "id": "g9",
    "name": "Kelsey Vintage Goods",
    "address": "748-B Park Ave, Lake Park, FL 33403, USA",
    "shelf": "vintage",
    "shelf_label": "Vintage",
    "drive_min": 21,
    "beyond": false,
    "rating": 4.9,
    "rating_count": 103,
    "maps_url": null,
    "website": null,
    "buzz": [],
    "labels": [
      "gem"
    ],
    "heard": "4.9 from 103 Google reviews.",
    "why": "A vintage store for a fun, unique shopping experience.",
    "touristy": false,
    "status": "live"
  },
  {
    "id": "g10",
    "name": "So Flo Finds",
    "address": "916 SE 5th Ave Ste h, Delray Beach, FL 33483, USA",
    "shelf": "vintage",
    "shelf_label": "Vintage",
    "drive_min": 33,
    "beyond": false,
    "rating": 5.0,
    "rating_count": 34,
    "maps_url": null,
    "website": null,
    "buzz": [],
    "labels": [
      "gem"
    ],
    "heard": "5.0 from 34 Google reviews.",
    "why": "A vintage thrift store for a fun, unique shopping experience.",
    "touristy": false,
    "status": "live"
  },
  {
    "id": "g11",
    "name": "Garden District Taproom",
    "address": "410 Evernia St Apt 119, West Palm Beach, FL 33401, USA",
    "shelf": "trivia",
    "shelf_label": "Trivia nights",
    "drive_min": 7,
    "beyond": false,
    "rating": 4.9,
    "rating_count": 122,
    "maps_url": null,
    "website": null,
    "buzz": [],
    "labels": [
      "gem"
    ],
    "heard": "4.9 from 122 Google reviews.",
    "why": "A bar for your fun trivia night.",
    "touristy": false,
    "status": "live"
  },
  {
    "id": "g12",
    "name": "REMBAR",
    "address": "4050 US-1 Ste 310, Jupiter, FL 33477, USA",
    "shelf": "bars",
    "shelf_label": "Neighborhood bars",
    "drive_min": 27,
    "beyond": false,
    "rating": 4.8,
    "rating_count": 97,
    "maps_url": null,
    "website": null,
    "buzz": [],
    "labels": [
      "gem"
    ],
    "heard": "4.8 from 97 Google reviews.",
    "why": "A wine bar for a slow date night.",
    "touristy": false,
    "status": "live"
  },
  {
    "id": "g13",
    "name": "Celona Restaurant & Gin Lounge",
    "address": "429 Northwood Rd, West Palm Beach, FL 33407, USA",
    "shelf": "bars",
    "shelf_label": "Neighborhood bars",
    "drive_min": 10,
    "beyond": false,
    "rating": 4.8,
    "rating_count": 46,
    "maps_url": null,
    "website": null,
    "buzz": [],
    "labels": [
      "gem"
    ],
    "heard": "4.8 from 46 Google reviews.",
    "why": "A neighborhood bar for a relaxed evening out.",
    "touristy": false,
    "status": "live"
  },
  {
    "id": "g14",
    "name": "alma Delray",
    "address": "165 NE 2nd Ave, Delray Beach, FL 33444, USA",
    "shelf": "oysters",
    "shelf_label": "Oysters & raw bars",
    "drive_min": 32,
    "beyond": false,
    "rating": 4.8,
    "rating_count": 118,
    "maps_url": null,
    "website": null,
    "buzz": [],
    "labels": [
      "gem"
    ],
    "heard": "4.8 from 118 Google reviews.",
    "why": "A restaurant offering oysters for a modern dining experience.",
    "touristy": false,
    "status": "live"
  }
]

// Out & about from your list (canvas 86C): some of them theirs — saved to try (one shared in their words, one asked
// about, one Kelly's), and two spots; the rest stay the guide's picks (one is the week's surprise).
const THEIRS: Record<string, Partial<GuidePlace>> = {
  g5: { status: 'saved', origin: 'shared', saved_at: '2026-09-24T20:05:00Z', buzz: [{ kind: 'shared', said: 'an oyster bar with a raw bar and a patio', new: false, url: null }] },
  g8: { status: 'saved', origin: 'asked', saved_at: '2026-09-23T15:00:00Z', note: 'You asked Alexa what was playing here.' },
  g7: { status: 'saved', origin: 'guide', saved_at: '2026-09-22T02:20:00Z', whose: 'kelly' },
  g11: { status: 'saved', origin: 'guide', saved_at: '2026-09-21T02:20:00Z' },
  g13: { status: 'spot', origin: 'taste', saved_at: '2026-09-01T12:00:00Z' },
  g9: { status: 'spot', origin: 'taste', saved_at: '2026-09-01T12:00:00Z' },
}
export const LIST_PLACES: GuidePlace[] = GUIDE_PLACES.map((p) => ({ ...p, ...(THEIRS[p.id] ?? {}) }))
export const LIST_WATCHES = [
  { id: 'w1', name: 'Candlelight concerts', kind: 'again' as const, whose: 'us' as const, note: 'You loved 90s Hip-Hop on Strings.' },
  { id: 'w2', name: 'Ballet Palm Beach', kind: 'asked' as const, whose: 'family' as const, note: 'You asked Alexa about ballet in Palm Beach.' },
  { id: 'w3', name: 'Fall festivals', kind: 'asked' as const, whose: 'family' as const, note: 'You asked for fall things to do with the kids.' },
]
// More like this (canvas 86F), as the scout's like returns it for Lost Weekend.
export const LIST_LIKE = {
  known_for: 'House music, dressed up',
  places: [
    { google_place_id: 'gp-spazio', name: 'Spazio', town: 'West Palm Beach', address: '207 Clematis St, West Palm Beach, FL 33401', drive_min: 8, rating: 4.6, what: 'An intimate late-night room for house music, with rotating DJs and a full bar.', alike: 'House music is the whole point', source: 'clubspazio.com' },
    { google_place_id: 'gp-rox', name: 'Top of the Rox', town: 'West Palm Beach', address: 'Clematis St, West Palm Beach, FL', drive_min: 8, rating: 4.1, what: 'A rooftop with a heated pool that turns into a nightclub after dark.', alike: 'Dress code on weekend nights', source: 'Atly' },
  ],
}
