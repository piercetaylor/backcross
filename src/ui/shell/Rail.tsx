/**
 * The left rail: the six steps of PLAN.md's UI walkthrough, in order, as the
 * app's only navigation.
 *
 * Responsibility: render the step list and report a navigation request. It
 * owns no session state -- which screen is showing, whether a dataset is
 * loaded and whether the rail is collapsed are all props -- so it can be
 * rendered to a string in Node and asserted against (tests/rail.test.tsx).
 *
 * Keyboard: the roving-tabindex toolbar of M2 with Up/Down replacing
 * Left/Right, since the rail is vertical. Only the current step is in the
 * Tab order; Up/Down/Home/End move focus between steps and activate the one
 * focus lands on, and they skip blocked steps rather than landing on a
 * control that would do nothing. The collapse control sits outside the
 * toolbar, at the rail's foot, and is an ordinary tab stop. The toolbar is a
 * `<div role="toolbar">` inside the `<nav>` landmark, because `toolbar` is
 * not an allowed role on `nav`.
 *
 * A step is blocked when nothing is loaded and it is not the Upload step:
 * aria-disabled (not `disabled`, so it stays discoverable by a screen
 * reader walking the toolbar), ignored on click, skipped by the arrow keys.
 * Each screen keeps its own "Load a dataset first." fallback for the case
 * where one is reached through state anyway.
 *
 * Collapsed, a step shows its number alone, with the full label as both
 * aria-label and title; the heading and the privacy sentence are hidden
 * from sight but kept for assistive technology. The width itself is not set
 * here: App puts data-rail="collapsed" on the grid root and shell.css owns
 * the rest.
 *
 * SCREENS and Screen live here rather than in App because the rail is what
 * enumerates them; App imports both.
 */
import { useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import './shell.css';

export type Screen = 'upload' | 'summary' | 'lines' | 'genotypes' | 'compare' | 'export';

export interface ScreenEntry {
  id: Screen;
  /** Position in the walkthrough, shown alone when the rail is collapsed. */
  step: number;
  label: string;
}

export const SCREENS: ScreenEntry[] = [
  { id: 'upload', step: 1, label: 'Upload' },
  { id: 'summary', step: 2, label: 'Summary and QC' },
  { id: 'lines', step: 3, label: 'Lines' },
  { id: 'genotypes', step: 4, label: 'Graphical genotypes' },
  { id: 'compare', step: 5, label: 'Compare' },
  { id: 'export', step: 6, label: 'Export' },
];

/** "4. Graphical genotypes": the step's full name, and its accessible name when collapsed. */
function fullLabel(entry: ScreenEntry): string {
  return `${entry.step}. ${entry.label}`;
}

type StepState = 'current' | 'done' | 'available' | 'blocked';

function stepState(entry: ScreenEntry, screen: Screen, loaded: boolean): StepState {
  if (!loaded && entry.id !== 'upload') return 'blocked';
  if (entry.id === screen) return 'current';
  if (entry.id === 'upload' && loaded) return 'done';
  return 'available';
}

export function Rail({
  screen,
  loaded,
  collapsed,
  onNavigate,
  onToggleCollapsed,
}: {
  screen: Screen;
  /** Whether a dataset is loaded; steps 2 to 6 are blocked until it is. */
  loaded: boolean;
  collapsed: boolean;
  onNavigate: (screen: Screen) => void;
  onToggleCollapsed: () => void;
}) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const states = SCREENS.map((entry) => stepState(entry, screen, loaded));
  const reachable = states.flatMap((state, i) => (state === 'blocked' ? [] : [i]));

  // Roving tabindex: move the React state and the DOM focus together, so the
  // two never disagree about which step is current. Blocked steps are not
  // in `reachable` and so are stepped over, not landed on.
  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (reachable.length === 0) return;
    const here = reachable.indexOf(SCREENS.findIndex((s) => s.id === screen));
    let target: number | undefined;
    if (e.key === 'ArrowDown') target = reachable[here < 0 ? 0 : (here + 1) % reachable.length];
    else if (e.key === 'ArrowUp')
      target =
        reachable[
          here < 0 ? reachable.length - 1 : (here - 1 + reachable.length) % reachable.length
        ];
    else if (e.key === 'Home') target = reachable[0];
    else if (e.key === 'End') target = reachable[reachable.length - 1];
    else return;
    e.preventDefault();
    if (target === undefined) return;
    const entry = SCREENS[target];
    if (entry === undefined) return;
    onNavigate(entry.id);
    itemRefs.current[target]?.focus();
  }

  return (
    <div className="rail">
      <h1 className={collapsed ? 'rail-title visually-hidden' : 'rail-title'}>Isoline Browser</h1>

      <nav aria-label="Steps">
        <div
          className="rail-steps"
          role="toolbar"
          aria-label="Steps"
          aria-orientation="vertical"
          onKeyDown={handleKeyDown}
        >
          {SCREENS.map((entry, i) => {
            const state = states[i] as StepState;
            const blocked = state === 'blocked';
            return (
              <button
                key={entry.id}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                className="rail-item"
                data-state={state}
                aria-current={entry.id === screen ? 'page' : undefined}
                aria-disabled={blocked ? true : undefined}
                aria-label={collapsed ? fullLabel(entry) : undefined}
                title={collapsed ? fullLabel(entry) : undefined}
                tabIndex={entry.id === screen ? 0 : -1}
                onClick={() => {
                  if (!blocked) onNavigate(entry.id);
                }}
              >
                {collapsed ? entry.step : fullLabel(entry)}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="rail-foot">
        <p className={collapsed ? 'rail-note visually-hidden' : 'rail-note'}>
          Files are processed in this browser tab and never uploaded.
        </p>
        <button
          type="button"
          className="rail-toggle"
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
        >
          <span aria-hidden="true">{collapsed ? '›' : '‹'}</span>
          <span className={collapsed ? 'visually-hidden' : undefined}>
            {collapsed ? 'Expand' : 'Collapse'}
          </span>
        </button>
      </div>
    </div>
  );
}
