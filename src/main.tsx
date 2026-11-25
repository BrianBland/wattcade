import { render } from 'preact';
import { App } from './shell/App';
import { registerShared } from './live/shared';
import './styles/main.css';

registerShared(); // before any live-updated game runs (src/live)
render(<App />, document.getElementById('app')!);
