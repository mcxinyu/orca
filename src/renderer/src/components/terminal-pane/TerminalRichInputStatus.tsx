import { SquareTerminal } from 'lucide-react'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { useShortcutKeyDetails } from '@/hooks/useShortcutLabel'
import { translate } from '@/i18n/i18n'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import type { TerminalRichInputSubmitResult } from './terminal-rich-input-submit'

export type TerminalRichInputSendError = Exclude<
  TerminalRichInputSubmitResult['status'],
  'submitted'
> | null

export function terminalRichInputNewlineShortcut(
  platform: NodeJS.Platform = getShortcutPlatform()
): string {
  return platform === 'darwin' ? '⇧+Enter' : 'Shift+Enter'
}

export function TerminalRichInputStatus({
  error
}: {
  error: TerminalRichInputSendError
}): React.JSX.Element {
  const toggleShortcut = useShortcutKeyDetails('terminal.richInput.toggle')
  const text = error
    ? error === 'partially-written'
      ? translate(
          'components.terminal.richInput.sendPartial',
          'Part of the input was pasted. Check the terminal before retrying.'
        )
      : translate('components.terminal.richInput.sendFailed', 'Terminal input was not sent.')
    : translate('components.terminal.richInput.hint', 'Enter to send · {{value0}} for newline', {
        value0: terminalRichInputNewlineShortcut()
      })
  return (
    <>
      <SquareTerminal className="size-3.5 text-muted-foreground" />
      <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        <span>{text}</span>
        {!error && toggleShortcut.keys.length > 0 ? (
          <>
            <span>·</span>
            <ShortcutKeyCombo
              keys={toggleShortcut.keys}
              doubleTap={toggleShortcut.doubleTap}
              className="gap-0.5"
              separatorClassName="mx-0 text-[10px] text-muted-foreground"
              keyCapClassName="min-w-4 rounded-sm px-1 py-0 text-[10px] font-normal shadow-none"
            />
            <span>{translate('components.terminal.richInput.shortcutHint', 'to close')}</span>
          </>
        ) : null}
      </div>
    </>
  )
}
