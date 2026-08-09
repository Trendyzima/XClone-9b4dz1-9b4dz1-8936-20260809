import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

/**
 * AdMob IDs (native Android/iOS only):
 *   App:          ca-app-pub-7234579833875016~4829778821
 *   Banner:       ca-app-pub-7234579833875016/4099641690
 *   Interstitial: ca-app-pub-7234579833875016/8911947261
 *   Rewarded:     ca-app-pub-7234579833875016/2031881558
 *   Native:       ca-app-pub-7234579833875016/3193754134
 */

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(<App />);
