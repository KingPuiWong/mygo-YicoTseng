import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = join(root, "artifacts", "e2e", stamp);
await mkdir(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), status: "running", checks: [], nativeUI: "not verified" };
const journey = [];
const storageFile = join(output, "storage.json");
const settings = JSON.parse(process.env.E2E_SETTINGS_JSON || "{}");
const requestedQuality = process.env.E2E_QUALITY || "high";
let storage = {};
const manifest = JSON.parse(await readFile(join(root, "plugin.json"), "utf8"));
const translations = JSON.parse(await readFile(join(root, "locales", "zh-CN.json"), "utf8"));

function persist() {
  return writeFile(storageFile, JSON.stringify(storage, null, 2));
}
// These are the host's documented storage/translation methods. Network and
// audio are real; no plugin method or fetch response is mocked.
globalThis.host = {
  t: (text) => translations[text] || text,
  language: () => "zh-CN",
  setting: (key) => settings[key] || "",
  storage: {
    get: (key) => storage[key],
    set: (key, value) => { storage[key] = structuredClone(value); },
    remove: (key) => { delete storage[key]; },
  },
};

async function checked(label, action) {
  const value = await action();
  report.checks.push(label);
  journey.push({ action: label, at: new Date().toISOString() });
  await persist();
  return value;
}

