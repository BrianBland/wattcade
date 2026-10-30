// Pocket Arcade is the production default; the other two remain review-only skins.
import './chrome-variants.css';
const variant = new URLSearchParams(location.search).get('variant');
if (variant && ['sprint', 'coinop'].includes(variant)) document.documentElement.dataset.arcadeVariant = variant;
