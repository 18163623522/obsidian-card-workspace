# Card Workspace

[English](README.md)

Card Workspace 是一款运行在**左侧边栏**的 [Obsidian](https://obsidian.md/) 插件。它把文件夹、标签、属性、出链、反链与卡片盒汇集成编辑器旁一条可读的卡片流。找到上下文，整理成视角，再把有用的内容带回正在写的笔记。

每张 Markdown 卡片都有标题和去除格式后的摘要，不必把一组笔记压缩成一串文件名。它不是 Obsidian Canvas，拖动卡片也不会改变仓库结构。点击卡片会打开笔记；Markdown 和其他受支持的文件仍留在原来的文件夹。

使用文档：[card-workspace](https://kenanlian.github.io/card-workspace/zh/)。

![Card Workspace 演示](screenshots/2026_09_22_19_36_27.jpg)

## 目录

- [为什么选择 Card Workspace](#为什么选择-card-workspace)
- [安装](#安装)
- [快速开始](#快速开始)
- [功能特性](#功能特性)
- [兼容性与限制](#兼容性与限制)
- [隐私](#隐私)
- [开发](#开发)
- [发布](#发布)
- [支持与许可证](#支持与许可证)

## 为什么选择 Card Workspace

Card Workspace 适合一边写作、一边扫读和收集笔记的人：研究主题、长期项目、阅读清单，以及任何跨越文件夹的工作。它提供直接操作，不引入另一套查询语言。

- **汇集** — 浏览文件夹，按需包含子文件夹，再用标签和 frontmatter 属性收窄卡片流；也可以沿笔记的出链和反链寻找。
- **整理** — 排序、分组、置顶，再把有用的视角保存成卡片盒。
- **重构** — 在编辑器旁打开上下文，或把 Markdown 卡片拖入正在写的笔记。

## 安装

Card Workspace 可以从 Obsidian 第三方插件市场安装，也可以从 GitHub Releases 手动安装某个特定版本。

### 从插件市场安装

1. 打开 Obsidian 的 **设置 → 第三方插件**。
2. 如已开启安全模式，请先关闭。
3. 点击 **浏览**，搜索 **Card Workspace**。
4. 依次点击 **安装** 和 **启用**。

插件的[市场页面](https://community.obsidian.md/plugins/card-workspace)也可以把安装操作交回 Obsidian。

### 从 GitHub Releases 安装

需要使用当前市场版本以外的版本时，采用这种方式。

1. 从 [Releases](https://github.com/kenanlian/obsidian-card-workspace/releases) 页面下载对应版本。
2. 解压 `main.js`、`manifest.json` 和 `styles.css`，复制到仓库目录 `.obsidian/plugins/card-workspace/` 中。
3. 打开 **设置 → 第三方插件**。
4. 如有需要，关闭安全模式。
5. 在已安装插件列表中启用 **Card Workspace**。

## 快速开始

1. 点击 ribbon 图标，或从命令面板运行 **打开 Card Workspace 视图**。面板会在**左侧边栏**打开。
2. 在导航栏中选择一个文件夹，再用标签或属性值继续收窄；也可以把来源切换到卡片盒，或从正在阅读的笔记进入它的出链或反链。
3. 浏览卡片流；用搜索、排序、分组或置顶整理视角，再点击卡片打开笔记。
4. 右键导航条目或卡片可使用更多操作。把 Markdown 卡片拖入已打开的编辑器，可以插入链接或内容。

Card Workspace 会恢复上次浏览的**文件夹**；如果是库根目录，则恢复整个仓库。它不会重新打开上次的卡片盒或双链来源。

## 功能特性

- **导航栏。** 卡片流旁边是一栏宽度可调的导航栏，文件夹、标签、属性、卡片盒和收藏都只需一次点击。可以拖动分隔条调整宽度，或把导航栏收起来，让卡片占满整个宽度。当侧边栏宽度不足以容纳两栏时，布局会自动降为单栏，标题栏的切换按钮会在导航栏和卡片流之间切换。
- **文件夹浏览。** 选择一个文件夹，按需包含子文件夹，再用标签和 frontmatter 属性收窄卡片流。这些浏览筛选只作用于文件夹来源；进入卡片盒或双链视图时会暂停，并显示筛选已暂停的提示，回到文件夹后自动恢复。
- **卡片盒。** 把当前的文件夹、标签和属性视角保存成可复用的集合，它会持续收集符合规则的笔记。也可以手动加入或排除单篇笔记，并为每个盒子保留独立的排序、分组和置顶。源文件仍留在原处。双链视图可以保存为固定快照。
- **双链。** 围绕当前笔记切换出链与反链。可以跟随编辑器，也可以固定来源后继续查看其他笔记。
- **本地全文搜索。** 在当前文件夹、卡片盒、出链或反链中搜索。它针对连续中文文本做了专门优化，也支持中英文混合查询；Markdown 摘要会高亮命中内容，并显示每篇笔记的命中数。
- **整理卡片流。** 按编辑时间、创建时间或文件名排序，并对卡片分组。置顶让需要的笔记留在顶部；置顶只重排已经符合当前筛选和搜索的卡片。
- **拖入编辑器。** 把 Markdown 卡片拖到光标处，可插入 wikilink、嵌入、正文，或「标题 + 正文」。既可以每次选择，也可以设置默认方式。
- **可选图片预览。** 在插件设置中选择右侧缩略图或标题下方内联图片，并选择完整显示或裁切铺满。正文中的本地 PNG、JPEG、WebP、BMP 图片在浏览区域附近按需加载，缩略图跨重启缓存，默认关闭。详见[图片预览说明](docs/card-images.md)。
- **批量操作。** 点击选择单张卡片，Shift+点击连续选择，或全选当前视角。随后可移动笔记、添加或移除标签、加入或移出卡片盒、通过实时预览合并 Markdown 笔记，或删除所选内容。
- **收藏。** 可把常用的文件夹、文件、标签和卡片盒放进同一区域，不同类型可混排，顺序由拖拽决定。
- **右键菜单。** 在导航栏或卡片上右键即可新建笔记、文件夹、白板和 Base，重命名、复制、移动、删除，复制仓库路径或系统路径，在系统文件管理器中定位，以及在指定文件夹内搜索。确认后重命名或删除标签时，会同步更新笔记、当前筛选、收藏和卡片盒规则。
- **按习惯预览或打开。** 可以悬停预览笔记，也可以在当前标签页、新标签页、分栏或新窗口中打开。点击卡片打开笔记；在编辑器中切换笔记时，对应卡片也会被选中。
- **虚拟化滚动。** 只渲染当前可见的卡片，大型来源依然可以扫读。

## 兼容性与限制

- **仅支持桌面端。** Card Workspace 不在移动端运行。
- **左侧边栏。** 从 ribbon 图标或命令面板打开。
- **Obsidian 版本要求。** 需要 Obsidian 1.9.0 或更高版本，因为卡片对 Bases 的支持依赖该版本。实际行为和兼容性以 `manifest.json` 中声明的内容为准。
- **受支持的文件。** Markdown（`.md`）卡片有完整预览和全文索引。Bases（`.base`）、Canvas（`.canvas`）和 Excalidraw（`.excalidraw` 与 `.excalidraw.md`）使用标题和占位内容，只按标题搜索。

## 隐私

所有处理都在你的本地仓库内完成。该插件不会发起外部网络请求。文件操作通过 Obsidian 本地的 Vault 和 FileManager API 完成。随插件打包的搜索引擎把本地索引存在 IndexedDB 中。笔记仍留在原有文件夹。

## 开发

```bash
npm install
npm run build
```

如需启用 watch 模式：

```bash
npm run dev
```

运行类型检查和测试：

```bash
npm run check
npm test
```

## 发布

此仓库通过 `.github/workflows/release.yml`，基于纯 semver 标签自动创建 GitHub Draft Release。

1. 从 `manifest.json` 中确定目标版本：

   ```bash
   TAG=$(node -p "require('./manifest.json').version")
   ```

2. 同步发布元数据：

   ```bash
   npm run release:prepare -- "$TAG"
   ```

   如果还需要同时提升最低支持的 Obsidian 版本，可将它作为第二个参数传入：

   ```bash
   npm run release:prepare -- "$TAG" 1.9.0
   ```

3. 运行常规检查以及发布校验：

   ```bash
   npm run check:svelte
   npm run check
   npm run build
   npm test
   npm run release:check -- "$TAG"
   ```

4. 提交版本变更，然后创建并推送一个带注释的纯 semver 标签，该标签必须与 `manifest.json.version` 完全一致（例如 `<version>`，而不是 `v<version>`）：

   ```bash
   git tag -a "$TAG" -m "$TAG"
   git push origin main
   git push origin "$TAG"
   ```

5. 工作流会创建一个包含 `main.js`、`manifest.json` 和 `styles.css` 的 GitHub Draft Release。
6. 在 GitHub 上补充发布说明，并发布该 Draft Release。

## 支持与许可证

如果你遇到问题，请前往 [GitHub Issues](https://github.com/kenanlian/obsidian-card-workspace/issues) 提交 issue。

Card Workspace 采用 MIT License 发布。
