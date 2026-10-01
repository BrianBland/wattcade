import { render } from 'preact';
import { App } from './shell/App';
import './styles/main.css';

render(<App />, document.getElementById('app')!);
