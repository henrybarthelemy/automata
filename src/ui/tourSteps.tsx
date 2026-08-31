import type { TourStep } from './Tour'

/**
 * Six stops, in the order someone actually needs them: see the world, make it
 * move, change the law it obeys, drop in something known, restyle it, read it.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'canvas',
    target: '[data-tour="canvas"]',
    side: 'left',
    title: 'The world',
    body: (
      <>
        <p>
          Every cell lives or dies by the same rule, applied to all of them at
          once. Drag to draw, alt-drag to erase.
        </p>
        <p>
          Scroll to zoom about the cursor, shift-drag or middle-drag to pan. The
          edges wrap, so a glider leaving the right side comes back on the left.
        </p>
      </>
    ),
  },
  {
    id: 'transport',
    target: '[data-tour="transport"]',
    side: 'right',
    title: 'Run it',
    body: (
      <>
        <p>
          <strong>Play</strong> runs continuously; <strong>Step</strong> advances
          one generation, which is the honest way to watch a pattern work.
        </p>
        <p>
          <strong>Randomize</strong> fills the board with noise at the seed
          density set below &mdash; the quickest way to see a rule&rsquo;s
          character.
        </p>
      </>
    ),
  },
  {
    id: 'rule',
    target: '[data-tour="rule"]',
    section: 'rule',
    side: 'right',
    title: 'Change the law',
    body: (
      <>
        <p>
          <code>B3/S23</code> is Conway: a dead cell with 3 neighbours is born, a
          live one with 2 or 3 survives. Nothing here is special-cased, so
          <code>B36/S23</code> gives you HighLife and <code>B2/S</code> gives you
          Seeds.
        </p>
        <p>
          A third number makes it a Generations rule, where dying cells fade
          through states instead of vanishing &mdash; try <code>B2/S/3</code>.
        </p>
      </>
    ),
  },
  {
    id: 'patterns',
    target: '[data-tour="patterns"]',
    section: 'patterns',
    side: 'right',
    title: 'Known patterns',
    body: (
      <>
        <p>
          Pick one and it follows the cursor; click to place it, <kbd>R</kbd> to
          rotate, <kbd>F</kbd> to flip, <kbd>Esc</kbd> to drop it.
        </p>
        <p>
          The Gosper glider gun is the one to try first &mdash; it settles into
          emitting a glider every 30 generations, forever.
        </p>
      </>
    ),
  },
  {
    id: 'look',
    target: '[data-tour="look"]',
    section: 'look',
    side: 'right',
    title: 'Make it legible',
    body: (
      <>
        <p>
          Cells are coloured by how long they have been alive, so stable
          structures separate themselves from churn without you doing anything.
        </p>
        <p>
          <strong>Trail decay</strong> is how slowly dead cells fade. Turn it
          down and gliders leave comet tails; turn it to <em>off</em> for crisp
          black and white.
        </p>
      </>
    ),
  },
  {
    id: 'stats',
    target: '[data-tour="stats"]',
    section: 'stats',
    side: 'right',
    title: 'Read it',
    body: (
      <p>
        Births and deaths are counted inside the step loop, so they cost
        nothing. Watch them settle to equal numbers and you are looking at a
        pattern that has reached equilibrium.
      </p>
    ),
  },
]
