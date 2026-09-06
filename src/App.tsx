/**
 * Application shell. SCAFFOLD: screen navigation only; screens are placeholders.
 *
 * Responsibility: own the session state (loaded dataset summary, current
 * screen, analysis parameters), own the single analysis worker, and route
 * between the six screens in PLAN.md ("UI walkthrough"). Screens receive
 * plain props and callbacks; none of them talks to the worker directly.
 */
import { useState } from 'react';

import { config } from './config.ts';
import { CompareScreen } from './ui/screens/CompareScreen.tsx';
import { ExportScreen } from './ui/screens/ExportScreen.tsx';
import { GenotypeViewScreen } from './ui/screens/GenotypeViewScreen.tsx';
import { LineTableScreen } from './ui/screens/LineTableScreen.tsx';
import { SummaryScreen } from './ui/screens/SummaryScreen.tsx';
import { UploadScreen } from './ui/screens/UploadScreen.tsx';

export type Screen = 'upload' | 'summary' | 'lines' | 'genotypes' | 'compare' | 'export';

const SCREENS: { id: Screen; label: string }[] = [
  { id: 'upload', label: '1. Upload' },
  { id: 'summary', label: '2. Summary and QC' },
  { id: 'lines', label: '3. Lines' },
  { id: 'genotypes', label: '4. Graphical genotypes' },
  { id: 'compare', label: '5. Compare' },
  { id: 'export', label: '6. Export' },
];

export function App() {
  const [screen, setScreen] = useState<Screen>('upload');
  return (
    <div
      style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto', padding: 16 }}
    >
      <header>
        <h1 style={{ fontSize: 20, margin: 0 }}>Isoline Browser</h1>
        <p style={{ margin: '4px 0 12px', color: '#555' }}>
          Scaffold / pre-alpha. Files are processed in this browser tab and never uploaded.
        </p>
        <nav aria-label="Screens">
          {SCREENS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScreen(s.id)}
              aria-current={screen === s.id ? 'page' : undefined}
              style={{ marginRight: 8, fontWeight: screen === s.id ? 700 : 400 }}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>
      <main style={{ marginTop: 16 }}>
        {screen === 'upload' && <UploadScreen defaults={config} />}
        {screen === 'summary' && <SummaryScreen />}
        {screen === 'lines' && <LineTableScreen />}
        {screen === 'genotypes' && <GenotypeViewScreen />}
        {screen === 'compare' && <CompareScreen />}
        {screen === 'export' && <ExportScreen />}
      </main>
    </div>
  );
}
