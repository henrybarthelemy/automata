import { useState } from 'react'
import { PATTERN_LIBRARY } from '../patterns/library'
import { parseRLE, type Pattern } from '../sim/rle'
import { Section } from './Section'

interface PatternMenuProps {
  open: boolean
  onToggle: (id: string) => void
  stamp: Pattern | null
  selectStamp: (pattern: Pattern | null) => void
  rotateStamp: () => void
  flipStamp: () => void
  importRLE: (text: string) => boolean
  exportRLE: () => string | null
}

export function PatternMenu({
  open,
  onToggle,
  stamp,
  selectStamp,
  rotateStamp,
  flipStamp,
  importRLE,
  exportRLE,
}: PatternMenuProps) {
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [pasteError, setPasteError] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  // Identify the selected library entry by name, since rotating replaces the
  // pattern object with a transformed copy.
  const selectedName = stamp?.name

  const choose = (id: string) => {
    const entry = PATTERN_LIBRARY.find((p) => p.id === id)
    if (!entry) return
    if (selectedName === entry.name) {
      selectStamp(null)
      return
    }
    const pattern = parseRLE(entry.rle)
    if (pattern) selectStamp({ ...pattern, name: entry.name })
  }

  const submitPaste = () => {
    const ok = importRLE(pasted)
    setPasteError(!ok)
    if (ok) {
      setPasting(false)
      setPasted('')
    }
  }

  const copyBoard = async () => {
    const rle = exportRLE()
    if (!rle) {
      setCopied('Board is empty')
      return
    }
    try {
      await navigator.clipboard.writeText(rle)
      setCopied(`Copied ${rle.length} chars`)
    } catch {
      setCopied('Clipboard blocked')
    }
  }

  return (
    <Section
      id="patterns"
      title="Patterns"
      open={open}
      onToggle={onToggle}
      info={
        <>
          <p>
            Choosing a pattern arms a stamp that follows the cursor; click the
            board to place it, <kbd>R</kbd> to rotate, <kbd>F</kbd> to flip.
          </p>
          <p>
            <strong>Paste RLE</strong> takes the run-length format LifeWiki
            publishes, so anything from there can be dropped straight in, and
            <strong> Copy board</strong> writes the live cells back out the same
            way.
          </p>
        </>
      }
    >
      <div className="patterns" data-tour="patterns">
        {PATTERN_LIBRARY.map((entry) => (
          <button
            key={entry.id}
            className={selectedName === entry.name ? 'pattern selected' : 'pattern'}
            title={entry.note}
            onClick={() => choose(entry.id)}
          >
            {entry.name}
          </button>
        ))}
      </div>

      {stamp && (
        <>
          <div className="transport">
            <button onClick={rotateStamp}>Rotate</button>
            <button onClick={flipStamp}>Flip</button>
            <button onClick={() => selectStamp(null)}>Cancel</button>
          </div>
          <p className="hint">
            Click the board to place. <kbd>R</kbd> rotates, <kbd>F</kbd> flips,{' '}
            <kbd>Esc</kbd> cancels.
          </p>
        </>
      )}

      <div className="transport">
        <button onClick={() => { setPasting(!pasting); setPasteError(false) }}>
          {pasting ? 'Close paste' : 'Paste RLE'}
        </button>
        <button onClick={copyBoard}>Copy board</button>
      </div>

      {pasting && (
        <label className="control">
          <span className="control-label">
            RLE
            {pasteError && <em className="invalid">not a pattern</em>}
          </span>
          <textarea
            className={pasteError ? 'text invalid' : 'text'}
            rows={4}
            spellCheck={false}
            placeholder="x = 3, y = 3, rule = B3/S23&#10;bob$2bo$3o!"
            value={pasted}
            onChange={(event) => { setPasted(event.target.value); setPasteError(false) }}
          />
          <button onClick={submitPaste} disabled={!pasted.trim()}>
            Load
          </button>
        </label>
      )}

      {copied && <p className="hint">{copied}</p>}
    </Section>
  )
}
