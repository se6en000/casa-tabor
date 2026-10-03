import { useState } from 'react'
import type { ShopItem } from '../phone/groceries'
import WallGroceries from './WallGroceries'

// `?grocery=1` (canvas 35a): the Grocery page with a canned list, for the screenshots and tests. `&stale=1`: Reminders
// sync hasn't checked in.
const ITEMS: ShopItem[] = [
  { id: 'g1', name: 'Bananas', quantity: '6', unit: null, category: 'produce', checked: false },
  { id: 'g2', name: 'Apples', quantity: null, unit: null, category: 'produce', checked: false },
  { id: 'g3', name: 'Strawberries', quantity: null, unit: null, category: 'produce', checked: false },
  { id: 'g4', name: 'Avocados', quantity: '3', unit: null, category: 'produce', checked: false },
  { id: 'g5', name: 'Cilantro', quantity: null, unit: null, category: 'produce', checked: false },
  { id: 'g6', name: 'Milk, 2%', quantity: '1', unit: 'gallon', category: 'dairy', checked: false },
  { id: 'g7', name: 'Eggs', quantity: '1', unit: 'dozen', category: 'dairy', checked: false },
  { id: 'g8', name: 'Oat milk', quantity: null, unit: null, category: 'dairy', checked: false },
  { id: 'g9', name: 'Yogurt cups', quantity: '2', unit: null, category: 'dairy', checked: false },
  { id: 'g10', name: 'Chicken thighs', quantity: '2', unit: 'lbs', category: 'meat', checked: false },
  { id: 'g11', name: 'Flour tortillas', quantity: null, unit: null, category: 'bakery', checked: false },
  { id: 'g12', name: 'Cheerios', quantity: null, unit: null, category: 'pantry', checked: false },
  { id: 'g13', name: 'Taco shells', quantity: null, unit: null, category: 'pantry', checked: false },
  { id: 'g14', name: 'Soy sauce', quantity: null, unit: null, category: 'pantry', checked: false },
  { id: 'g15', name: 'Granola bars', quantity: null, unit: null, category: 'snacks', checked: false },
  { id: 'g16', name: 'Fruit snacks', quantity: null, unit: null, category: 'snacks', checked: false },
  { id: 'g17', name: 'Cat treats', quantity: null, unit: null, category: 'pet', checked: false },
  { id: 'g18', name: 'Paper plates', quantity: null, unit: null, category: 'household', checked: true },
  { id: 'g19', name: 'Butter', quantity: null, unit: null, category: 'dairy', checked: true },
  { id: 'g20', name: 'Grapes', quantity: null, unit: null, category: 'produce', checked: true },
]
const USUAL = ['Coffee creamer', 'Grapes', 'Broccoli', 'Bread', 'Blueberries', 'Mushrooms', 'Pasta', 'Butter']

export default function WallGroceriesFixture() {
  const [items, setItems] = useState(ITEMS)
  const stale = new URLSearchParams(window.location.search).get('stale') === '1'
  return (
    <WallGroceries
      syncStale={stale}
      data={{
        items,
        usual: USUAL,
        loading: false,
        tick: (id, checked) => setItems((list) => list.map((i) => (i.id === id ? { ...i, checked } : i))),
        add: (item) => setItems((list) => [...list, { id: `g-added-${list.length}`, checked: false, ...item }]),
        clearDone: () => setItems((list) => list.filter((i) => !i.checked)),
        move: (id, category) => setItems((list) => list.map((i) => (i.id === id ? { ...i, category } : i))),
      }}
    />
  )
}
