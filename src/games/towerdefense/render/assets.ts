/** Resolve only after decoding, so readiness means the image can actually be drawn. */
export function loadImage(src: string, image = new Image()): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    image.onload = () => { Promise.resolve().then(() => image.decode?.()).then(() => resolve(image), reject); };
    image.onerror = () => reject(new Error(`Unable to load battlefield image: ${src}`));
    image.src = src;
  });
}
export async function loadManifest<T>(src: string): Promise<T> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Unable to load battlefield manifest: ${src}`);
  return response.json() as Promise<T>;
}
