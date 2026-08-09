import type { PrepItem } from '../types'

export interface PrepItemCluster {
  item: PrepItem
  itemIds: string[]
  relatedCount: number
}

export function prepItemClusterKey(item: PrepItem) {
  return item.event_id
    ? `event:${item.event_id}`
    : item.source_ref
      ? `source:${item.source_ref}`
      : `item:${item.id}`
}

export function clusterPrepItems(items: PrepItem[]): PrepItemCluster[] {
  const clusters = new Map<string, PrepItemCluster>()

  for (const item of items) {
    const key = prepItemClusterKey(item)
    const cluster = clusters.get(key)
    if (!cluster) {
      clusters.set(key, { item, itemIds: [item.id], relatedCount: 0 })
      continue
    }
    cluster.itemIds.push(item.id)
    cluster.relatedCount = cluster.itemIds.length - 1
  }

  return [...clusters.values()]
}
