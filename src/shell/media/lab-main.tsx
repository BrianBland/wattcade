import { render } from 'preact';
import { MusicLab } from './MusicLab';
import { Toasts } from '../components/Toasts';
import { input, unlockMedia } from '../services';
import '../../styles/main.css';

input.attachKeyboard(window); input.attachGamepad();
window.addEventListener('pointerdown', () => unlockMedia(), true);
window.addEventListener('keydown', () => unlockMedia(), true);
render(<><div class="screens"><MusicLab /></div><Toasts /></>, document.getElementById('app')!);
