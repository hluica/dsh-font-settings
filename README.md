# @local/dsh-font-settings — 字体

最后实质性修改于Harness版本：0.2.1-rc.2

从**系统已安装的字体**里为正文字体、代码字体、终端字体各排一条**多字体回退栈**，用来替换 DeepSeek Harness 内置的纯文本字体输入框。设置 → **通用** 中：

- **字号大小**（保留内置三档字号：字号大小 / 代码字号 / 终端字号，展开按钮改名为「更多字号」）
- **字体**（新增一行：折叠时只显示「默认 / 已自定义」，展开后平铺三个字体栈）

插件页显示名「字体」来自 `locale/*.json` 的 `meta.title`，与包名、条目 id 都无关。

---

## 使用

1. 打开 **设置 → 通用**。
2. 「字号大小」行与从前一致：顶层改正文号，展开改代码字号、终端字号。
3. 「字体」行展开后是三段：**正文字体 / 代码字体 / 终端字体**。
   - **+ 添加字体** 打开可搜索的系统字体列表；
   - 每个已选字体可上移、下移、移除，最多 6 个，按从上到下回退；
   - 「恢复默认」清空该段 = 回到内置字体栈；
   - 已选但系统里找不到的字体标 `!`（悬停有说明）。
4. 选择**立即生效**，不需要刷新：写入的是 `ui-theme` 设置命名空间，内置主题呈现器把它应用到 `body`。

可选项来自 **Local Font Access API**（`window.queryLocalFonts()`）。环境不支持或被拒绝时退化为内置常用字体清单，菜单里会说明原因。

## 架构：只做前端，后端交给内置插件

字体后端由 `@deepseek-ai/dsh-client-ui-theme` 拥有：

```
ui-theme 设置命名空间（Host Config，全部 volatile）
  textFontFamily / codeFontFamily / terminalFontFamily
  fontSize / codeFontSize / terminalFontSize
        │
        ├─ Host 半：每次 index 渲染注入 body 引导脚本 ── 首帧即正确
        ├─ Client 主题服务：adopt() → publish() → theme/change
        └─ ui-layout 呈现器：写到 body 的 --dsh-font-family-* / --dsh-*-font-size
```

本插件**不拥有设置命名空间，也不注入首屏样式**；`index.js` 只保留一个空壳 Config，不做任何接线。字体字段、首屏引导与终端字体都由内置 Host 半和主题服务负责，因此本插件不做 token 覆盖，也不注册 `@font-face` 别名，避免与内置字段竞争。

写入路径：

```js
ctx.configForms.get('ui-theme').set('textFontFamily', '"Iosevka", "PingFang SC"')
  → settings.mutate（只校验字段是 volatile）
  → ThemeRuntime.adopt() → theme/change → 呈现器即时应用
```

字号走公开的 `ctx.theme.setFontSize(role, px)`。

## 遮蔽：整行替换，而不是隐藏子项

内置的「字号」行（`settings.general.item` 的 cell id `font-size`）展开后是：

```
字号大小
  正文字体 / 代码字体 / 代码字号 / 终端字体 / 终端字号
```

三个字体行是组内**硬编码 JSX，不是槽位**，无法单独遮蔽。因此本插件以**同一个 cell id、`priority: -1`** 注册自己的行：

- list 槽位按 `id` 分 cell，**同 id 同 priority 会抛错**，**priority 最小者渲染**；
- 内置行仍然注册着（`priority: 0`），只是 `active: false`，被遮蔽；
- 本插件只重绘三条字号行（顶层字号大小 + 展开里的代码字号/终端字号），字体选择由本插件的「字体」行承担；
- 卸载插件后内置行自动回到前台，**无需清理**。

## 结构

| 文件 | 作用 |
| --- | --- |
| `index.js` | Host 半：空壳 Config，不做任何接线 |
| `client.js` | Client 半：遮蔽 `font-size`、新增 `font`、三角色平铺多字体栈、系统字体枚举与搜索菜单 |
| `cordis.patch.yml` | bundle 挂载声明 |
| `locale/zh.json`、`locale/en.json` | 插件页面的显示名与说明 |
| `icon.svg` | 插件页面图标 |
| `package.json` | `exports["./client"]` + `exports["./locale/*.json"]` + `dsh.client` + `dsh.bundle` + 构建脚本 |
| `deps.lock.json` | 运行期依赖锁定（Host 半导入 schemastery 用） |
| `scripts/`、`node_modules/`、`.cache/` | 依赖物化与构建校验 |

