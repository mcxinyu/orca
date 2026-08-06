import { describe, expect, it } from 'vitest'
import { terminalRichInputNewlineShortcut } from './TerminalRichInputStatus'

describe('terminalRichInputNewlineShortcut', () => {
  it('uses platform-correct Shift labels', () => {
    expect(terminalRichInputNewlineShortcut('darwin')).toBe('⇧+Enter')
    expect(terminalRichInputNewlineShortcut('linux')).toBe('Shift+Enter')
    expect(terminalRichInputNewlineShortcut('win32')).toBe('Shift+Enter')
  })
})
