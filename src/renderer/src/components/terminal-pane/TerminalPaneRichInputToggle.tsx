import { TextCursorInput } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

type TerminalPaneRichInputToggleProps = {
  isOpen: boolean | undefined
  onToggle: (() => void) | undefined
}

/** Header affordance that opens/closes the pane's rich input dock. */
export function TerminalPaneRichInputToggle({
  isOpen,
  onToggle
}: TerminalPaneRichInputToggleProps): React.JSX.Element {
  const label = translate('components.terminal.richInput.toggle', 'Toggle rich terminal input')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="pane-title-split-trigger"
          aria-label={label}
          aria-pressed={isOpen}
          onClick={(event) => {
            event.stopPropagation()
            onToggle?.()
          }}
        >
          <TextCursorInput className="size-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
