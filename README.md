# 曾轶可 · MyGo Music 插件

在 MyGo Music 中浏览、搜索和收听曾轶可。参照 [mygo-lizhi](https://github.com/djyde/mygo-lizhi) 的使用方式，接入网易云音乐的曾轶可曲库（歌手 ID `10750`），并单独收录她本人 B站账号发布的现场与重录，无需另外运行服务。

## 安装

需要 MyGo Music **0.1.21 或更新版本**，用于播放 B站的 DASH AAC 音轨。

1. 打开 **设置 → 插件 → + → GitHub**。
2. 填入 `KingPuiWong/mygo-YicoTseng`，确认安装。
3. 在音源选择器中选择 **曾轶可**；英文界面显示 **Yico Tseng**。

已有旧版本时，在设置的插件页面检查更新，或下载新版安装包更新。0.2.0 新增 B站 API、音频和封面的网络访问范围，MyGo 更新时会展示这项变化。

也可以使用 [安装链接](mygo-music://install-plugin?repo=KingPuiWong/mygo-YicoTseng)，或在 [Releases](https://github.com/KingPuiWong/mygo-YicoTseng/releases) 下载 `plugin.zip` 后从本地安装。

## 功能

- 每天更新的 30 首推荐，优先选择曲源标记可直接播放的歌曲。
- 专辑、全部歌曲、艺人页。
- 单独的「官方现场／重录」入口，歌名清楚标注版本。
- 歌名和专辑搜索，以及搜索建议。
- 本机收藏、最近播放、随机播放。
- 专辑封面与按歌曲 ID 匹配的滚动歌词。
- 中文和英文界面。

## 曲源与播放范围

歌曲、封面和歌词来自音乐平台，仓库不包含歌曲文件。2026-11-09 的实测曲库包含 **200 个网易云歌曲条目＋36 个官方现场／重录条目，共 236 个条目、69 个专辑条目**；数量包含同名歌曲的不同版本，会随上游变化。

网易云播放遵循 MyGo 的音质设置：标准请求 128 kbps，高品质优先 320 kbps，无损设置请求上游当前可供的最高音质，显示值以实际返回的格式和码率为准。本次匿名核验中有 121 个条目返回非试听地址，其中 111 个可取得约 320 kbps MP3；请求无损时没有取得 FLAC。需要会员、购买、仅提供试听或受地区限制的原版仍会提示不可播放。

官方 B站部分来自 [曾轶可本人账号](https://space.bilibili.com/472832454)，收录 **8 条新春现场、15 条《2022》录音室重录、13 条 Candle Live 精选**。每个条目都有独立 ID、原始投稿链接和版本标签。串烧保留组合歌名，不拆成虚构的单曲。播放时取得当前可公开访问的最高 AAC 音轨，本次实测约 64–320 kbps；这些格式属于有损音频，清晰度也受原投稿影响。

搜索会同时展示原版和可用的官方版本，优先排列标记可播的条目。原专辑版本、现场和重录分别收藏、分别记录播放；新版本不会接用原版的滚动歌词。该方案补充免费可选版本，仍不保证所有原专辑歌曲均可免费播放。

收藏和最近播放仅存在本机，不同步到音乐平台账号，旧版收藏的 ID 保留。网易云曲库缓存 24 小时，刷新失败时使用旧缓存；单独的官方版本页面使用随插件发布的目录，可以独立打开。临时播放地址在点击播放时重新获取。

## 如何工作

`plugin.json` 声明插件信息和网络范围，`index.js` 实现 [MyGo 插件接口](https://github.com/egoist/mygo-music#plugins)。歌手接口分页读取曲库，专辑页由这些歌曲的专辑信息组成，因此合辑只展示曾轶可参与的歌曲。实现说明见 [docs/architecture.md](docs/architecture.md)。

与李志版的差别在曲源：李志版读取 GitHub 音频目录；本插件读取音乐平台的歌手曲库和即时播放地址。`official-videos.json` 记录经本人账号核验的官方投稿，已内嵌到插件入口，安装时无需生成。代码独立编写，李志版仅作功能参考。

## 开发与验证

插件本身没有依赖和编译步骤。运行端到端验证需要 Node.js 22+、FFmpeg 和 ffprobe：

```sh
npm run e2e
```

脚本访问真实曲源，验证高品质《夜车》、搜索、版本标签、两种来源的收藏恢复，并完整下载解码各官方合集的代表曲目。对全部官方条目逐一验证：

```sh
E2E_ALL_OFFICIAL=1 npm run e2e
```

每次在 `artifacts/e2e/<时间>/` 生成报告、曲库快照、音频文件、音频格式信息和解码日志；这些运行文件不会提交到 Git。0.2.0 的已执行结果包含 36 个官方条目全部完整解码，以及《夜车》320 kbps 的完整解码。

故障清单和验证边界见 [docs/verification.md](docs/verification.md)，已执行的结果见 [docs/verification-result.json](docs/verification-result.json)。该结果覆盖插件接口到音频解码，原生 MyGo 窗口和音频设备未由脚本验证。也可以在 GitHub Actions 中手动运行 **End-to-end playback**，下载不含音频文件的验证报告。

打包安装文件：

```sh
python3 scripts/package.py
```

输出为 `artifacts/plugin.zip`，可从 MyGo 本地安装。标准库脚本会验证入口和翻译文件，并生成包的 SHA-256。

维护官方目录时，可运行 `python3 scripts/sync-official-catalog.py` 重新读取原始投稿，核验发布账号并更新 `official-videos.json` 和入口中的内嵌目录。更新后重新执行端到端验证。

## 参考与许可

- [djyde/mygo-lizhi](https://github.com/djyde/mygo-lizhi)：功能与体验参考，未复制其实现。
- [egoist/mygo-music](https://github.com/egoist/mygo-music)：插件接口与宿主。
- [网易云音乐 · 曾轶可](https://music.163.com/#/artist?id=10750)：曲库来源。

代码使用 MIT 许可证。音频、封面和歌词的权利由各自权利人持有。音乐平台接口发生变化时，插件可能需要更新。
