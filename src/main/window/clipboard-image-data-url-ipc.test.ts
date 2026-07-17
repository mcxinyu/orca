import { beforeEach, describe, expect, it, vi } from 'vitest'

const { removeHandlerMock, handleMock, clipboardReadImageMock, nativeImageCreateFromBufferMock } =
  vi.hoisted(() => ({
    removeHandlerMock: vi.fn(),
    handleMock: vi.fn(),
    clipboardReadImageMock: vi.fn(),
    nativeImageCreateFromBufferMock: vi.fn()
  }))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp')
  },
  clipboard: {
    readText: vi.fn(),
    readBuffer: vi.fn(),
    writeText: vi.fn(),
    readImage: clipboardReadImageMock,
    writeImage: vi.fn(),
    writeBuffer: vi.fn()
  },
  ipcMain: {
    removeHandler: removeHandlerMock,
    handle: handleMock
  },
  nativeImage: {
    createFromBuffer: nativeImageCreateFromBufferMock
  }
}))

vi.mock('./dashboard-popout-window', () => ({ isDashboardPopoutRenderer: () => false }))

import { registerClipboardHandlers } from './clipboard-ipc-handlers'

function getImageDataUrlHandler(): (...args: unknown[]) => unknown {
  const call = (handleMock.mock.calls as [string, (...args: unknown[]) => unknown][]).find(
    ([channel]) => channel === 'clipboard:readImageDataUrl'
  )
  if (!call) {
    throw new Error('clipboard:readImageDataUrl was not registered')
  }
  return call[1]
}

function makeClipboardEvent(): { sender: Record<string, unknown> } {
  return {
    sender: {
      id: 17,
      getType: () => 'window',
      getURL: () => 'file:///orca/index.html',
      isDestroyed: () => false
    }
  }
}

describe('clipboard:readImageDataUrl', () => {
  beforeEach(() => {
    removeHandlerMock.mockReset()
    handleMock.mockReset()
    clipboardReadImageMock.mockReset()
    nativeImageCreateFromBufferMock.mockReset()
  })

  it('returns a bounded PNG data URL for image attachment previews', () => {
    const png = Buffer.from([0, 1, 2, 3])
    clipboardReadImageMock.mockReturnValue({
      getSize: () => ({ height: 1, width: 1 }),
      isEmpty: () => false,
      toPNG: () => png
    })
    registerClipboardHandlers({} as never)

    expect(getImageDataUrlHandler()(makeClipboardEvent())).toBe(
      `data:image/png;base64,${png.toString('base64')}`
    )
  })

  it('bounds clipboard image previews before returning them to the renderer', () => {
    const thumbnail = Buffer.from([4, 5, 6])
    const resize = vi.fn(() => ({ toPNG: () => thumbnail }))
    clipboardReadImageMock.mockReturnValue({
      getSize: () => ({ height: 1000, width: 2000 }),
      isEmpty: () => false,
      resize,
      toPNG: vi.fn()
    })
    registerClipboardHandlers({} as never)

    expect(getImageDataUrlHandler()(makeClipboardEvent())).toBe(
      `data:image/png;base64,${thumbnail.toString('base64')}`
    )
    expect(resize).toHaveBeenCalledWith({ height: 48, quality: 'good', width: 96 })
  })
})
