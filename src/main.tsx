import { render } from 'preact';
import { App } from './shell/App';
import { registerShared } from './live/shared';
import { keepRenderersLoadable } from './live/client';
import { allGames } from './games/registry';
import './styles/main.css';

registerShared(); // before any live-updated game runs (src/live)
keepRenderersLoadable(allGames); // a deploy since this page opened can't break game start
render(<App />, document.getElementById('app')!);
