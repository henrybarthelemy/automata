import type { ReactNode } from 'react'
import { InfoTip } from './InfoTip'

interface SectionProps {
  id: string
  title: string
  open: boolean
  onToggle: (id: string) => void
  /** Prose that explains the section, shown behind the heading's "i". */
  info?: ReactNode
  children: ReactNode
}

/**
 * One collapsible block of the control panel. The panel is a single 268px
 * column with seven of these; collapsing the ones you are not using is the
 * difference between scanning it and scrolling it.
 *
 * Contents stay mounted when collapsed so that state inside them survives, but
 * `hidden` means a collapsed control cannot be measured - so a tour step that
 * points into a section names it, and the tour opens it before measuring.
 */
export function Section({ id, title, open, onToggle, info, children }: SectionProps) {
  return (
    <section className={open ? 'section open' : 'section'} data-section={id}>
      <h2>
        <button
          type="button"
          className="section-toggle"
          aria-expanded={open}
          aria-controls={`section-${id}`}
          onClick={() => onToggle(id)}
        >
          <span className="section-caret" aria-hidden="true" />
          {title}
        </button>
        {info && <InfoTip label={title}>{info}</InfoTip>}
      </h2>
      <div id={`section-${id}`} className="section-body" hidden={!open}>
        {children}
      </div>
    </section>
  )
}
