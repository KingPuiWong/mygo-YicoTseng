# 曾轶可 · MyGo Music 插件

在 MyGo Music 中浏览、搜索和收听曾轶可。参照 [mygo-lizhi](https://github.com/djyde/mygo-lizhi) 的使用方式，接入网易云音乐的曾轶可曲库（歌手 ID `10750`），无需另外运行服务。

## 安装

需要 MyGo Music 0.1.8 或更新版本。

1. 打开 **设置 → 插件 → + → GitHub**。
2. 填入 `KingPuiWong/mygo-YicoTseng`，确认安装。
3. 在音源选择器中选择 **曾轶可**；英文界面显示 **Yico Tseng**。

也可以使用 [安装链接](mygo-music://install-plugin?repo=KingPuiWong/mygo-YicoTseng)，或在 [Releases](https://github.com/KingPuiWong/mygo-YicoTseng/releases) 下载 `plugin.zip` 后从本地安装。

## 功能

- 每天更新的 30 首推荐，优先选择曲源标记可直接播放的歌曲。
- 专辑、全部歌曲、艺人页。
- 歌名和专辑搜索，以及搜索建议。
- 本机收藏、最近播放、随机播放。
- 专辑封面与按歌曲 ID 匹配的滚动歌词。
- 中文和英文界面。

## 曲源与播放范围

歌曲、封面和歌词直接来自网易云音乐，仓库不包含歌曲文件。2026-11-09 的实测曲库包含 **200 首歌曲、66 个专辑条目**；其中也包含单曲、现场版和合辑，数量会随上游更新。

第一版使用无需登录即可取得的 **128 kbps MP3**。需要会员、单独购买、仅提供试听或受地区限制的歌曲会提示不可播放；不会把试听片段当作完整歌曲。歌曲条目可以通过原始链接在网易云查看。

收藏和最近播放仅存在本机，不同步到网易云账号。曲库缓存 24 小时，刷新失败时使用上次成功的缓存。临时播放地址在点击播放时重新获取。

## 如何工作

`plugin.json` 声明插件信息和网络范围，`index.js` 实现 [MyGo 插件接口](https://github.com/egoist/mygo-music#plugins)。歌手接口分页读取曲库，专辑页由这些歌曲的专辑信息组成，因此合辑只展示曾轶可参与的歌曲。实现说明见 [docs/architecture.md](docs/architecture.md)。

与李志版的差别在曲源：李志版读取 GitHub 音频目录；本插件读取音乐平台的歌手曲库和即时播放地址。代码独立编写，李志版仅作功能参考。

## 开发与验证

插件本身没有依赖和编译步骤。运行端到端验证需要 Node.js 22+、FFmpeg 和 ffprobe：

```sh
npm run e2e
```

脚本访问真实曲源，完成浏览、搜索、收藏落盘及恢复，并下载《夜车》完整音频进行解码。每次在 `artifacts/e2e/<时间>/` 生成报告、曲库快照、音频文件、音频格式信息和解码日志；这些运行文件不会提交到 Git。

故障清单和验证边界见 [docs/verification.md](docs/verification.md)，已执行的结果见 [docs/verification-result.json](docs/verification-result.json)。该结果覆盖插件接口到音频解码，原生 MyGo 窗口和音频设备未由脚本验证。也可以在 GitHub Actions 中手动运行 **End-to-end playback**，下载不含音频文件的验证报告。

打包安装文件：

```sh
python3 scripts/package.py
```

输出为 `artifacts/plugin.zip`，可从 MyGo 本地安装。标准库脚本会验证入口和翻译文件，并生成包的 SHA-256。

## 参考与许可

- [djyde/mygo-lizhi](https://github.com/djyde/mygo-lizhi)：功能与体验参考，未复制其实现。
- [egoist/mygo-music](https://github.com/egoist/mygo-music)：插件接口与宿主。
- [网易云音乐 · 曾轶可](https://music.163.com/#/artist?id=10750)：曲库来源。

代码使用 MIT 许可证。音频、封面和歌词的权利由各自权利人持有。音乐平台接口发生变化时，插件可能需要更新。
