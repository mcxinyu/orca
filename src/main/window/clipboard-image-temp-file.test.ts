import { mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { tempRoot } = vi.hoisted(() => ({ tempRoot: { value: '' } }))

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot.value }
}))

vi.mock('../providers/ssh-filesystem-dispatch', () => ({
  requireSshFilesystemProvider: vi.fn()
}))

import { saveClipboardImageBufferAsTempFile } from './clipboard-image-temp-file'

describe.runIf(process.platform !== 'win32')('saveClipboardImageBufferAsTempFile', () => {
  beforeEach(() => {
    tempRoot.value = mkdtempSync(join(tmpdir(), 'orca-clipboard-image-test-'))
  })

  afterEach(() => {
    rmSync(tempRoot.value, { recursive: true, force: true })
  })

  it('uses an unpredictable private directory and exclusive private file', async () => {
    const victim = join(tempRoot.value, 'victim')
    mkdirSync(victim)
    symlinkSync(victim, join(tempRoot.value, 'orca-clipboard-images'))

    const savedPath = await saveClipboardImageBufferAsTempFile(Buffer.from('png'))
    const privateDir = join(savedPath, '..')

    expect(privateDir).toMatch(/orca-clipboard-images-[^/]+$/)
    expect(readdirSync(victim)).toEqual([])
    expect(statSync(privateDir).mode & 0o777).toBe(0o700)
    expect(statSync(savedPath).mode & 0o777).toBe(0o600)
  })
})
