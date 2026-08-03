export function validateBillingTableIdentifier(value) {
  const parts = value.split('.')
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    throw new Error('invalid_google_billing_table')
  }
  return parts.join('.')
}

export function rowsFromBigQuery(payload) {
  const names = (payload?.schema?.fields ?? []).map((field) => String(field.name ?? ''))
  const rows = Array.isArray(payload?.rows) ? payload.rows : []
  return rows.map((raw) => {
    const values = Array.isArray(raw?.f) ? raw.f.map((field) => field?.v ?? null) : []
    const row = Object.fromEntries(names.map((name, index) => [name, values[index]]))
    const numberOrNull = (value) => value == null ? null : Number(value)
    return {
      usage_date: String(row.usage_date),
      project_id: String(row.project_id ?? 'unattributed'),
      project_name: row.project_name == null ? null : String(row.project_name),
      service_id: row.service_id == null ? null : String(row.service_id),
      service_name: String(row.service_name ?? 'Unknown service'),
      sku_id: row.sku_id == null ? null : String(row.sku_id),
      sku_name: String(row.sku_name ?? 'Unknown SKU'),
      usage_quantity: numberOrNull(row.usage_quantity),
      usage_unit: row.usage_unit == null ? null : String(row.usage_unit),
      subtotal_usd: Number(row.subtotal_usd ?? 0),
      credits_usd: Number(row.credits_usd ?? 0),
      cost_usd: Number(row.cost_usd ?? 0),
    }
  })
}

export function buildGoogleBillingQuery(table) {
  return `
select
  date(usage_start_time) as usage_date,
  coalesce(project.id, 'unattributed') as project_id,
  project.name as project_name,
  service.id as service_id,
  service.description as service_name,
  sku.id as sku_id,
  sku.description as sku_name,
  sum(usage.amount) as usage_quantity,
  usage.unit as usage_unit,
  sum(cost) as subtotal_usd,
  sum(ifnull((select sum(credit.amount) from unnest(credits) credit), 0)) as credits_usd,
  sum(cost) + sum(ifnull((select sum(credit.amount) from unnest(credits) credit), 0)) as cost_usd
from \`${table}\`
where date(usage_start_time) between @period_start and @period_end
  and currency = 'USD'
group by usage_date, project_id, project_name, service_id, service_name, sku_id, sku_name, usage_unit
order by usage_date, project_id, service_name, sku_name
`.trim()
}

