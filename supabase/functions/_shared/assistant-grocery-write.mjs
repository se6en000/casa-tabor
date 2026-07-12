function optionalText(value, maxLength) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized ? normalized.slice(0, maxLength) : null
}

export async function saveGroceryItems(sb, requestedItems) {
  const { data: lists, error: listError } = await sb.from('grocery_lists').select('id').order('created_at').limit(1)
  if (listError) throw new Error(listError.message)
  const listId = lists?.[0]?.id
  if (!listId) throw new Error('No grocery list found')

  const savedItems = []
  for (const raw of Array.isArray(requestedItems) ? requestedItems : []) {
    const name = optionalText(raw?.name, 180)
    if (!name) continue
    const row = {
      list_id: listId,
      name,
      quantity: optionalText(raw?.quantity, 60),
      unit: optionalText(raw?.unit, 60),
      category: optionalText(raw?.category, 60) ?? 'other',
      notes: optionalText(raw?.notes, 500),
      checked: false,
      last_modified_source: 'casa',
    }
    const { data: inserted, error } = await sb
      .from('grocery_items')
      .insert(row)
      .select('id, name, category')
      .single()
    if (error?.code === '23505') {
      const { data: existing, error: existingError } = await sb
        .from('grocery_items')
        .select('id, name, category')
        .eq('list_id', listId)
        .eq('name_normalized', name.toLowerCase())
        .eq('checked', false)
        .is('deleted_at', null)
        .maybeSingle()
      if (existingError) throw new Error(existingError.message)
      if (existing) savedItems.push({ ...existing, already_present: true })
      continue
    }
    if (error) throw new Error(error.message)
    if (inserted) savedItems.push({ ...inserted, already_present: false })
  }

  return {
    success: true,
    count: savedItems.filter((item) => !item.already_present).length,
    already_present_count: savedItems.filter((item) => item.already_present).length,
    items: savedItems,
    external_sync_status: 'asynchronous',
  }
}
