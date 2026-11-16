import { getToken } from './api'

export async function verifyModel({ config, model, apiProto, signal }) {
  const { verify } = await import('ai-model-verifier')

  const transport = async ({ url, headers, reqBody, timeoutMs }) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal
    const requestHeaders = new Headers(headers)
    const token = getToken()
    if (token) requestHeaders.set('X-LMFPD-Session', token)

    const response = await fetch('/api/proxy?url=' + encodeURIComponent(url), {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(reqBody),
      signal: requestSignal,
      cache: 'no-store',
    })
    const text = await response.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }

    return {
      status: response.status,
      data,
      error: response.ok ? null : String(data?.error || `HTTP ${response.status}`),
      corsBlocked: false,
    }
  }

  return verify({
    vendor: apiProto === 'messages' ? 'anthropic' : 'openai',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model,
    mode: 'server',
    timeoutMs: 30000,
    transport,
    ...(apiProto === 'messages' ? { checks: { signature: true } } : {}),
  })
}

export function summarizeVerification(result) {
  return {
    verdict: result.verdict,
    maker: result.maker,
    detectedModel: result.detectedModel,
    reasons: (result.reasons || []).slice(0, 5).map(reason => String(reason).slice(0, 300)),
    findings: (result.findings || []).slice(0, 8).map(({ rule, severity, reason }) => ({
      rule,
      severity,
      reason: String(reason || '').slice(0, 300),
    })),
    probesPassed: result.probesPassed,
    probesTotal: result.probesTotal,
    latencyMs: result.latencyMs,
    error: result.connectivityError,
  }
}
