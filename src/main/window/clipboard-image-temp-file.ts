import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { app } from 'electron'
import { requireSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import { isWindowsAbsolutePathLike } from '../../shared/cross-platform-path'
import { assertClipboardImageByteLengthWithinLimit } from '../../shared/clipboard-image'

export type SaveClipboardImageAsTempFileArgs = {
  connectionId?: string | null
  runtimeEnvironmentId?: string | null
  includeLocalPreview?: boolean
}

export type SavedClipboardImage = {
  path: string
  previewSrc?: string
}

const REMOTE_CLIPBOARD_IMAGE_TEMP_DIR = '/tmp'
const LOCAL_CLIPBOARD_IMAGE_TEMP_DIR = 'orca-clipboard-images'

function joinRemotePath(basePath: string, fileName: string): string {
  if (isWindowsAbsolutePathLike(basePath)) {
    return path.win32.join(basePath, fileName)
  }
  return path.posix.join(basePath, fileName)
}

export async function saveClipboardImageBufferAsTempFile(
  buffer: Buffer,
  args?: SaveClipboardImageAsTempFileArgs
): Promise<string> {
  assertClipboardImageByteLengthWithinLimit(buffer.byteLength)

  const fileName = `orca-paste-${Date.now()}-${randomUUID()}.png`

  if (args?.connectionId) {
    const provider = requireSshFilesystemProvider(args.connectionId)
    const remoteTempDir = (await provider.getTempDir?.()) ?? REMOTE_CLIPBOARD_IMAGE_TEMP_DIR
    const remotePath = joinRemotePath(remoteTempDir, fileName)
    // Why: SSH terminal agents run on the remote host, so the pasted path must
    // name a remote file. The provider's base64 path writes binary bytes via SFTP.
    await provider.writeFileBase64(remotePath, buffer.toString('base64'))
    return remotePath
  }

  const tempDir = path.join(app.getPath('temp'), LOCAL_CLIPBOARD_IMAGE_TEMP_DIR)
  await fs.mkdir(tempDir, { recursive: true, mode: 0o700 })
  await fs.chmod(tempDir, 0o700).catch(() => {})
  const tempPath = path.join(tempDir, fileName)
  await fs.writeFile(tempPath, buffer, { mode: 0o600 })
  return tempPath
}
