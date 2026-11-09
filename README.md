# 曾轶可 · MyGo Music 插件

参照 [mygo-lizhi](https://github.com/djyde/mygo-lizhi) 的使用方式，为曾轶可整理一个独立的 MyGo Music 音源。

当前正在接入曲源。拿到音频仓库或链接后，才会确定曲库数量、可播范围及安装包；本仓库目前不包含歌曲文件。

## 第一版功能

- 首页推荐、专辑和全部歌曲。
- 按歌名、专辑搜索。
- 本机收藏和最近播放。
- 随机播放。
- 根据曲源提供封面和歌词。

## 代码与音频的关系

插件负责读取歌曲元数据，向 MyGo 返回页面和播放地址。音频仍从所配置的曲源读取。

正式实现会遵循 [MyGo 插件接口](https://github.com/egoist/mygo-music#plugins)，采用 `plugin.json` 和 JavaScript 文件，避免额外服务和编译步骤。

## 开发与验证

只使用端到端验证。故障清单和工件要求见 [docs/verification.md](docs/verification.md)。

## 参考

- [djyde/mygo-lizhi](https://github.com/djyde/mygo-lizhi)：功能和体验参考。未复制其实现。
- [egoist/mygo-music](https://github.com/egoist/mygo-music)：插件接口与宿主。

代码使用 MIT 许可证。音频、封面和歌词的权利由各自权利人持有。
