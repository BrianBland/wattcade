/** Clips recorded from the real renderers by `npm run capture:cards` (public/cards/<id>.mp4 + .webp poster; built on deploy). */
export const cardClip = (id: string, ext: 'mp4' | 'webp') => `${import.meta.env.BASE_URL}cards/${id}.${ext}`;
