import { describe, it, expect, vi } from 'vitest'

vi.mock('@/i18n', () => ({
  i18n: {
    global: {
      t: (key: string) => key,
    },
  },
}))

import { extractErrorMessage, isCancelledMessageBox } from './error'

describe('extractErrorMessage', () => {
  it('returns fallback for falsy inputs', () => {
    expect(extractErrorMessage(null, 'fb')).toBe('fb')
    expect(extractErrorMessage(undefined, 'fb')).toBe('fb')
    expect(extractErrorMessage(0 as any, 'fb')).toBe('fb')
  })

  it('returns the i18n generic key when no fallback given', () => {
    expect(extractErrorMessage(null)).toBe('common.errors.generic')
  })

  it('treats a non-empty string as the message', () => {
    expect(extractErrorMessage('boom')).toBe('boom')
  })

  it('falls back when given an empty string', () => {
    expect(extractErrorMessage('', 'fb')).toBe('fb')
  })

  it('reads response.data.error when it is a string', () => {
    const err = { response: { data: { error: 'rtsp unreachable' } } }
    expect(extractErrorMessage(err)).toBe('rtsp unreachable')
  })

  it('reads nested response.data.error.error', () => {
    const err = { response: { data: { error: { error: 'inner detail' } } } }
    expect(extractErrorMessage(err)).toBe('inner detail')
  })

  it('reads response.data.error.message', () => {
    const err = { response: { data: { error: { message: 'msg here' } } } }
    expect(extractErrorMessage(err)).toBe('msg here')
  })

  it('reads response.data.message as a final shape', () => {
    const err = { response: { data: { message: 'top level' } } }
    expect(extractErrorMessage(err)).toBe('top level')
  })

  it('reads Error.message when no response info', () => {
    expect(extractErrorMessage(new Error('plain err'))).toBe('plain err')
  })

  it('falls back if message is empty/non-string', () => {
    expect(extractErrorMessage({ message: '' }, 'fb')).toBe('fb')
    expect(extractErrorMessage({ message: 123 }, 'fb')).toBe('fb')
  })

  it('isCancelledMessageBox recognises ElMessageBox dismissals', () => {
    expect(isCancelledMessageBox('cancel')).toBe(true)
    expect(isCancelledMessageBox('close')).toBe(true)
    expect(isCancelledMessageBox('boom')).toBe(false)
    expect(isCancelledMessageBox(new Error('x'))).toBe(false)
  })
})
