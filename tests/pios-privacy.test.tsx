import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { DISCLAIMER_VERSION } from '../src/domain/constants'

function storage(raw: string | null) {
  const api = { getItem: vi.fn(() => raw), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() }
  vi.stubGlobal('localStorage', api)
  return api
}
function render(path: string) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}
afterEach(() => vi.unstubAllGlobals())

describe('PIOS data boundaries', () => {
  it('exposes only one local module and two verified private destinations', () => {
    storage(null)
    const html = render('/')
    expect(html).toContain('href="/pfos"')
    const external = [...html.matchAll(/href="(https:\/\/[^\"]+)"/g)].map(match => match[1])
    expect(external.sort()).toEqual([
      'https://family-health-console.shawn-chan.chatgpt.site',
      'https://yesterday-today-tomorrow.shawn-chan.chatgpt.site',
    ])
    expect((html.match(/入口待接入/g) || []).length).toBe(4)
    expect(html).not.toContain('href="#"')
    expect(html).not.toContain('建设中')
  })
  it('does not read, write or show financial records at root', () => {
    const api = storage('{"private-marker":"NEVER_SHOW_FINANCIAL_RECORDS"}')
    const html = render('/')
    expect(html).toContain('PIOS')
    expect(html).not.toContain('NEVER_SHOW_FINANCIAL_RECORDS')
    expect(html).not.toContain('免责声明：PFOS')
    expect(html).not.toContain('企业微信二维码')
    expect(api.getItem).not.toHaveBeenCalled()
    expect(api.setItem).not.toHaveBeenCalled()
    expect(api.removeItem).not.toHaveBeenCalled()
  })
  it('reads the original key and retains the existing-data welcome flow at /pfos', () => {
    const api = storage(JSON.stringify({debts: [{id: 'existing-fixture'}]}))
    const html = render('/pfos')
    expect(api.getItem).toHaveBeenCalledWith('pfos_v2_user_data')
    expect(html).toContain('查看我的体检报告')
    expect(html).toContain('PFOS 债务体检')
    expect(api.removeItem).not.toHaveBeenCalled()
  })
  it.each(['/dashboard','/debts','/cashflow','/risk','/actions','/settings','/runway','/wizard'])('retains the PFOS surface at %s', (path) => {
    storage(JSON.stringify({consent: {documentVersion: DISCLAIMER_VERSION, revokedAt: null}, debts: []}))
    const html = render(path)
    expect(html).toContain('免责声明：PFOS')
    expect(html).not.toContain('把生活，写成自己的系统')
  })
})