## 依赖与构建

Host 半 `import z from '@deepseek-ai/schemastery'`，而 profile 不提供这个包，所以插件自带一份真实文件（不是符号连接）。`node_modules/` 是**产物**，由 `npm run build` 从 `deps.lock.json` 生成。

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 物化依赖，然后 `verify` |
| `npm run verify` | 布局/依赖/清单/解析 + **Host、Client、上游漂移**三类契约 |
| `npm run rebuild` | 即 `build --force` |
| `npm run clean` | 删除 `node_modules/` 与 `.cache/` |

`verify` 除了既有的依赖逐字节校验、清单契约、真实文件不变量，还会：

- 在**全新进程**里导入 Host 半，断言它**不**注册 settings、**不**监听 `index-inject`；
- 在 Node 的 `vm` 里执行 **Client 半**（桩掉 React / DOM / 图标），断言：
  - 两行注册参数：`font-size` @ `order 11, priority -1`，`font` @ `order 11.25`；
  - 写入落在 `ui-theme`，**没有** token override，启动时**不写设置**；
  - 序列化/解析与内置 `normalizeFontFamily` 同规则（引号、通用族、6 个上限、往返）。
- 读取本机安装的 `ui-theme` bundle，断言 **role 列表、字号范围、字段名、组内行顺序**仍与插件镜像一致。**上游改结构时构建期就会失败**，并提示要复核哪一段。

`scripts/host-contract.mjs` 是本插件自己的文件（不随参考副本同步）；`build.mjs`、`verify.mjs`、`lib/*` 仍是参考副本的逐字节副本。本机没有 DSH 安装时，漂移检查会跳过并在报告里注明。

## 故障排查

### 设置里看不到「字体」行 / 只看到内置文本框

1. 确认插件已安装：`@local/dsh-font-settings` 在 profile 的 `bundles` 里，且 `node_modules/@local/dsh-font-settings` 是指向本目录的 `link:`。
2. `npm run verify`，看 Client 契约与槽位参数是否通过。
3. 客户端半由模块加载器热重载；若只改了 `client.js` 仍看不到，刷新页面。

### 设置里改字体没反应

- 打开开发者工具看 `theme/change` 后 `body` 上是否出现 `--dsh-font-family-text` 等变量；
- 确认 `~/.dsh/profiles/desktop/cordis.patch.yml` 的 `ui-theme` 条目下出现了 `textFontFamily` / `codeFontFamily` / `terminalFontFamily`；
- 内置「字号」行仍在数据层可用，插件只是遮蔽了它的字体输入框。

### 插件列表显示「已启用」但状态不是「运行中」

Host 半导入失败时就是这个表现（`fiberPhase: null`），最常见原因是运行期依赖缺失或被改坏：

```bash
cd <插件目录>
npm run verify
npm run build      # 按 deps.lock.json 重新物化依赖
```

**关键**：Node 会永久缓存「导入失败」的结果，修好后**必须重启 Host**。

## 已知限制

- 只作用于 **Web 客户端界面**；终端字体由内置 xterm 消费 `terminalFontFamily`，插件不额外接管。
- 系统字体枚举依赖 **Local Font Access API**；不可用时只显示内置常用清单。
- 每个角色最多 **6 个**字体；空值 = 使用内置字体栈。
- 三个字体字段的类型是普通字符串，**不做**服务端白名单校验；插件在写入前按内置规则规范化（去引号/反斜杠/尖括号/控制字符、非通用族加引号）。
- 遮蔽依赖内置组的结构（三条字号 + 三个字体行）。`npm run verify` 的上游漂移检查会在升级后第一时间报警。

## 运行期版本契约

`peerDependencies` 声明 `@deepseek-ai/dsh: ^0.2.1-rc.2`。DSH 的版本闸门用 `semver.satisfies(runtime, range, { includePrerelease: true })`；不满足时会跳过该 bundle。未来大版本变化时按插件页提示用 `dsh plugin allow-version` 开豁免。
