// Review-only skins. Production tokens and defaults stay unchanged until a direction is selected.
import './chrome-variants.css';
const variant = new URLSearchParams(location.search).get('variant');
if (variant && ['pocket', 'sprint', 'coinop'].includes(variant)) document.documentElement.dataset.arcadeVariant = variant;
