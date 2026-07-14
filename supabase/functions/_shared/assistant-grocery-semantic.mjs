function normalizeName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function activeRows(items) {
  return (items ?? []).filter((item) => !item?.checked && !item?.deleted_at)
}

function describeItem(item) {
  const amount = [item.quantity, item.unit].filter(Boolean).join(' ')
  return amount ? `${item.name} (${amount})` : item.name
}

export function findGroceryItem(items, itemName, activeItemId = null) {
  const rows = activeRows(items)
  if (!itemName && activeItemId) {
    const active = rows.find((item) => item.id === activeItemId)
    return active ? { item: active, ambiguous: false } : { item: null, ambiguous: false }
  }
  const query = normalizeName(itemName)
  if (!query) return { item: null, ambiguous: false }
  const exact = rows.filter((item) => normalizeName(item.name) === query)
  if (exact.length === 1) return { item: exact[0], ambiguous: false }
  if (exact.length > 1) return { item: null, ambiguous: true }
  const partial = rows.filter((item) => {
    const name = normalizeName(item.name)
    return name.includes(query) || query.includes(name)
  })
  return partial.length === 1
    ? { item: partial[0], ambiguous: false }
    : { item: null, ambiguous: partial.length > 1 }
}

export function resolveGrocerySemantic(frame, items, options = {}) {
  if (!frame) return null
  const rows = activeRows(items)
  if (frame.intent === 'grocery.list') {
    if (rows.length === 0) return { type: 'text', text: 'Your grocery list is empty.', items: [] }
    return {
      type: 'text',
      text: `${rows.length} ${rows.length === 1 ? 'item' : 'items'} on your grocery list:\n${rows.map((item) => `- ${describeItem(item)}`).join('\n')}`,
      items: rows,
    }
  }
  if (frame.intent === 'grocery.count') {
    return {
      type: 'text',
      text: rows.length === 0
        ? 'Your grocery list is empty.'
        : `You have ${rows.length} ${rows.length === 1 ? 'item' : 'items'} left on your grocery list.`,
      items: rows,
    }
  }
  if (frame.intent === 'grocery.contains') {
    const requested = frame.slots?.items ?? []
    const found = requested.filter((name) => findGroceryItem(rows, name).item)
    const missing = requested.filter((name) => !findGroceryItem(rows, name).item)
    const parts = [
      found.length ? `${found.join(', ')} ${found.length === 1 ? 'is' : 'are'} on the grocery list.` : null,
      missing.length ? `${missing.join(', ')} ${missing.length === 1 ? 'is not' : 'are not'} on the grocery list.` : null,
    ].filter(Boolean)
    return { type: 'text', text: parts.join(' '), items: found.map((name) => findGroceryItem(rows, name).item) }
  }
  if (frame.intent === 'grocery.quantity_read') {
    const match = findGroceryItem(rows, frame.slots?.item, options.activeItemId)
    if (match.ambiguous) {
      return { type: 'text', text: `I found more than one match for "${frame.slots?.item}". Please use the exact grocery item name.`, items: [] }
    }
    if (!match.item) {
      return { type: 'text', text: `I could not find "${frame.slots?.item ?? 'that item'}" on the active grocery list.`, items: [] }
    }
    const amount = [match.item.quantity, match.item.unit].filter(Boolean).join(' ')
    return {
      type: 'text',
      text: amount
        ? `${match.item.name} shows ${amount} on the grocery list.`
        : `${match.item.name} does not have a quantity set.`,
      items: [match.item],
    }
  }
  if (frame.intent === 'grocery.add') {
    const requested = frame.slots?.items ?? []
    if (requested.length === 0) return { type: 'text', text: 'Which item should I add to the grocery list?', items: [] }
    return {
      type: 'action',
      tool: 'add_grocery_items',
      args: {
        items: requested.map((item) => ({
          ...(typeof item === 'string' ? { name: item } : item),
          category: 'other',
        })),
      },
      requestedItems: requested.map((item) => typeof item === 'string' ? item : item.name),
    }
  }
  if (frame.intent === 'grocery.clear_checked') {
    return { type: 'action', tool: 'clear_checked_grocery_items', args: {} }
  }
  if (['grocery.check', 'grocery.remove', 'grocery.quantity'].includes(frame.intent)) {
    const match = findGroceryItem(rows, frame.slots?.item, options.activeItemId)
    if (match.ambiguous) {
      return { type: 'text', text: `I found more than one match for "${frame.slots?.item}". Please use the exact grocery item name.`, items: [] }
    }
    if (!match.item) {
      return { type: 'text', text: `I could not find "${frame.slots?.item ?? 'that item'}" on the active grocery list.`, items: [] }
    }
    if (frame.intent === 'grocery.check') {
      return { type: 'action', tool: 'check_grocery_item', args: { item_id: match.item.id, checked: true }, item: match.item }
    }
    if (frame.intent === 'grocery.remove') {
      return { type: 'action', tool: 'remove_grocery_item', args: { item_id: match.item.id }, item: match.item }
    }
    return {
      type: 'action',
      tool: 'update_grocery_item_quantity',
      args: { item_id: match.item.id, quantity: frame.slots.quantity },
      item: match.item,
    }
  }
  return null
}
