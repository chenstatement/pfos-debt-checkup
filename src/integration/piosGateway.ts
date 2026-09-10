export interface GatewayFact {
  key: string
  value: unknown
  source_quote?: string
}

export interface GatewayPfosRecord {
  module_record_id: string
  source_event_id: string
  action: string
  target_ref?: string | null
  facts: GatewayFact[]
  payload?: { raw_text?: string }
  status: string
  created_at: string
}

export interface GatewayInboxResult {
  records: GatewayPfosRecord[]
}

const DEFAULT_GATEWAY_URL = import.meta.env.VITE_PIOS_GATEWAY_URL || 'http://127.0.0.1:8787'

export async function fetchPfosGatewayRecords(
  gatewayUrl: string = DEFAULT_GATEWAY_URL,
  signal?: AbortSignal,
): Promise<GatewayPfosRecord[]> {
  const response = await fetch(`${gatewayUrl.replace(/\/$/, '')}/v1/modules/pfos/records`, { signal })
  if (!response.ok) throw new Error(`PIOS Gateway 请求失败（${response.status}）`)
  const result = await response.json() as GatewayInboxResult
  return Array.isArray(result.records) ? result.records : []
}

export function gatewayRecordSummary(record: GatewayPfosRecord): string {
  const rawText = record.payload?.raw_text
  if (rawText) return rawText
  const fact = record.facts.find(item => item.key === 'pfos.case_update')
  return typeof fact?.value === 'string' ? fact.value : '来自 PIOS Gateway 的财务事项'
}

export function gatewayRecordImportedKey(record: GatewayPfosRecord): string {
  return `pios:${record.source_event_id}:${record.module_record_id}`
}