async function decodeTrack(plugin, track, quality) {
  const stream = await plugin.stream({ id: track.id, quality });
  assert(["mp3", "flac", "ogg", "wav", "m4a", "aac"].includes(stream.type));
  const response = await fetch(stream.url, { headers: stream.headers || {}, signal: AbortSignal.timeout(120000) });
  assert(response.ok, `音频 HTTP ${response.status}: ${track.name}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length > 1024, "音频响应内容太短");
  const prefix = track.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const audio = join(output, `${prefix}.${stream.type}`);
  await writeFile(audio, bytes);
  const probeText = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,format_name:stream=codec_name,sample_rate,channels,bit_rate", "-of", "json", audio], { encoding: "utf8" });
  const probe = JSON.parse(probeText);
  await writeFile(join(output, `${prefix}-ffprobe.json`), probeText);
  const audioStream = probe.streams.find((item) => item.sample_rate);
  assert(audioStream, "没有可解码音轨");
  const decoded = execFileSync("ffmpeg", ["-v", "error", "-i", audio, "-map", "0:a:0", "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  await writeFile(join(output, `${prefix}-decode.log`), decoded || "音轨完整解码成功；FFmpeg 无错误输出。\n");
  const result = {
    id: track.id, name: track.name, album: track.album.name,
    bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
    seconds: Number(probe.format.duration), type: stream.type, codec: audioStream.codec_name,
    bitrate: Number(audioStream.bit_rate || 0), reportedBitrate: stream.bitRate, quality: stream.quality,
    host: new URL(stream.url).hostname,
  };
  assert(result.seconds > 10);
  if (track.duration > 0) assert(result.seconds * 1000 >= track.duration - 5000, "实际音频短于歌曲时长，可能是试听片段");
  report.playbacks ||= [];
  report.playbacks.push(result);
  console.log(JSON.stringify({ decoded: track.id, name: track.name, bitrate: result.bitrate, seconds: result.seconds }));
  return result;
}

try {
  report.sourceSHA256 = createHash("sha256").update(await readFile(join(root, manifest.main))).digest("hex");
  report.manifestSHA256 = createHash("sha256").update(await readFile(join(root, "plugin.json"))).digest("hex");
  const entry = pathToFileURL(join(root, manifest.main)).href;
  let plugin = await import(`${entry}?run=${stamp}`);
  const home = await checked("首页返回歌曲", async () => {
    const value = await plugin.home();
    assert(value.sections.some((section) => section.tracks?.length > 0), "首页没有可供验证的真实歌曲");
    return value;
  });
  const all = await checked("读取完整曲库与专辑", async () => {
    const value = await plugin.browse({ page: "all" });
    const tracks = value.sections.flatMap((section) => section.tracks || []);
    assert(tracks.length > 0);
    assert.equal(new Set(tracks.map((track) => track.id)).size, tracks.length, "曲库出现重复 ID");
    for (const track of tracks) {
      assert(track.name && track.album?.id && track.artists?.length > 0, "歌曲元数据不完整");
      assert(track.artists.some((artist) => /曾轶可|Yico|Yike/i.test(artist.name)), "混入其他歌手的歌曲");
    }
    return tracks;
  });
  report.tracks = all.length;
  report.albums = new Set(all.map((track) => track.album.id)).size;
  await writeFile(join(output, "catalog.json"), JSON.stringify(all, null, 2));
  const query = process.env.E2E_QUERY || "夜车";
  const target = all.find((track) => !track.unavailable && track.name.includes(query));
  assert(target, `没有找到可播的验证歌曲：${query}；可通过 E2E_QUERY 指定曲库中的歌曲`);
  report.song = { id: target.id, name: target.name, album: target.album.name };

  await checked("搜索与搜索建议指向同一首歌", async () => {
    const result = await plugin.search({ query, kind: "tracks", offset: 0 });
    assert(result.tracks.some((track) => track.id === target.id));
    const suggestions = await plugin.suggest({ query });
    assert(suggestions.some((value) => value.includes(query)));
  });
  await checked("专辑和艺人页包含验证歌曲", async () => {
    const album = await plugin.album({ id: target.album.id });
    assert(album.tracks.some((track) => track.id === target.id));
    const artist = await plugin.artist({ id: target.artists[0].id });
    assert(artist.albums.some((album) => album.id === target.album.id));
  });
  await checked("收藏和最近播放经过落盘后仍可恢复", async () => {
    await plugin.like({ id: target.id, on: true });
    await plugin.played({ id: target.id });
    await persist();
    storage = JSON.parse(await readFile(storageFile, "utf8"));
    plugin = await import(`${entry}?reloaded=${stamp}`);
    assert((await plugin.liked({ offset: 0 })).tracks.some((track) => track.id === target.id));
    assert.equal((await plugin.isLiked({ ids: [target.id] }))[target.id], true);
    assert.equal((await plugin.recent())[0].id, target.id);
    await plugin.like({ id: target.id, on: false });
    assert.equal((await plugin.isLiked({ ids: [target.id] }))[target.id], false);
  });
  if (plugin.stations && plugin.stationNext) {
    await checked("随机播放返回真实曲库中的歌曲", async () => {
      const [station] = await plugin.stations();
      assert(station);
      const tracks = await plugin.stationNext({ id: station.id });
      assert(tracks.length > 0 && tracks.every((track) => all.some((item) => item.id === track.id)));
    });
  }
  const lyrics = await plugin.lyrics({ id: target.id });
  report.lyrics = { timed: Boolean(lyrics.lines?.length || /\[\d+:\d+/.test(lyrics.lrc || "")) };
  await persist();

  report.requestedQuality = requestedQuality;
  await checked("下载真实歌曲并验证高品质音轨", async () => {
    report.audio = await decodeTrack(plugin, target, requestedQuality);
    if (target.id === "340376" && requestedQuality !== "standard") {
      assert(report.audio.bitrate >= 319000, "《夜车》高品质请求仍返回低于 320 kbps 的音频");
    }
  });
  const official = await checked("官方版本拥有单独入口并保留原专辑版本", async () => {
    const page = await plugin.browse({ page: "official" });
    const tracks = page.sections.flatMap((section) => section.tracks || []);
    assert(tracks.length >= 22, "官方现场／重录曲库缺少条目");
    assert(tracks.every((track) => track.id.startsWith("bili:") && /官方|Official/.test(track.name)), "官方版本缺少独立 ID 或标签");
    assert(tracks.every((track) => all.some((value) => value.id === track.id)), "全部歌曲页没有收录官方版本");
    const original = all.find((track) => track.id === "530986063");
    assert(original && original.name === "私奔" && original.url.includes("music.163.com"), "原版《私奔》被自动替换");
    const results = await plugin.search({ query: "私奔", kind: "tracks", offset: 0 });
    assert(results.tracks.some((track) => track.id === original.id));
    assert(results.tracks.some((track) => track.id.startsWith("bili:") && /现场|Live/.test(track.name)));
    assert(results.tracks.some((track) => track.id.startsWith("bili:") && /重录|Re-recording/.test(track.name)));
    for (const track of tracks) {
      const album = await plugin.album({ id: track.album.id });
      assert(album.tracks.some((value) => value.id === track.id));
    }
    return tracks;
  });
  report.officialTracks = official.length;
  await checked("两种曲源的收藏和最近播放可以同时恢复", async () => {
    await plugin.like({ id: target.id, on: true });
    await plugin.like({ id: official[0].id, on: true });
    await plugin.played({ id: official[0].id });
    await persist();
    storage = JSON.parse(await readFile(storageFile, "utf8"));
    plugin = await import(`${entry}?bothSources=${stamp}`);
    const liked = await plugin.liked({ offset: 0 });
    assert(liked.tracks.some((track) => track.id === target.id));
    assert(liked.tracks.some((track) => track.id === official[0].id));
    assert.equal((await plugin.recent())[0].id, official[0].id);
    assert.deepEqual(await plugin.lyrics({ id: official[0].id }), {}, "给官方新版本错误套用了原版歌词");
  });
  const byAlbum = [...new Set(official.map((track) => track.album.id))];
  const selected = process.env.E2E_ALL_OFFICIAL === "1" ? official : byAlbum.map((id) => official.find((track) => track.album.id === id && track.name.includes("私奔")) || official.find((track) => track.album.id === id));
  report.officialAudit = process.env.E2E_ALL_OFFICIAL === "1" ? "every official track" : "one full track per official collection";
  await checked("官方投稿通过真实播放地址和完整音轨解码", async () => {
    for (const track of selected) await decodeTrack(plugin, track, "high");
  });
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await persist();
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
  await writeFile(join(output, "journey.json"), JSON.stringify(journey, null, 2));
  console.log(JSON.stringify({ status: report.status, tracks: report.tracks, albums: report.albums, artifact: output, error: report.error?.message }, null, 2));
}
