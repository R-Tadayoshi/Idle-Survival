import { useGameStore } from '../state/store';
import { OutpostScreen } from './OutpostScreen';

export function App() {
  const ready = useGameStore((s) => s.ready);

  if (!ready) {
    return (
      <div className="boot-screen">
        <div className="boot-title">HALCYON</div>
        <div className="boot-sub">establishing uplink…</div>
      </div>
    );
  }
  return <OutpostScreen />;
}
