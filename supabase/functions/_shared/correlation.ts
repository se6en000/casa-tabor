export function getCorrelationId(req: Request, source: string): string {
  const fromHeader = req.headers.get('x-correlation-id')?.trim()
  if (fromHeader) return fromHeader
  return `${source}-${crypto.randomUUID()}`
}

export function withCorrelationHeaders(
  headers: Record<string, string>,
  correlationId: string,
): Record<string, string> {
  return { ...headers, 'x-correlation-id': correlationId }
}

export function invocationHeaders(correlationId: string): Record<string, string> {
  return { 'x-correlation-id': correlationId }
}

