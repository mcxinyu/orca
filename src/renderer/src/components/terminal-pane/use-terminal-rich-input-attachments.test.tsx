// @vitest-environment happy-dom
import { act, createElement, useEffect } from 'react'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { joinPath } from '@/lib/path'
import { useTerminalRichInputAttachments } from './use-terminal-rich-input-attachments'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

type ProbeApi = ReturnType<typeof useTerminalRichInputAttachments>
type OnAttachmentsAdded = Parameters<
  typeof useTerminalRichInputAttachments
>[0]['onAttachmentsAdded']

const noopAttachmentsAdded: OnAttachmentsAdded = () => {}

function Probe({
  onReady,
  onAttachmentsAdded = noopAttachmentsAdded
}: {
  onReady: (api: ProbeApi) => void
  onAttachmentsAdded?: OnAttachmentsAdded
}): React.JSX.Element {
  const api = useTerminalRichInputAttachments({
    scopeKey: 'tab:leaf',
    initialContent: { type: 'doc', content: [{ type: 'paragraph' }] },
    connectionId: null,
    runtimeEnvironmentId: null,
    focusEditor: () => {},
    onAttachmentsAdded,
    enabled: true
  })
  useEffect(() => {
    onReady(api)
  }, [api, onReady])
  return createElement('div')
}

async function renderProbe(
  onAttachmentsAdded?: OnAttachmentsAdded
): Promise<{ root: Root; latest: () => ProbeApi }> {
  const root = createRoot(document.createElement('div'))
  let api: ProbeApi | null = null
  await act(async () => {
    root.render(
      createElement(Probe, {
        onReady: (next: ProbeApi) => (api = next),
        onAttachmentsAdded
      })
    )
  })
  return {
    root,
    latest: () => {
      if (!api) {
        throw new Error('Probe did not render')
      }
      return api
    }
  }
}

