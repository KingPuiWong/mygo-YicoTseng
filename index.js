// MyGo Music source for 曾轶可 (NetEase artist 10750).
// Plain JavaScript: no Node APIs, dependencies, build, or extra API server.
const ORIGIN = "https://music.163.com";
const ARTIST_ID = "10750";
const CACHE_KEY = "catalog:v1";
const CACHE_AGE = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const RESULT_SIZE = 50;
const t = (text) => host.t(text);
let memory = null;

function fail(code, text) {
  const error = new Error(t(text));
  error.code = code;
  return error;
}

async function api(path, params = {}) {
  const query = Object.keys(params).map((key) => encodeURIComponent(key) + "=" + encodeURIComponent(String(params[key]))).join("&");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(ORIGIN + path + (query ? "?" + query : ""), {
      headers: { Referer: ORIGIN + "/" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const value = await response.json();
    if (value.code !== 200) throw new Error("NetEase " + value.code);
    return value;
  } catch (error) {
    console.log("NetEase: " + error.message);
    throw new Error(t("The music service is unavailable. Please try again later."));
  } finally {
    clearTimeout(timeout);
  }
}

function image(url) {
  if (!url) return "";
  const secure = url.replace(/^http:\/\//, "https://");
  return secure + (secure.includes("?") ? "&" : "?") + "param=800y800";
}

function artistValue(value) {
  return { id: String(value.id), name: value.name, imageUrl: image(value.picUrl || value.img1v1Url) };
}

function albumValue(value) {
  return {
    id: String(value.id), name: value.name, imageUrl: image(value.picUrl || value.blurPicUrl),
    released: value.publishTime > 0 ? new Date(value.publishTime).toISOString().slice(0, 10) : "",
  };
}

async function fetchCatalog() {
  const profile = await api("/api/v1/artist/" + ARTIST_ID);
  const songs = [];
  let offset = 0;
  let more = true;
  while (more) {
    const page = await api("/api/v1/artist/songs", { id: ARTIST_ID, order: "hot", offset, limit: PAGE_SIZE });
    const entries = page.songs || [];
    songs.push(...entries);
    offset += entries.length;
    more = Boolean(page.more) && entries.length > 0;
  }
  const tracks = new Map();
  const albums = new Map();
  const positions = {};
  for (const song of songs) {
    const artists = song.artists || song.ar || [];
    if (!artists.some((artist) => String(artist.id) === ARTIST_ID)) continue;
    const rawAlbum = song.album || song.al;
    if (!rawAlbum?.id) continue;
    const album = albumValue(rawAlbum);
    albums.set(album.id, album);
    const id = String(song.id);
    const privilege = song.privilege || {};
    tracks.set(id, {
      id, name: song.name, artists: artists.map(artistValue), album,
      duration: Number(song.duration || song.dt || 0),
      url: ORIGIN + "/song?id=" + id,
      unavailable: Number(privilege.st || 0) < 0 || privilege.pl === 0,
    });
    positions[id] = { disc: parseInt(song.disc, 10) || 1, number: Number(song.no || song.position || 0) };
  }
  if (!tracks.size || String(profile.artist?.id) !== ARTIST_ID) throw new Error(t("Could not load Yico's catalog"));
  const albumList = [...albums.values()];
  albumList.sort((a, b) => (a.released < b.released ? 1 : a.released > b.released ? -1 : 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { time: Date.now(), artist: artistValue(profile.artist), tracks: [...tracks.values()], albums: albumList, positions };
}

async function catalog() {
  if (memory && Date.now() - memory.time < CACHE_AGE) return memory;
  const previous = host.storage.get(CACHE_KEY);
  if (previous?.tracks?.length && Date.now() - previous.time < CACHE_AGE) return (memory = previous);
  try {
    const fresh = await fetchCatalog();
    host.storage.set(CACHE_KEY, fresh);
    return (memory = fresh);
  } catch (error) {
    if (previous?.tracks?.length) {
      console.log("Using cached catalog: " + error.message);
      return (memory = previous);
    }
    throw error;
  }
}

function artistOut(value) {
  return String(value.id) === ARTIST_ID ? { ...value, name: t("Yico Tseng") } : { ...value };
}
function albumOut(value, source) {
  return { ...value, artists: [artistOut(source.artist)] };
}
function trackOut(value, source) {
  return { ...value, artists: value.artists.map(artistOut), album: albumOut(value.album, source) };
}
function byIDs(ids, source) {
  const lookup = new Map(source.tracks.map((track) => [track.id, track]));
  return ids.filter((id) => lookup.has(id)).map((id) => trackOut(lookup.get(id), source));
}
function requireTrack(id, source) {
  const value = source.tracks.find((track) => track.id === String(id));
  if (!value) throw fail("unavailable", "This song is not in Yico's catalog");
  return value;
}
function shuffle(values, random = Math.random) {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}
function dailyRandom() {
  const now = new Date();
  let state = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
const available = (source) => source.tracks.filter((track) => !track.unavailable);
const normalize = (value) => String(value).toLowerCase().replace(/\s+/g, "");

export async function home() {
  const source = await catalog();
  const sections = [
    {
      title: t("Today's Picks"), pageTitle: t("Today's Yico"), subtitle: t("A different selection every day"),
      tracks: shuffle(available(source), dailyRandom()).slice(0, 30).map((track) => trackOut(track, source)),
    },
    { title: t("Albums"), albums: source.albums.map((album) => albumOut(album, source)), morePage: "albums" },
  ];
  const recentTracks = byIDs((host.storage.get("recent") || []).slice(0, 10), source);
  if (recentTracks.length) sections.push({ title: t("Recently Played"), tracks: recentTracks });
  sections.push({
    title: t("Yico Tseng"), artists: [artistOut(source.artist)],
    links: [{ title: t("All Songs"), subtitle: source.tracks.length + " " + t("songs"), page: "all" }],
  });
  return { title: t("Yico Tseng"), sections };
}

export async function browse({ page }) {
  const source = await catalog();
  if (page === "all") return {
    title: t("All Songs"), subtitle: source.tracks.length + " " + t("songs"),
    sections: [{ tracks: source.tracks.map((track) => trackOut(track, source)) }],
  };
  if (page === "albums") return { title: t("Albums"), sections: [{ albums: source.albums.map((album) => albumOut(album, source)) }] };
  throw fail("unavailable", "This page is unavailable");
}

export async function album({ id }) {
  const source = await catalog();
  const value = source.albums.find((album) => album.id === String(id));
  if (!value) throw fail("unavailable", "This album is unavailable");
  const tracks = source.tracks.filter((track) => track.album.id === value.id);
  tracks.sort((a, b) => source.positions[a.id].disc - source.positions[b.id].disc || source.positions[a.id].number - source.positions[b.id].number);
  return { album: albumOut(value, source), tracks: tracks.map((track) => trackOut(track, source)) };
}

export async function artist({ id }) {
  if (String(id) !== ARTIST_ID) throw fail("unavailable", "This artist is unavailable");
  const source = await catalog();
  return {
    artist: artistOut(source.artist), tracks: source.tracks.slice(0, 50).map((track) => trackOut(track, source)),
    albums: source.albums.map((album) => albumOut(album, source)),
  };
}

export async function search({ query = "", kind = "tracks", offset = 0 }) {
  const needle = normalize(query);
  if (!needle) return { [kind]: [], more: false };
  const source = await catalog();
  let matches = [];
  if (kind === "tracks") {
    matches = source.tracks.filter((track) => normalize(track.name).includes(needle) || normalize(track.album.name).includes(needle));
    matches.sort((a, b) => Number(!normalize(a.name).includes(needle)) - Number(!normalize(b.name).includes(needle)));
    matches = matches.map((track) => trackOut(track, source));
  } else if (kind === "albums") {
    matches = source.albums.filter((album) => normalize(album.name).includes(needle)).map((album) => albumOut(album, source));
  } else if (kind === "artists" && ["曾轶可", "曾軼可", "Yico Tseng", "Yico Zeng", "Zeng Yike"].some((name) => normalize(name).includes(needle))) {
    matches = [artistOut(source.artist)];
  }
  return { [kind]: matches.slice(offset, offset + RESULT_SIZE), more: offset + RESULT_SIZE < matches.length };
}

export async function suggest({ query = "" }) {
  const needle = normalize(query);
  if (!needle) return [];
  const source = await catalog();
  return [...new Set(source.tracks.filter((track) => normalize(track.name).includes(needle)).map((track) => track.name))].slice(0, 10);
}

export async function like({ id, on }) {
  const source = await catalog();
  const track = requireTrack(id, source);
  const ids = (host.storage.get("liked") || []).filter((value) => value !== track.id);
  if (on) ids.unshift(track.id);
  host.storage.set("liked", ids);
}
export async function liked({ offset = 0 } = {}) {
  const source = await catalog();
  const tracks = byIDs(host.storage.get("liked") || [], source);
  return { tracks: tracks.slice(offset, offset + RESULT_SIZE), more: offset + RESULT_SIZE < tracks.length };
}
export function isLiked({ ids }) {
  const favorites = new Set(host.storage.get("liked") || []);
  return Object.fromEntries(ids.map((id) => [id, favorites.has(String(id))]));
}
export async function played({ id }) {
  const track = requireTrack(id, await catalog());
  const ids = (host.storage.get("recent") || []).filter((value) => value !== track.id);
  host.storage.set("recent", [track.id, ...ids].slice(0, 50));
}
export async function recent() {
  return byIDs(host.storage.get("recent") || [], await catalog());
}

export async function stations() {
  const source = await catalog();
  return [{ id: "shuffle", name: t("Shuffle All"), description: t("Shuffle songs available without signing in"), imageUrl: source.artist.imageUrl }];
}
export async function stationNext({ id }) {
  if (id !== "shuffle") throw fail("unavailable", "This station is unavailable");
  const source = await catalog();
  const tracks = shuffle(available(source)).slice(0, 20);
  if (!tracks.length) throw fail("unavailable", "No songs are currently available");
  return tracks.map((track) => trackOut(track, source));
}

export async function lyrics({ id }) {
  const track = requireTrack(id, await catalog());
  const key = "lyrics:" + track.id;
  const cached = host.storage.get(key);
  if (cached) return cached;
  const result = await api("/api/song/lyric", { id: track.id, lv: -1, kv: -1, tv: -1 });
  const lrc = result.lrc?.lyric || "";
  if (!/\[\d+:\d+/.test(lrc)) return {};
  const value = { lrc, translation: result.tlyric?.lyric || "" };
  host.storage.set(key, value);
  return value;
}

export async function stream({ id }) {
  const track = requireTrack(id, await catalog());
  const result = await api("/api/song/enhance/player/url", { ids: JSON.stringify([Number(track.id)]), br: 128000 });
  const item = (result.data || []).find((value) => String(value.id) === track.id);
  if (!item?.url || item.code !== 200) throw fail("unavailable", "This song requires a membership or purchase, or is unavailable in your region. Open it in NetEase Cloud Music to check.");
  if (item.freeTrialInfo) throw fail("unavailable", "Only a preview is available for this song. Open it in NetEase Cloud Music to listen.");
  const type = String(item.type || "").toLowerCase();
  if (!["mp3", "flac", "ogg", "wav", "m4a", "aac"].includes(type)) throw fail("unavailable", "The music service returned an unsupported audio format");
  return {
    url: item.url.replace(/^http:\/\//, "https://"), type, size: Number(item.size || 0),
    quality: "standard", bitRate: Number(item.br || 128000),
    headers: { Referer: ORIGIN + "/" },
  };
}
