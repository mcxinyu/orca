import type { JSONContent } from '@tiptap/core'
import { useCallback, useMemo, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import { isImageDropPath } from './terminal-drop-image-path'
import {
  TERMINAL_RICH_INPUT_IMAGE_INSERTION_SIZE,
  terminalRichInputImageAttachments
} from './terminal-rich-input-model'
import type { TerminalRichInputImageAttachment } from './terminal-rich-input-types'

type ClipboardEventLike = {
  clipboardData: DataTransfer | null
  preventDefault: () => void
  defaultPrevented: boolean
}

export function useTerminalRichInputAttachments({
  scopeKey,
  initialContent,
  connectionId,
  runtimeEnvironmentId,
  focusEditor,
  onAttachmentsAdded,
  enabled
}: {
  scopeKey: string
  initialContent: JSONContent
  connectionId: string | null
  runtimeEnvironmentId: string | null
  focusEditor: () => void
  onAttachmentsAdded: (
    attachments: readonly TerminalRichInputImageAttachment[],
    insertionPosition?: number
  ) => void
  enabled: boolean
}): {
  attachments: TerminalRichInputImageAttachment[]
  attachmentBusy: boolean
  attachmentPending: boolean
  notice: string | null
  appendImagePaths: (paths: string[], insertionPosition?: number) => void
  handlePaste: (event: ClipboardEventLike, insertionPosition?: number) => boolean
  mapPendingInsertionPositions: (mapping: {
    map: (position: number, assoc?: number) => number
  }) => void
  syncAttachments: (attachments: readonly TerminalRichInputImageAttachment[]) => void
  pasteImageFromClipboard: (confirmedImage?: boolean, insertionPosition?: number) => void
} {
  const initialAttachments = useMemo(
    () => terminalRichInputImageAttachments(initialContent),
    [initialContent]
  )
  const [attachmentState, setAttachmentState] = useState(() => ({
    scopeKey,
    attachments: initialAttachments
  }))
  const attachments =
    attachmentState.scopeKey === scopeKey ? attachmentState.attachments : initialAttachments
  const [noticeState, setNoticeState] = useState({ scopeKey, notice: null as string | null })
  const notice = noticeState.scopeKey === scopeKey ? noticeState.notice : null
  const setNotice = useCallback(
    (next: string | null) => setNoticeState({ scopeKey, notice: next }),
    [scopeKey]
  )
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [attachmentPending, setAttachmentPending] = useState(false)
  const attachmentCounter = useRef(0)
  const clipboardPasteInFlight = useRef(false)
  const clipboardPasteConfirmed = useRef(false)
  const clipboardInsertionPosition = useRef<number | undefined>(undefined)
  const queuedClipboardPastes = useRef<{ insertionPosition?: number }[]>([])

  const updateAttachments = useCallback(
    (
      update: (previous: TerminalRichInputImageAttachment[]) => TerminalRichInputImageAttachment[]
    ) => {
      setAttachmentState((previous) => {
        const previousAttachments =
          previous.scopeKey === scopeKey ? previous.attachments : initialAttachments
        const attachments = update(previousAttachments)
        if (previous.scopeKey === scopeKey && attachments === previousAttachments) {
          return previous
        }
        if (previous.scopeKey === scopeKey) {
          syncAttachmentPreviewUrls(previousAttachments, attachments)
        }
        return { scopeKey, attachments }
      })
    },
    [initialAttachments, scopeKey]
  )

  const appendImageSources = useCallback(
    (sources: readonly { path: string; previewSrc?: string }[], insertionPosition?: number) => {
      const added = sources
        .filter((source) => isImageDropPath(source.path))
        .map((source) => {
          attachmentCounter.current += 1
          return { id: `${Date.now()}-${attachmentCounter.current}`, ...source }
        })
      if (added.length === 0) {
        return
      }
      updateAttachments((previous) => [...previous, ...added])
      onAttachmentsAdded(added, insertionPosition)
      setNotice(null)
      requestAnimationFrame(focusEditor)
    },
    [focusEditor, onAttachmentsAdded, setNotice, updateAttachments]
  )

  const appendImagePaths = useCallback(
    (paths: string[], insertionPosition?: number) =>
      appendImageSources(
        paths.map((path) => ({ path })),
        insertionPosition
      ),
    [appendImageSources]
  )

  const pasteImageFromClipboard = useCallback(
    (confirmedImage = false, insertionPosition?: number) => {
      if (!enabled) {
        return
      }
      if (clipboardPasteInFlight.current) {
        if (confirmedImage && clipboardPasteConfirmed.current) {
          queuedClipboardPastes.current.push({ insertionPosition })
          return
        }
        clipboardPasteConfirmed.current ||= confirmedImage
        clipboardInsertionPosition.current ??= insertionPosition
        return
      }
      clipboardPasteInFlight.current = true
      clipboardPasteConfirmed.current = confirmedImage
      clipboardInsertionPosition.current = insertionPosition
      let pendingTimer: number | null = null
      setAttachmentBusy(true)
      pendingTimer = window.setTimeout(() => setAttachmentPending(true), 120)
      void window.api.ui
        .saveClipboardImageAsTempFile({
          connectionId: connectionId ?? undefined,
          runtimeEnvironmentId: runtimeEnvironmentId ?? undefined,
          includeLocalPreview: true
        })
        .then((savedImage) => {
          if (savedImage) {
            const insertionPosition = clipboardInsertionPosition.current
            const source = typeof savedImage === 'string' ? { path: savedImage } : savedImage
            appendImageSources([source], insertionPosition)
            if (insertionPosition !== undefined) {
              for (const queuedPaste of queuedClipboardPastes.current) {
                if (
                  queuedPaste.insertionPosition !== undefined &&
                  queuedPaste.insertionPosition === insertionPosition
                ) {
                  queuedPaste.insertionPosition += TERMINAL_RICH_INPUT_IMAGE_INSERTION_SIZE
                }
              }
            }
          }
        })
        .catch((error) => {
          setNotice(
            extractIpcErrorMessage(
              error,
              translate('components.terminal.richInput.imagePasteFailed', 'Image paste failed.')
            )
          )
        })
        .finally(() => {
          if (pendingTimer !== null) {
            window.clearTimeout(pendingTimer)
          }
          clipboardPasteInFlight.current = false
          clipboardPasteConfirmed.current = false
          clipboardInsertionPosition.current = undefined
          setAttachmentBusy(false)
          setAttachmentPending(false)
          const nextPaste = queuedClipboardPastes.current.shift()
          if (nextPaste) {
            queueMicrotask(() => pasteImageFromClipboard(true, nextPaste.insertionPosition))
          }
        })
    },
    [appendImageSources, connectionId, enabled, runtimeEnvironmentId, setNotice]
  )

  const mapPendingInsertionPositions = useCallback(
    (mapping: { map: (position: number, assoc?: number) => number }) => {
      if (clipboardInsertionPosition.current !== undefined) {
        clipboardInsertionPosition.current = mapping.map(clipboardInsertionPosition.current, -1)
      }
      queuedClipboardPastes.current = queuedClipboardPastes.current.map((paste) => ({
        insertionPosition:
          paste.insertionPosition === undefined
            ? undefined
            : mapping.map(paste.insertionPosition, -1)
      }))
    },
    []
  )

  const handlePaste = useCallback(
    (event: ClipboardEventLike, insertionPosition?: number): boolean => {
      if (!enabled || event.defaultPrevented) {
        return false
      }
      const data = event.clipboardData
      // Electron can expose image-only native clipboards with an empty items
      // list, so text presence is the reliable fallthrough signal.
      if (!clipboardHasImage(data) && data?.getData('text/plain')) {
        return false
      }
      event.preventDefault()
      pasteImageFromClipboard(true, insertionPosition)
      return true
    },
    [enabled, pasteImageFromClipboard]
  )

  return {
    attachments,
    attachmentBusy,
    attachmentPending,
    notice,
    appendImagePaths,
    handlePaste,
    mapPendingInsertionPositions,
    pasteImageFromClipboard,
    syncAttachments: (next) =>
      updateAttachments((previous) => (sameAttachments(previous, next) ? previous : [...next]))
  }
}

const pendingPreviewRevocations = new Map<string, number>()

function syncAttachmentPreviewUrls(
  previous: readonly TerminalRichInputImageAttachment[],
  next: readonly TerminalRichInputImageAttachment[]
): void {
  const retained = new Set(next.flatMap(({ previewSrc }) => (previewSrc ? [previewSrc] : [])))
  for (const previewSrc of retained) {
    const timer = pendingPreviewRevocations.get(previewSrc)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      pendingPreviewRevocations.delete(previewSrc)
    }
  }
  for (const { previewSrc } of previous) {
    if (
      !previewSrc?.startsWith('blob:') ||
      retained.has(previewSrc) ||
      pendingPreviewRevocations.has(previewSrc)
    ) {
      continue
    }
    const timer = window.setTimeout(() => {
      URL.revokeObjectURL?.(previewSrc)
      pendingPreviewRevocations.delete(previewSrc)
    }, 30_000)
    pendingPreviewRevocations.set(previewSrc, timer)
  }
}

function sameAttachments(
  left: readonly TerminalRichInputImageAttachment[],
  right: readonly TerminalRichInputImageAttachment[]
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (attachment, index) =>
        attachment.id === right[index]?.id &&
        attachment.path === right[index]?.path &&
        attachment.previewSrc === right[index]?.previewSrc
    )
  )
}

function clipboardHasImage(data: DataTransfer | null): boolean {
  return Boolean(data && Array.from(data.items).some((item) => item.type.startsWith('image/')))
}
