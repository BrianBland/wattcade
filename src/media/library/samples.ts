/**
 * Sample tracks: Creative Commons songs on archive.org (CORS-open downloads), fetched on first use and then kept in
 * the library like the rider's own files. Picked for variety (tempo, genre) and licences that allow this use;
 * every one needs attribution, which the picker and title cards show.
 */
export interface SampleTrack {
  key: string; title: string; artist: string; album: string; genre: string;
  item: string; file: string;   // archive.org item id and file path
  sizeMb: number;
  license: { name: string; url: string };
}

const BY3 = { name: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' };
const BY4 = { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };
const BYNC3 = { name: 'CC BY-NC 3.0', url: 'https://creativecommons.org/licenses/by-nc/3.0/us/' };
const BYSA25 = { name: 'CC BY-SA 2.5', url: 'https://creativecommons.org/licenses/by-sa/2.5/' };
const KM = 'KevinMacLeod_2019-04_Discography';

export const SAMPLE_TRACKS: SampleTrack[] = [
  { key: 'km-in-a-heartbeat', title: 'In a Heartbeat', artist: 'Kevin MacLeod', album: 'Hard Electronic', genre: 'Electronic', item: KM, file: 'Kevin MacLeod/Hard Electronic/Kevin MacLeod - 09 - In a Heartbeat.mp3', sizeMb: 8.9, license: BY4 },
  { key: 'km-blue-scorpion', title: 'Blue Scorpion', artist: 'Kevin MacLeod', album: 'Hard Electronic', genre: 'Electronic', item: KM, file: 'Kevin MacLeod/Hard Electronic/Kevin MacLeod - 02 - Blue Scorpion.mp3', sizeMb: 8.1, license: BY4 },
  { key: 'km-shiny-tech', title: 'Shiny Tech', artist: 'Kevin MacLeod', album: 'Hard Electronic', genre: 'Techno', item: KM, file: 'Kevin MacLeod/Hard Electronic/Kevin MacLeod - 17 - Shiny Tech.mp3', sizeMb: 9.1, license: BY4 },
  { key: 'km-funky-chunk', title: 'Funky Chunk', artist: 'Kevin MacLeod', album: 'Groovy', genre: 'Funk', item: KM, file: 'Kevin MacLeod/Groovy/Kevin MacLeod - 01 - Funky Chunk.mp3', sizeMb: 8.1, license: BY4 },
  { key: 'home-resonance', title: 'Resonance', artist: 'HOME', album: 'Odyssey', genre: 'Synthwave', item: 'Home-Odyssey', file: 'Home-Odyssey-09Resonance.mp3', sizeMb: 8.7, license: BYNC3 },
  { key: 'home-nights', title: 'Nights (I Wish I Could Be There)', artist: 'HOME', album: 'Odyssey', genre: 'Synthwave', item: 'Home-Odyssey', file: 'Home-Odyssey-06NightsiWishICouldBeThere.mp3', sizeMb: 7.6, license: BYNC3 },
  { key: 'bff-hella', title: 'Hella', artist: 'Broke For Free', album: 'Slam Funk', genre: 'Electronic hip-hop', item: 'Slam_Funk-7603', file: 'Broke_For_Free_-_05_-_Hella.mp3', sizeMb: 11, license: BY3 },
  { key: 'jw-go', title: 'Go', artist: 'Josh Woodward', album: 'The Simple Life', genre: 'Rock', item: 'JoshWoodwardSelection', file: '06-JoshWoodward-TheSimpleLife-02-Go.mp3', sizeMb: 5.1, license: BY3 },
  { key: 'tryad-final-rewind', title: 'The Final Rewind', artist: 'Tryad', album: 'Public Domain', genre: 'Electronic rock', item: 'Tryad_-_Public_Domain', file: 'Tryad_-_02_-_The_Final_Rewind.mp3', sizeMb: 10.9, license: BYSA25 },
];

export const sampleUrl = (s: SampleTrack) => `https://archive.org/download/${s.item}/${s.file.split('/').map(encodeURIComponent).join('/')}`;
export const samplePage = (s: SampleTrack) => `https://archive.org/details/${s.item}`;
export const sampleId = (s: SampleTrack) => `sample:${s.key}`;
export const sampleCredit = (s: SampleTrack) => ({ text: `“${s.title}” by ${s.artist} · ${s.license.name} · via archive.org`, url: samplePage(s) });
