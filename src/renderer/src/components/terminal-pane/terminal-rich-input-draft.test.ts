import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearTerminalRichInputDraftsForTests,
  readTerminalRichInputDraft,
  readTerminalRichInputDraftContent,
  writeTerminalRichInputDraft
} from './terminal-rich-input-draft'

describe('terminal rich input drafts', () => {
  beforeEach(() => clearTerminalRichInputDraftsForTests())

  it('keeps independent drafts for stable terminal leaves', () => {
    writeTerminalRichInputDraft('tab-1:leaf-a', 'first')
    writeTerminalRichInputDraft('tab-1:leaf-b', 'second')

    expect(readTerminalRichInputDraft('tab-1:leaf-a')).toBe('first')
    expect(readTerminalRichInputDraft('tab-1:leaf-b')).toBe('second')
  })

  it('restores inline attachment positions with the text draft', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Fix this → ' },
            {
              type: 'terminalImageAttachment',
              attrs: { id: 'image-1', path: '/tmp/image.png' }
            }
          ]
        }
      ]
    }

    writeTerminalRichInputDraft('tab-1:leaf-a', 'Fix this → ', content)

    expect(readTerminalRichInputDraftContent('tab-1:leaf-a')).toEqual(content)
  })

  it('drops an empty draft', () => {
    writeTerminalRichInputDraft('tab-1:leaf-a', 'first')
    writeTerminalRichInputDraft('tab-1:leaf-a', '')

    expect(readTerminalRichInputDraft('tab-1:leaf-a')).toBe('')
    expect(readTerminalRichInputDraftContent('tab-1:leaf-a')).toBeNull()
  })
})
