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

  await checked("下载真实歌曲并完整解码音轨", async () => {
    const stream = await plugin.stream({ id: target.id, quality: "standard" });
    assert(["mp3", "flac", "ogg", "wav", "m4a", "aac"].includes(stream.type));
    const response = await fetch(stream.url, { headers: stream.headers || {}, signal: AbortSignal.timeout(120000) });
    assert(response.ok, `音频 HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert(bytes.length > 1024, "音频响应内容太短");
    const audio = join(output, `audio.${stream.type}`);
    await writeFile(audio, bytes);
    const probeText = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,format_name:stream=codec_name,sample_rate,channels", "-of", "json", audio], { encoding: "utf8" });
    const probe = JSON.parse(probeText);
    await writeFile(join(output, "ffprobe.json"), probeText);
    assert(probe.streams.some((stream) => stream.sample_rate), "没有可解码音轨");
    const decoded = execFileSync("ffmpeg", ["-v", "error", "-i", audio, "-map", "0:a:0", "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    await writeFile(join(output, "decode.log"), decoded || "音轨完整解码成功；FFmpeg 无错误输出。\n");
    report.audio = { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), seconds: Number(probe.format.duration), type: stream.type, host: new URL(stream.url).hostname };
    assert(report.audio.seconds > 10);
    if (target.duration > 0) assert(report.audio.seconds * 1000 >= target.duration - 5000, "实际音频短于歌曲时长，可能是试听片段");
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
