// Actual GameHost: verify ready -> loadout -> controls -> countdown -> play -> pause/help.
import { render } from 'preact';
import { testProfile } from '../src/core';
import { getGame } from '../src/games/registry';
import { activeSession, setFake } from '../src/shell/services';
import { GameHost } from '../src/shell/screens/GameHost';
import '../src/styles/main.css';
const game = getGame(new URLSearchParams(location.search).get('game') ?? 'towerdefense')!;
setFake(true);
const exit = () => render(<p>Exited</p>, document.querySelector('#app')!);
render(<GameHost game={game} profile={testProfile()} onQuit={exit} onAbandon={exit} onRestart={() => location.reload()} onSave={() => {}} />, document.querySelector('#app')!);
(window as any).__hudFlow = { session: activeSession };