describe('useTerminalRichInputAttachments', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not block or persist anything for a speculative text-clipboard probe', async () => {
    const saveClipboardImageAsTempFile = vi.fn().mockResolvedValue(null)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { saveClipboardImageAsTempFile } }
    })
    const probe = await renderProbe()

    await act(async () => {
      probe.latest().pasteImageFromClipboard()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(saveClipboardImageAsTempFile).toHaveBeenCalledOnce()
    expect(probe.latest().attachmentBusy).toBe(false)
    expect(probe.latest().attachments).toEqual([])
    probe.root.unmount()
  })

  it('coalesces an in-flight keydown save with the confirming paste event', async () => {
    let resolveSave: (value: string | null) => void = () => {}
    const saveClipboardImageAsTempFile = vi.fn(
      () => new Promise<string | null>((resolve) => (resolveSave = resolve))
    )
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { saveClipboardImageAsTempFile } }
    })
    const probe = await renderProbe()
    const preventDefault = vi.fn()

    await act(async () => {
      probe.latest().pasteImageFromClipboard()
      expect(
        probe.latest().handlePaste({
          clipboardData: { items: [], getData: () => '' } as unknown as DataTransfer,
          defaultPrevented: false,
          preventDefault
        })
      ).toBe(true)
      resolveSave('/tmp/confirmed.png')
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(saveClipboardImageAsTempFile).toHaveBeenCalledOnce()
    expect(probe.latest().attachments[0]?.path).toBe('/tmp/confirmed.png')
    probe.root.unmount()
  })

  it('inserts a clipboard image at the captured editor position', async () => {
    const onAttachmentsAdded = vi.fn()
    const saveClipboardImageAsTempFile = vi.fn().mockResolvedValue({
      path: '/runtime/tmp/orca-paste-1.png',
      previewSrc: '/local/tmp/orca-paste-1.png'
    })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { saveClipboardImageAsTempFile } }
    })
    const probe = await renderProbe(onAttachmentsAdded)

    await act(async () => {
      probe.latest().pasteImageFromClipboard(false, 7)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(saveClipboardImageAsTempFile).toHaveBeenCalledWith({
      connectionId: undefined,
      runtimeEnvironmentId: undefined,
      includeLocalPreview: true
    })
    expect(probe.latest().attachments).toEqual([
      {
        id: expect.any(String),
        path: '/runtime/tmp/orca-paste-1.png',
        previewSrc: '/local/tmp/orca-paste-1.png'
      }
    ])
    expect(onAttachmentsAdded).toHaveBeenCalledWith(probe.latest().attachments, 7)

    await act(async () => probe.latest().syncAttachments([]))
    expect(probe.latest().attachments).toEqual([])
    probe.root.unmount()
  })

  it('maps a pending image paste through intervening editor transactions', async () => {
    let resolveSave: (value: string | null) => void = () => {}
    const saveClipboardImageAsTempFile = vi.fn(
      () => new Promise<string | null>((resolve) => (resolveSave = resolve))
    )
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { saveClipboardImageAsTempFile } }
    })
    const onAttachmentsAdded = vi.fn<OnAttachmentsAdded>()
    const probe = await renderProbe(onAttachmentsAdded)

    const editor = new Editor({
      extensions: [StarterKit],
      content: '<p>abcdefgh</p>'
    })
    const transaction = editor.state.tr.insertText('more', 1)

    await act(async () => {
      probe.latest().pasteImageFromClipboard(true, 7)
      probe.latest().mapPendingInsertionPositions(transaction.mapping)
      editor.view.dispatch(transaction)
      resolveSave('/tmp/mapped.png')
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onAttachmentsAdded).toHaveBeenCalledWith(probe.latest().attachments, 11)
    editor.destroy()
    probe.root.unmount()
  })

  it('queues consecutive confirmed image pastes', async () => {
    const saveClipboardImageAsTempFile = vi
      .fn()
      .mockResolvedValueOnce('/tmp/first.png')
      .mockResolvedValueOnce('/tmp/second.png')
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { saveClipboardImageAsTempFile } }
    })
    const onAttachmentsAdded = vi.fn<OnAttachmentsAdded>()
    const probe = await renderProbe(onAttachmentsAdded)
    const pasteEvent = () => ({
      clipboardData: { items: [], getData: () => '' } as unknown as DataTransfer,
      defaultPrevented: false,
      preventDefault: vi.fn()
    })

    await act(async () => {
      probe.latest().handlePaste(pasteEvent(), 5)
      probe.latest().handlePaste(pasteEvent(), 5)
      await vi.waitFor(() => expect(saveClipboardImageAsTempFile).toHaveBeenCalledTimes(2))
    })

    expect(probe.latest().attachments.map((attachment) => attachment.path)).toEqual([
      '/tmp/first.png',
      '/tmp/second.png'
    ])
    expect(onAttachmentsAdded.mock.calls.map(([, position]) => position)).toEqual([5, 7])
    probe.root.unmount()
  })

  it('does not double-shift queued pastes after the completed insertion', async () => {
    const saveClipboardImageAsTempFile = vi
      .fn()
      .mockResolvedValueOnce('/tmp/first.png')
      .mockResolvedValueOnce('/tmp/second.png')
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { saveClipboardImageAsTempFile } }
    })
    const editor = new Editor({
      extensions: [StarterKit],
      content: '<p>abcdefghijkl</p>'
    })
    let latest: () => ProbeApi = () => {
      throw new Error('Probe not ready')
    }
    const onAttachmentsAdded = vi.fn<OnAttachmentsAdded>((_attachments, position) => {
      if (onAttachmentsAdded.mock.calls.length !== 1 || position === undefined) {
        return
      }
      const transaction = editor.state.tr.insertText('x', position)
      latest().mapPendingInsertionPositions(transaction.mapping)
      editor.view.dispatch(transaction)
    })
    const probe = await renderProbe(onAttachmentsAdded)
    latest = probe.latest
    const pasteEvent = () => ({
      clipboardData: { items: [], getData: () => '' } as unknown as DataTransfer,
      defaultPrevented: false,
      preventDefault: vi.fn()
    })

    await act(async () => {
      probe.latest().handlePaste(pasteEvent(), 5)
      probe.latest().handlePaste(pasteEvent(), 8)
      await vi.waitFor(() => expect(saveClipboardImageAsTempFile).toHaveBeenCalledTimes(2))
    })

    expect(onAttachmentsAdded.mock.calls.map(([, position]) => position)).toEqual([5, 9])
    editor.destroy()
    probe.root.unmount()
  })

  it('tracks exact editor attachment order and restores undone deletions', async () => {
    const probe = await renderProbe()
    const firstPath = joinPath('tmp', 'first.png')
    const secondPath = joinPath('tmp', 'second.png')
    await act(async () => probe.latest().appendImagePaths([firstPath, secondPath]))
    const first = probe.latest().attachments[0]!
    const second = probe.latest().attachments[1]!

    await act(async () => probe.latest().syncAttachments([second]))
    expect(probe.latest().attachments).toEqual([second])

    await act(async () => probe.latest().syncAttachments([second, first]))
    expect(probe.latest().attachments).toEqual([second, first])
    probe.root.unmount()
  })
})
