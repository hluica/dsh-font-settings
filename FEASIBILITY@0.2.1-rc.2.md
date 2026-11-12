# dsh-font-settings 适配 DSH 0.2.1-rc.2 —— 更新可行性与进路报告

- 目标插件：`@local/dsh-font-settings`，目录 `local-plugins/dsh-font-settings/`
- 目标：把插件重建在 0.2.1 内置字体后端之上；遮蔽内置字体 UI；正文 / 代码 / 终端三类字体各自支持多字体栈
- 报告日期：2026-10-17
- 探究对象：DSH `0.2.1-rc.2`（`app.asar → dsh/package.json`）；插件当前清单 `1.0.3`、peer `^0.2.0-rc.2`
- **结论：三条要求全部可行。唯一的"硬骨头"是遮蔽——三个字体设置不是独立槽位，必须连同父级"字号"行整行替换（`priority: -1`）并重绘两条字号行。**

> 本轮只做探究与报告，**未改动任何插件文件、未安装/卸载任何 bundle、未写入 profile**。本文件是本轮在工作区内唯一的新增物（源码抽取与验证脚本均在 `/tmp` 临时目录）。

---

> **后续更新（实现阶段，2026-10-17）**：按 §9 的决策完成实现，进路与报告一致，差异如下。
>
> | 决策点 | 结论 | 实现 |
> | --- | --- | --- |
> | 1 两个字号 | a | 顶层「字号大小」+ 展开里的「代码字号」「终端字号」全部保留并重绘 |
> | 2 按钮文案 | a | 面板里的展开按钮改为「更多字号 / More font sizes」 |
> | 3 旧配置迁移 | 不迁移 | Host 空壳 Config 接受 `sans`/`mono`，不使用 |
> | 4 展开密度 | b（平铺） | 展开「字体」后直接平铺三个字体栈，不再嵌套选择器 |
> | 5 多字体上限 | 6 | `MAX_FAMILIES = 6` |
> | 6 缺失字体标记 | 是 | 枚举状态为 `system` 时，未出现在列表中的已选项标 `!` |
> | 7 顶层状态 | 仅默认/已自定义 | 不显示数量或样例 |
> | 8 版本范围 | 收紧 | `peerDependencies: ^0.2.1-rc.2`，插件版本 `2.0.0` |
>
> **实现与报告的差异**：
>
> 1. **未使用 `whileServed`**。客户端半 `inject: ['slots','locale','theme','configForms']` 已是对 `theme` 服务的硬依赖；该服务由 ui-theme 提供，所以 ui-theme 必然被组装，`whileServed(['ui-theme'])` 是冗余守卫。写入仍走 `configForms.get('ui-theme')`。
> 2. **写入加了乐观覆盖层**。`configForms.set` 要等一次 Host 往返；为让点击即时出现，`FontRow` 在内存里暂存每个角色的新值，`set` 落定后撤掉覆盖层，由 `theme/change` 提供事实值。
> 3. **`theme.setFontFamily` 未使用**（与报告建议一致）。字号走公开的 `theme.setFontSize`；字体族走 `configForms`。
> 4. **`aliasCss` / `readToken` / `stackForList` / token override 全部删除**；Host 半从 165 行缩到 22 行。
> 5. **构建校验扩为三类**：Host 无副作用、Client 注册契约（Node `vm` 桩掉 React/DOM/图标）、上游 ui-theme 漂移（读 `app.asar` 比对 role 列表、字号范围、字段名、组内行顺序）。`npm run verify` 共 93 项（含依赖、清单、解析与本插件三类契约）全部通过。
> 6. **视觉与实时写入验证受限**：本机 GUI 需要鉴权（`http://127.0.0.1:51382/` 返回 401），按验证规范不获取凭据、不模拟渲染。已确认的是：插件已就地安装（`link:`）、Host 条目 `status: schema`、槽位为 `font-size`（priority −1 active / priority 0 inactive）与 `font`（order 11.25 active）。**设置里看到的实际渲染，以及一次字体选择是否即时生效，需要用户手动确认一次。**

---

---

## 1. 结论摘要

| 问题                               | 结论                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 内置字体设置在哪？                 | `ui-theme`。**UI 是 `settings.general.item` 里 id 为 `font-size` 的一行**（`FontSettingsGroup`），展开后含 3 个字号 + 3 个字体，共 6 行                |
| 它的后端是什么？                   | Host Config 命名空间 `ui-theme` 的 7 个 volatile 字段 + 首屏 `index-inject` + Client `theme` 服务 + `ui-layout` 呈现器                                 |
| 能复用吗？                         | **能，而且应当复用。** 写字体走 `configForms.get('ui-theme').set(field, value)`；写字号走公开的 `theme.setFontSize(role, px)`；读走 `theme.getTheme()` |
| 为什么不用 `theme.setFontFamily`？ | 它**在实现里存在、但不在服务契约里**（inspect 只列出 5 个方法）。可以直接调，但属于契约外私有面，不推荐作为主路径                                      |
| 三个字体设置是独立槽位吗？         | **不是。** 它们是 `FontSettingsGroup` 内硬编码的 JSX，没有任何槽位可单独遮蔽                                                                           |
| 那怎么遮蔽？                       | 复用 `settings.general.item` 的 **list 槽位 cell = id**：以 `id: 'font-size'`、`priority: -1` 注册自己的行，整行替换内置组，只重绘字号行               |
| 三条字号要重写吗？                 | 是。替换父行后，顶层的"字号大小"和展开后的"代码字号/终端字号"必须自己重绘（可逐字复用内置 CSS，视觉可做到一致）                                        |
| 新字体行放哪？                     | 新 id（建议 `font`），`order: 11.25`——字号 11 之下、用户 CSS 11.5 之上                                                                                 |
| 多字体可行吗？                     | **可行且几乎免费**：现成 `SansRow` 就是多字体栈控件（最多 6 个、可排序、可删除、带搜索菜单），把它参数化成三个角色即可                                 |
| 首屏还闪烁吗？                     | **不会，而且更好了**：内置 Host 半已在每次 index 渲染时把三个字体字段写进 `body` 的引导脚本。本插件**应删掉自己的首屏注入**                            |
| 终端字体？                         | 内置已是一等公民：`theme.fontFamilies.terminal` 直接喂给 xterm。旧插件的 `@font-face local()` 别名 hack 可以删掉                                       |
| 版本闸门会挡住吗？                 | **不会。** 闸门用 `semver.satisfies(runtime, range, { includePrerelease: true })`，`^0.2.0-rc.2` 对 `0.2.1-rc.2` 判定为满足（已用真实 semver 验证）    |
| 插件现在装了吗？                   | **没有。** profile 的 `bundles` 里已无它，只剩 `node_modules/@local/` 下一条悬空符号链接；`cordis.patch.yml` 里还留着 `ui-font` 的旧配置               |

### 1.1 三项要求逐条判定

| #   | 要求                                       | 判定                     | 关键事实                                                                                               |
| --- | ------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| 1   | 复用/基于内置后端，进一步优化              | ✅ 可行，且是唯一正确方向 | 写入 `ui-theme` 命名空间会经 `adopt() → publish() → theme/change` 实时生效；终端与首屏都被内置后端接管 |
| 2   | 遮蔽内置前端设置 UI，以本插件替代          | ✅ 可行                   | list 槽位按 `id` 分 cell；同 id 同 priority 会**抛错**，必须 `priority: -1`（低者胜）                  |
| 3   | 拆成正文字体/代码字体/终端字体，各项多字体 | ✅ 可行                   | 内置后端本来就是 `text`/`code`/`terminal` 三角色 + 三个字段；现成多字体控件可直接参数化                |

---

## 2. 探究方法与证据来源

全部结论基于**运行时自省 + 本机发行包源码逐行核对**，未使用猜测：

1. **运行时自省**：`cordis_inspect_list` / `cordis_inspect_query`，查询 Client `Slots.listSubTree`（`settings.general.item` 的活体 catalog、occupants、registration 选项）、Client `Service`（`theme` / `slots` 的精确契约与方法表）、`Theme.listTokens`、Host `Config.listConfigs`。
2. **发行包源码**：`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`。本轮写了一个最小 asar 读取器（按 pickle 头 + JSON 目录定位数据段），**只读、未解包、未改动**，把所需 bundle 抽到 `/tmp/dsh-021/` 后逐行阅读。
3. **既有同构插件**：`local-plugins/dsh-custom-css/`（已安装、已在本版本运行，其"摘要 + 展开"行是可直接照抄的当前版本范例）、`dsh-enhanced-prompt/`（Client 生命周期桩测试的先例）。
4. **参考报告**：`dsh-custom-css/FEASIBILITY@0.2.0-rc.2.md`（客户端样式注入与槽位遮蔽的既有结论）、`dsh-enhanced-prompt/FEASIBILITY@0.2.0-rc.2.md`（`priority` 语义与 slot 机制的既有结论）——两者均基于 0.2.0-rc.2，本轮已逐条复核其在 0.2.1-rc.2 是否仍成立，下文标注差异。
5. **版本闸门实测**：用 npm 自带 semver 复算 `0.2.1-rc.2` 对 `^0.2.0-rc.2`。
6. **Schemastery 行为实测**：用插件自带的 `@deepseek-ai/schemastery` 验证"未声明字段是否被拒"。

> 行号说明：下文 `ui-theme/lib/client.js:NNN` 指 0.2.1-rc.2 的构建产物（前端 shell 为 `index-CN7NIWNw.js`）。**行号会随每次发行变化，符号名与结构才是契约。**

---

## 3. 当前版本内置字体实现的源码级结论

### 3.1 数据后端：`ui-theme` 的 7 个 volatile 字段

Host 半 `@deepseek-ai/dsh-client-ui-theme/lib/index.js`：

```js
// :11
const THEME_SETTINGS_NAMESPACE = "ui-theme";
// :25
const FONT_ROLES = ["text", "code", "terminal"];
// :35
const FONT_SIZE_SPECS = {
  text:     { field: "fontSize",         variable: "--dsh-content-font-size",  min: 10, max: 22, default: 14 },
  code:     { field: "codeFontSize",     variable: "--dsh-code-font-size",     min: 10, max: 16, default: 11 },
  terminal: { field: "terminalFontSize", variable: "--dsh-terminal-font-size", min: 10, max: 20, default: 13 },
};
// :65
const FONT_FAMILY_FIELDS = { text: "textFontFamily", code: "codeFontFamily", terminal: "terminalFontFamily" };
// :187
const Config = z.object({
  preference: z.union([...]).default("system").volatile(),
  fontSize: ..., codeFontSize: ..., terminalFontSize: ...,
  textFontFamily: z.string().default("").volatile(),
  codeFontFamily: z.string().default("").volatile(),
  terminalFontFamily: z.string().default("").volatile(),
});
```

**要点**：字体角色天然就是三个，字段名就是 `textFontFamily` / `codeFontFamily` / `terminalFontFamily`。用户要求的"正文 / 代码 / 终端"不是我们发明的分类，而是**内置后端既有的分类**。

`normalizeFontFamily`（`index.js:122`，与 Client 半 `:1121` 同源）：

```js
value.split(",")
  .map(name => name.replace(/["'\\<>\u0000-\u001f\u007f]/gu, "").replace(/\s+/gu, " ").trim())
  .filter(name => name !== "")
  .map(name => GENERIC_FAMILIES.has(name.toLowerCase()) ? name : `"${name}"`)
  .join(", ");
```

即：逗号分隔、非通用族一律加双引号、丢弃会破坏 CSS/JSON 的字符。**这是写入值的规范形态**。

### 3.2 首屏：内置 Host 半已经做了本插件 Host 半当年做的事

`index.js:145-183` 生成一段 **body 引导脚本**，`:204` 在 `webserver/index-inject` 上以 `{ prepend: true }` push：

```js
const sizes = FONT_ROLES.map(role =>
  `document.body.style.setProperty(${JSON.stringify(FONT_SIZE_SPECS[role].variable)}, ${JSON.stringify(`${fontSizes[role]}px`)})`);
const families = FONT_ROLES.flatMap(kind => {
  const list = normalizeFontFamily(fontFamilies[kind]);
  return list === "" ? [] : [`document.body.style.setProperty(${JSON.stringify(fontFamilyVariable(kind))}, ${JSON.stringify(list)})`];
});
```

也就是说：**只要值写进 `ui-theme` 的字体字段，下一次 index 渲染的首帧就带着它**，并且是三个角色、统一处理。本插件现有的 `:root:root{…}` 首屏层因此**应当删除**——留着只会与内置打架（见 §4.2）。

### 3.3 CSS：字体变量如何被消费

`ui-theme/lib/client.js:1408` 的 base 表：

```css
body{
  --dsw-font-family: var(--dsh-font-family-text, <text 默认栈>), <text 默认栈>;
  --ds-font-family-code: var(--dsh-font-family-code, <code 默认栈>), <code 默认栈>;
}
```

- 正文：`--dsh-font-family-text` 插在默认栈**之前**。
- 代码：`--dsh-font-family-code` 同理。
- 终端：xterm 侧直接读快照——`dsh-client-ui-sidebar-terminal/lib/client.terminal.js:13392`：
  ```js
  fontFamily = terminalFontFamily(theme.fontFamilies.terminal)
  // terminalFontFamily(list) => list === "" ? TERMINAL_FONT_STACK : `${list}, ${TERMINAL_FONT_STACK}`
  ```
  终端**不需要任何 CSS 变量、也不需要 @font-face 别名**，它吃的是 theme 快照里的字段值。

实时应用在 `ui-layout/lib/client.js:525-527, :558`：

```js
const FONT_FAMILY_VARIABLES = { text: "--dsh-font-family-text", code: "--dsh-font-family-code", terminal: "--dsh-font-family-terminal" };
// apply(snapshot):
for (const [role, name] of Object.entries(FONT_SIZE_VARIABLES)) body.style.setProperty(name, `${snapshot.fontSizes[role]}px`);
for (const [kind, name] of Object.entries(FONT_FAMILY_VARIABLES)) {
  const list = snapshot.fontFamilies[kind];
  if (list === "") body.style.removeProperty(name); else body.style.setProperty(name, list);
}
// 注意：token 覆盖层在字体变量之后应用
for (const [name, value] of Object.entries(snapshot.active.tokens)) { body.style.setProperty(name, value); this.appliedTokens.push(name); }
```

**三个结论**：
1. 字体族是**直接写在 body 内联样式**上的，改设置 → `theme/change` → 立即生效，不需要刷新。
2. `snapshot.active.tokens`（即 `overrideTokens` 层）在字体变量**之后**应用。旧插件覆盖 `--dsw-font-family` 会拿到内联样式优先级，**压过 base 表的 `body` 组合规则**——这正是旧方案在新版本里会"悄悄废掉内置正文字体设置"的机制。
3. 终端角色已由内置接管，旧的 xterm 别名补丁是多余且可能重复生效的。

### 3.4 服务面：`theme` 的公开方法只有 5 个

`cordis_inspect_query`（Client `Service.listService`，service `theme`）返回：

| 方法                             | 是否在契约                                                  |
| -------------------------------- | ----------------------------------------------------------- |
| `getTheme(): ThemeSnapshot`      | ✅                                                           |
| `setTheme(id)`                   | ✅                                                           |
| `setFontSize(role, px)`          | ✅                                                           |
| `register(definition)`           | ✅                                                           |
| `overrideTokens(source, tokens)` | ✅                                                           |
| `setFontFamily(role, value)`     | ❌ **不在契约**（实现里存在：`ui-theme/lib/client.js:1769`） |
| `adjustFontSizes(delta)`         | ❌ 不在契约（快捷键内部用）                                  |

`ThemeSnapshot` 的形状（契约）：

```ts
export interface ThemeSnapshot {
  preference: ThemePreference;
  fontSizes: FontSizes;       // Record<FontRole, number>
  fontFamilies: FontFamilies; // Record<FontRole, string>
  active: ThemeDefinition;
  themes: readonly ThemeDefinition[];
  revision: number;
}
```

**判定**：字号走公开的 `setFontSize`；字体族走 `configForms.get('ui-theme').set(field, value)`。后者不是绕路——`ui-settings` 的 `ConfigForms.get(entryId)` 明确是"按 Host 插件条目取共享表单"，并另有一个 `whileServed(namespaces, register)`，其文档原文就是给**编辑另一个插件所拥有的命名空间**的页面用的。

### 3.5 写入为什么能实时生效：`adopt()` 订阅

`ui-theme/lib/client.js:1663-1685`：

```js
constructor(ctx, host) {
  ...
  ctx.effect(() => host.subscribe(() => { this.adopt(); }), "ui-theme: settings scope adoption");
  this.adopt();
}
adopt() {                       // :1788
  const section = this.host.getSnapshot().value;
  ...
  this.fontFamilies = durableFontFamilies(section);
  this.fontSizes = sectionFontSizes(section);
  this.publish();               // → ctx.emit("theme/change", snapshot)
}
```

`host` 就是 `ctx.configForms.get('ui-theme')`。所以**任何来源**对 `ui-theme` 命名空间的写入（包括本插件）都会走同一条 `adopt → publish → ui-layout.apply` 链路。这比直接调 `theme.setFontFamily` 更"公共"，效果等价。

### 3.6 UI 结构：一行展开成六行

`ui-theme/lib/client.js:2047-2073` 注册了两行：`appearance`（order 10）与 `font-size`（order 11）。后者渲染 `FontSettingsGroup`：

```js
function FontSettingsGroup({ setFontFamily, setFontSize, ...shared }) {   // :1321
  const [open, setOpen] = useState(false);
  return (
    <div className={group}>
      {size("text", { open, controls: regionId, onToggle: () => setOpen(v => !v) })}
      {open && (
        <div id={regionId}>
          {family("text")}      {/* 正文字体 */}
          {family("code")}      {/* 代码字体 */}
          {size("code")}        {/* 代码字号 */}
          {family("terminal")}  {/* 终端字体 */}
          {size("terminal")}    {/* 终端字号 */}
        </div>
      )}
    </div>
  );
}
```

结构图：

```
settings.general.item
└─ [id=font-size, order=11]  FontSettingsGroup
   ├─ FontSizeRow(text)                    ← 顶层：字号大小 + 展开按钮「更多字体设置」
   └─ 展开后：
      ├─ FontFamilyRow(text)     ← 正文字体   ┐
      ├─ FontFamilyRow(code)     ← 代码字体   ├ 三个待遮蔽项
      ├─ FontSizeRow(code)       ← 代码字号   │ 两个保留项
      ├─ FontFamilyRow(terminal) ← 终端字体   ┘
      └─ FontSizeRow(terminal)   ← 终端字号
```

**关键判定（决定了整份方案的形状）**：三个字体行是 `FontSettingsGroup` 内部的硬编码 JSX，**不是槽位**，没有 id、没有 key、没有可遮蔽的注册点。因此"只遮蔽三个字体行"在现有扩展面上做不到；**能遮蔽的最小单元是父行 `font-size`**。

### 3.7 它为什么"不如本插件"

`FontFamilyRow`（`:1182-1217`）的全部实现：

```js
<Input
  className={field}
  defaultValue={value}                       // 受控？不，是非受控 defaultValue
  placeholder={t("fontFamily.placeholder")}
  maxLength={200}
  onBlur={e => { e.currentTarget.value = normalizeFontFamily(e.currentTarget.value); setFontFamily(e.currentTarget.value); }}
  onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur(); }}
/>
```

即：**一个纯文本框**。没有系统字体枚举、没有预览、没有排序、没有候选择表、没有逐项删除；用户必须自己把字体族名拼成 `A, B, C`，拼错只会静默落回默认栈。这正是本插件可以稳定胜出的地方——而它**完全不必替换后端，只需要替换这一层 UI**。

### 3.8 槽位事实：list 的 cell = `id`，低 priority 者胜

`settings.general.item` 的活体 catalog（`Slots.listSubTree`）原文：

> `One preference row inside the General section — the additive seat for a single setting that needs no page of its own …`
>
> `id` — *Your cell key. Use an id of your own: a fresh id is added beside the shipped entries, while **reusing a shipped id puts you in THAT cell and replaces it**.*
>
> `replaceRisk: none`

当前占用者（order 升序）：

```
permission -20 | language 0 | appearance 10 | font-size 11 | custom-css 11.5
transcript-view 12 | developer-tools 15 | shortcuts 16 | link-opening 17
composer-enter 20 | performance-usage 30 | session-log-deepseek 90 | current-version 100
```

**注意**：0.2.0-rc.2 里的 `font-sans`（11.1）与 `font-mono`（11.2）**已经不存在**。它们被并进了 `font-size` 组。旧插件的两行如果原样重装，会变成两组重复的字体设置。

冲突规则（前端 shell 包内 `SlotCore` 的注册检查，实测反编译定位）：

```js
case "list": {
  if (options.id === undefined) throw new Error(`list slot "${name}" requires options.id`);
  const occupant = entries.find(m => m.options.id === id && (m.options.priority ?? 0) === priority);
  if (occupant) throw new Error(`list slot "${name}" already has an entry with id "${id}" ${occupantHint(occupant)}`);
  break;
}
```

以及 `entriesOfSlot` 的文档原文：

> *Project a key's entries to its shadowing winners: the first live (non-abdicated) entry of each cell **in priority order**.*

**结论**：
1. 同 id 同 priority → **抛错**，不是"后注册者胜"。
2. 同 id 不同 priority → 合法遮蔽，**priority 最小者渲染**。
3. 所以替换 `font-size` 必须写 `priority: -1`。新 id（`font`）用默认 `0` 即可。
4. `priority` 是公开条目选项（`StoredEntry.options` 里就有，occupants 也回显它），不是内部技巧。

---

## 4. 本插件现状：三个必须在重写中拆掉的旧机制

### 4.1 当前实现（`client.js` 989 行 / `index.js` 6626 字节）

| 机制                                                                | 位置                           | 现状                                                                                                           |
| ------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Host 设置命名空间 `ui-font`，字段 `sans`/`mono`                     | `index.js`                     | 自带 `@deepseek-ai/schemastery` 校验                                                                           |
| Host 首屏注入 `:root:root{--dsw-font-family;--ds-font-family-code}` | `index.js`                     | `webserver/index-inject` + `{ prepend: true }`                                                                 |
| Client 令牌覆盖层                                                   | `client.js:905`                | `ctx.theme.overrideTokens('@local/dsh-font-settings', { '--dsw-font-family': …, '--ds-font-family-code': … })` |
| Client 覆盖样式表 `:root:root`                                      | `client.js:874-906`            | 与令牌覆盖双保险                                                                                               |
| 终端 `@font-face local()` 别名                                      | `client.js:244, :903`          | 为 xterm 绕路                                                                                                  |
| 两行设置                                                            | `client.js:960-975`            | `font-sans`(11.1) / `font-mono`(11.2)                                                                          |
| 系统字体枚举                                                        | `client.js:795-833`            | `window.queryLocalFonts()`，失败回退 `FALLBACK_FAMILIES`                                                       |
| 多字体栈控件                                                        | `SansRow`，`client.js:517-713` | 最多 6 个、可上移/下移/删除、带搜索菜单、`Ag` 预览                                                             |

### 4.2 在 0.2.1 下的具体失效/冲突点

| #   | 冲突                       | 证据                                                                          | 后果                                                                                                         |
| --- | -------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | **行位置已变**             | `font-sans`/`font-mono` 已从槽位占用者中消失，字体行被并入 `font-size` 组     | 原样重装会出现"内置 6 行 + 插件 2 行"共 8 个字体/字号项，且顺序错乱                                          |
| 2   | **令牌覆盖会压过内置字段** | `ui-layout` 先写字体变量、后写 `snapshot.active.tokens`（同为 body 内联样式） | 插件的 `--dsw-font-family` 覆盖会让内置"正文字体"字段**完全失效**；`overrideTokens` 层与设置值成为两个事实源 |
| 3   | **终端别名已多余**         | 终端直接消费 `theme.fontFamilies.terminal`（`client.terminal.js:13392`）      | 旧的 `@font-face local()` 别名可能重复生效或指向错误字面，属于净负担                                         |
| 4   | **首屏注入与内置重复**     | 内置 `index.js:204` 已 prepend 写入三个字段                                   | 两套注入语义不同（`:root:root` vs `body.style`），优先级纠缠，升级即可能翻转                                 |
| 5   | **事实源分裂**             | 旧的 `ui-font.sans/mono` 与内置 `textFontFamily/…` 互不相干                   | 用户在一个地方选、另一个地方看不见；卸载插件后旧值成孤儿                                                     |

### 4.3 安装状态与版本闸门

profile 现状（`~/.dsh/profiles/desktop/package.json`）：

```json
"dependencies": {
  "@local/dsh-custom-css": "link:…/dsh-custom-css",
  "@local/dsh-enhanced-prompt": "link:…/dsh-enhanced-prompt",
  "dsh-whale-widget": "^0.4.2"
},
"dsh": { "profile": { "bundles": [
  "@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app",
  "@local/dsh-custom-css", "@local/dsh-enhanced-prompt", "dsh-whale-widget"
] } }
```

- **本插件已不在 `bundles`**，`node_modules/@local/dsh-font-settings` 只剩一条悬空链接。
- `cordis.patch.yml` 里仍有 `id: ui-font` 的旧配置（`sans: ""`、`mono: Maple Mono Normal NF CN`），以及 `id: ui-theme` 的现值（`fontSize: 16`、`codeFontFamily`/`terminalFontFamily` = `"Maple Mono Normal NF CN"`，`textFontFamily` 未设）。
- **重装时必须沿用 `link:` 就地安装**（与前一轮相同）。
- 版本闸门（`dsh-app-boot/lib/index.js:277`）：
  ```js
  function satisfies(runtimeVersion, range) {
    return range.trim() !== "" && semver.satisfies(runtimeVersion, range, { includePrerelease: true });
  }
  ```
  实测 `semver.satisfies('0.2.1-rc.2', '^0.2.0-rc.2', { includePrerelease: true }) === true`。**peer 不是阻塞项**，无需改；若想表达"只支持 0.2.1 起"，可改为 `^0.2.1-rc.2`，但不是必需。
- 旧 `ui-font` 配置**不会被新 schema 拒绝**：实测 schemastery `z.object({})` 对未声明键是**透传**（`{sans, mono}` 原样返回）。所以旧配置行可以安全保留成惰性数据，也可以清掉。

---

## 5. 目标形态

### 5.1 设置层级（用户要求）

```
设置 → 通用
├─ 外观                       (10)
├─ 字号大小                   (11)   ← 内置行，仅保留字号
│   └─ 展开「更多字号」
│      ├─ 代码字号
│      └─ 终端字号
├─ 字体                       (11.25) ← 本插件新行，顶层只显示"是否自定义"
│   └─ 展开
│      ├─ 正文字体   [Ag | 默认 / A › B]  [v]
│      ├─ 代码字体   [Ag | 默认 / A › B]  [v]
│      └─ 终端字体   [Ag | 默认 / A › B]  [v]
└─ 用户 CSS                   (11.5)
```

### 5.2 三个角色 → 三个内置字段

| 界面     | role       | 字段                 | CSS 变量                     | 消费方                                                |
| -------- | ---------- | -------------------- | ---------------------------- | ----------------------------------------------------- |
| 正文字体 | `text`     | `textFontFamily`     | `--dsh-font-family-text`     | `--dsw-font-family` 及整个字号阶梯                    |
| 代码字体 | `code`     | `codeFontFamily`     | `--dsh-font-family-code`     | `--ds-font-family-code`（代码块、行内代码、工具输出） |
| 终端字体 | `terminal` | `terminalFontFamily` | `--dsh-font-family-terminal` | xterm（直接读快照）                                   |

**说明**：用户说"两个字号设置保留原位"。内置组里字号共 **3** 个：顶层的 `text`，展开里的 `code` 与 `terminal`。据上下文，保留的是展开里的 `code` / `terminal` 两个，顶层 `text` 行本身也照旧（只是由我们重绘）。**这一点建议在动工前确认**（见 §9 决策点 1）。

---

## 6. 进路 A（推荐）：复用后端 + 整行遮蔽

### 6.1 后端复用：写 `ui-theme`，不写自己的命名空间

```
写（字体）  ctx.configForms.get('ui-theme').set('textFontFamily', '"Iosevka", "PingFang SC"')
            → settings.mutate → Host 落盘 cordis.patch.yml
            → ConfigForm 订阅 → ThemeRuntime.adopt() → publish() → theme/change
            → ui-layout.apply(): body.style.setProperty('--dsh-font-family-text', …)   ← 即时

写（字号）  ctx.theme.setFontSize('text', 16)   ← 公开契约，带范围校验

读          ctx.theme.getTheme().fontSizes / .fontFamilies   + 订阅 theme/change
```

为什么不用 `theme.setFontFamily`：

- 它**不在** `Service.listService` 返回的契约里（只有 5 个方法），属于实现细节；跨版本不保证。
- 对比之下 `configForms.get(entryId)` 与 `whileServed` 是**为跨命名空间编辑而明写的公共接口**（`ui-settings/lib/client.js` 的 `ConfigForms` 注释：*The shared mirror's read/fold face for cross-namespace surfaces*；`whileServed`：*A plugin whose page edits a namespace another plugin owns registers the page through this*）。
- 两者最终走同一条 `adopt()`，效果完全一致。

`whileServed` 的用法（保证 `ui-theme` 未被组装时本插件不留痕迹）：

```js
ctx.effect(() => ctx.configForms.whileServed(['ui-theme'], () => {
  // 注册「字体」行 + 遮蔽「font-size」行
  return () => { /* 注销 */ };
}), 'ui-font: rows follow the ui-theme namespace');
```

### 6.2 遮蔽：替换 `font-size` 行，只重绘字号

```js
// 遮蔽内置组（同 id、更低 priority）
ctx.slots.inject('settings.general.item', () =>
  ctx.slots.register(
    { name: 'settings.general.item', id: 'font-size', order: 11, priority: -1, locale: DICT_NS },
    FontSizeGroupOnly,
  ),
);

// 新增字体行
ctx.slots.inject('settings.general.item', () =>
  ctx.slots.register(
    { name: 'settings.general.item', id: 'font', order: 11.25, locale: DICT_NS },
    FontRow,
  ),
);
```

`FontSizeGroupOnly` 必须复刻内置组的**行为与外观**，但只渲染：

- 顶层：`字号大小`（text 字号步进器 + 展开按钮）；
- 展开后：`代码字号`、`终端字号`（顺序与内置一致）。

**视觉一致性怎么保证**：内置 `FontSizeRow` 的样式表很短（`.row/.rowText/.title/.desc/.control/.stepper/.value/.unit/.arrows/.arrow/.expander`，见 `ui-theme/lib/client.js:1134`）。把它整段复制成我们自己的类名前缀即可，颜色/圆角/字号全部用 `--dsw-*` 令牌，能做到像素级一致。展开按钮的 `aria-label`/`title` 用内置同一句 `fontSize.more`。

**范围常量**：`FONT_SIZE_SPECS` 未从包中导出（`ui-theme/lib/client.js` 的 exports 只有 `SETTINGS_NS`、`ThemeRuntime`、`apply`、`inject`）。步进器需要 min/max 才能在边界禁用箭头，因此按 §3.1 硬编码（10–22 / 10–16 / 10–20），并用构建期探针锁定（见 §8 风险 1）。

### 6.3 三个多字体选择器：把 `SansRow` 参数化

现有 `SansRow`（`client.js:517-713`）已经具备全部所需行为：

- 从系统字体里选（`queryLocalFonts`，失败回退内置清单）；
- 逗号分隔的有序字体栈，最多 `MAX_SANS_FAMILIES = 6`；
- 每个已选项可上移/下移/删除；
- `Ag` 预览用所选字体渲染；
- 摘要显示 `A › B › C`；
- 清空 = 写 `''` = 回落到内置栈。

改造点只有两个：

```js
// 1) 字段来源由组件参数决定
const write = (next) => deps.select(FIELD[role], serializeFamilies(next));

// 2) 写入落到 ui-theme，而不是自有命名空间
select: (field, value) => ctx.configForms.get('ui-theme').set(field, value)
```

序列化沿用现有 `serializeFamilies` / `quoteFamily`，与内置 `normalizeFontFamily` 同规则（非通用族加引号、丢弃破坏字符）。这样 UI 回显、Host 落盘、首屏注入三处的字符串形态一致，不会出现"选完再打开变成另一种写法"。

### 6.4 顶层"是否自定义"

照抄 `dsh-custom-css/client.js:224-311` 的"摘要 + 展开"形态：

```js
const custom = ROLES.some(role => families[role] !== '');
const summary = custom ? t('summary.customized') : t('summary.default');
// 行：标题「字体」 + 右侧按钮（chevron + 摘要文本）+ aria-expanded
// 展开：三个 FontRoleRow
```

建议文案（zh/en 各一套，随 `ctx.locale.register` 注册）：

| key                   | zh       | en            |
| --------------------- | -------- | ------------- |
| `row.title`           | 字体     | Fonts         |
| `summary.default`     | 默认     | Default       |
| `summary.customized`  | 已自定义 | Customized    |
| `role.text.title`     | 正文字体 | Text font     |
| `role.code.title`     | 代码字体 | Code font     |
| `role.terminal.title` | 终端字体 | Terminal font |

`role.*.description` 可直接取内置语义（"用于界面与会话正文"等），或 `ctx.locale.bind('settings.theme')` 复用内置命名空间——后者能自动跟随上游文案，但会引入跨命名空间依赖；建议自带一份，避免上游改词时我们的语义漂移。

### 6.5 首屏与终端：删掉旧机制

| 旧机制                                       | 处理                                             |
| -------------------------------------------- | ------------------------------------------------ |
| Host `webserver/index-inject` + `:root:root` | **删除**。内置 Host 半已覆盖，且优先级语义更正确 |
| Client `overrideTokens`                      | **删除**。它是"压过内置"的机制，与复用后端互斥   |
| Client `:root:root` 覆盖样式表               | **删除**（同上）                                 |
| 终端 `@font-face local()` 别名               | **删除**。终端吃 `terminalFontFamily`            |
| `readToken` / `stackForList` / `aliasCss`    | 失去调用方，随之删除                             |

删除后 Host 半只剩"占位"职责（bundle 需要一行可解析的 Host 插件）。

### 6.6 旧值迁移（可选，建议做一次）

旧插件在 `ui-font` 命名空间里留下 `sans` / `mono`。新插件可以：

```js
// Client apply 时一次：仅在目标字段为空时迁移
const legacy = ctx.configForms.get('ui-font').getSnapshot().value ?? {};
const theme  = ctx.configForms.get('ui-theme');
const section = theme.getSnapshot().value ?? {};
if (section.textFontFamily === '' && legacy.sans) theme.set('textFontFamily', normalize(legacy.sans));
if (section.codeFontFamily === '' && legacy.mono) theme.set('codeFontFamily', normalize(legacy.mono));
if (section.terminalFontFamily === '' && legacy.mono) theme.set('terminalFontFamily', normalize(legacy.mono));
```

对当前用户而言这是 **no-op**：`ui-theme.codeFontFamily` / `terminalFontFamily` 已是 Maple Mono，`sans` 为空。是否保留这套迁移取决于决策点 3。

---

## 7. 备选方案对比

| 方案                                                            | 能遮蔽 3 个字体行  | 复用后端             | 抗升级                                         | 代价              | 结论         |
| --------------------------------------------------------------- | ------------------ | -------------------- | ---------------------------------------------- | ----------------- | ------------ |
| **A. 替换 `font-size` 行 + 新字体行 + 写 `ui-theme`**           | ✅                  | ✅                    | ✅ 官方槽位语义；遮蔽项消失即自动回落           | 需重绘 3 条字号行 | **推荐**     |
| B. 只加新行，用 CSS `:has(input)` 隐藏字体行                    | ✅（视觉）          | ✅                    | ❌ 依赖内部 DOM 与 `:has()`，一次构建即可能失效 | 无重复 UI         | 拒绝为主通道 |
| C. 保留自有 `ui-font` + 令牌覆盖                                | ❌ 内置字体行仍显示 | ❌ 双事实源           | ❌ 与内置互相覆盖                               | 改动最小          | 拒绝         |
| D. 调 `theme.setFontFamily`                                     | —                  | ⚠️ 运行时可行但契约外 | ⚠️ 无类型保证                                   | 代码更短          | 仅作降级     |
| E. 向 DSH 上游提特性请求（让三个字体行成为独立槽位 / 开放枚举） | —                  | —                    | ✅                                              | 受发行节奏约束    | 长期备选     |

**B 的补充**：如果将来上游给三个字体行各自分配稳定槽位或 `data-*` 锚点，B 会重新变得有吸引力；当前不值得赌。

---

## 8. 风险与对策

| #   | 风险                                                 | 影响                                     | 对策                                                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **字号行重绘与上游漂移**（上游改了步进器样式或范围） | 视觉不一致或越界写入                     | ① 构建期探针读取已安装的 `ui-theme` bundle，断言 `FONT_SIZE_SPECS` 的 min/max/default 与硬编码一致；② 断言 `FontSettingsGroup` 的行顺序仍为 `text size → text family → code family → code size → terminal family → terminal size`，不一致直接失败并提示"上游结构已变，遮蔽逻辑需复核" |
| 2   | **list 槽位同 priority 抛错**                        | 插件注册瞬间报错、行不出现               | 必须 `priority: -1`；在客户端生命周期桩测试里断言该值（参考 enhanced-prompt 的 `test/lifecycle.test.mjs`）                                                                                                                                                                            |
| 3   | **跨命名空间写入被上游收紧**                         | 字体写不进去                             | 用 `whileServed(['ui-theme'], …)` 作为唯一入口；写入失败时保留乐观值并在下一次 `theme/change` 回滚（沿用现有 `select` 的 catch 回滚模式）                                                                                                                                             |
| 4   | **双重注册 / HMR 残留**                              | 出现两行、或旧行不消失                   | 所有注册都包在 `ctx.slots.inject(...)` 返回的 disposer 里；`ctx.effect` 管理样式标签                                                                                                                                                                                                  |
| 5   | **字体枚举不可用**                                   | 只能手输                                 | 已有 `FALLBACK_FAMILIES` 回退，并在菜单里说明原因（现有行为，保留）                                                                                                                                                                                                                   |
| 6   | **选择值超出内置 `normalizeFontFamily` 规则**        | 回显与落盘不一致                         | 序列化复用同一规则；单测覆盖引号/逗号/控制字符/通用族                                                                                                                                                                                                                                 |
| 7   | **`ui-font` 旧配置残留**                             | 无实际影响（实测透传）                   | 可保留为惰性数据；README 说明可删                                                                                                                                                                                                                                                     |
| 8   | **遮蔽后上游新增字号/行**                            | 我们的替换行缺项                         | 风险 1 的探针会在构建期报警；运行期 `whileServed` 保证命名空间消失时不注册                                                                                                                                                                                                            |
| 9   | **与 `dsh-custom-css` 的用户 CSS 叠加**              | 用户 CSS 里的 `font-family` 仍会压过一切 | 预期行为；README 提醒"用户 CSS 源序最后"                                                                                                                                                                                                                                              |
| 10  | **终端角色在无终端 bundle 时无意义**                 | 设置项看起来无效                         | 文案保持"用于侧栏终端"；不隐藏该项（与内置一致）                                                                                                                                                                                                                                      |

---

## 9. 需要确认的决策点

| #   | 决策点                             | 备选                                                                                              | 建议                                       |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1   | "两个字号保留原位"具体指哪两个     | (a) 展开里的代码字号+终端字号，顶层字号大小也保留（我们的读法）(b) 只保留其中两个、顶层不要       | 需确认；(a) 与当前内置结构最自然           |
| 2   | 遮蔽后"更多字体设置"按钮文案       | (a) 改为"更多字号"（因为字体已移走）(b) 保留内置原文案                                            | (a) 更准确；但会偏离内置文案               |
| 3   | 旧 `ui-font.sans/mono` 是否迁移    | (a) 一次性迁移到 `ui-theme` 空字段 (b) 不迁移、保留惰性配置 (c) 提示用户重选                      | 建议 (a)+(b)：迁移动空字段，其余不动       |
| 4   | 三个选择器的展开密度               | (a) 每个角色一行 + 点开才显示字体栈（完全复用现有 SansRow）(b) 展开「字体」行后直接平铺三个字体栈 | (a) 保真"复用正文选择方式"；(b) 少一层点击 |
| 5   | 每个角色的多字体上限               | 6（现有 `MAX_SANS_FAMILIES`）/ 更大                                                               | 6                                          |
| 6   | 是否标记"已选但系统里找不到"的字体 | 是 / 否                                                                                           | 是（低成本、高价值）                       |
| 7   | 顶层摘要是否显示数量或样例         | 仅"默认/已自定义" / 加数量 / 加 `Ag` 样例                                                         | 仅状态；样例留给行内                       |
| 8   | peer 范围                          | 保持 `^0.2.0-rc.2` / 收紧 `^0.2.1-rc.2`                                                           | 保持即可（已实测满足）                     |
| 9   | Host 半保留到什么程度              | (a) 空壳 `z.object({})` (b) 保留 `sans/mono` 供迁移                                               | 取决于决策点 3                             |

---

## 10. 实施步骤（获批后执行）

1. **Host 半**：按决策点 9 重写 `index.js`——删除 `webserver/index-inject`、`:root:root` 生成、`sans/mono` 的 CSS 模式校验；保留 bundle 所需的 `apply` 与 `Config`。同步改 `package.json`（描述、`files` 不变）。
2. **Client 半**：删除令牌覆盖、覆盖样式表、终端别名；新增 `useThemeSnapshot`（`theme.getTheme()` + `theme/change`）；把 `SansRow` 参数化为 `FontRoleRow(role)`；新增 `FontSizeGroupOnly` 与 `FontRow`；注册两行（`font-size` @ priority −1；`font` @ 11.25）；加 `whileServed` 包裹与迁移。
3. **文案**：`locale/{zh,en}.json` 的 `meta` 保持不变（插件页仍显示"字体"）；设置行文案改为 `ctx.locale.register` 内联字典（与 custom-css 一致）。
4. **构建系统**：重写 `scripts/host-contract.mjs`（Host 不再注入、Config 透传旧键）；新增 `scripts/client-contract.mjs`（在 stub 的 `__ModuleLoader__`/Cordis 下跑 `apply()`，断言两次注册的 `id/order/priority`、写入落在 `ui-theme`、旧令牌覆盖不存在）；把 §8 风险 1 的"上游结构探针"加进 `verify.mjs`。
5. **本地校验**：`npm run verify`（新进程导入 Host 半、Client 桩测试、槽位参数断言）。
6. **就地安装**：`plugin_manager install_bundle target=<插件绝对路径>`（沿用 `link:`，不移动/复制）。
7. **运行时验证**：
   - `Slots.listSubTree{root:"settings.general.item"}` 应出现 **两条 `font-size`**（priority 0 与 −1）和一条 `font`（order 11.25）；
   - 设置 → 通用：字号行只剩"字号大小 / 代码字号 / 终端字号"；字体行显示"默认/已自定义"，展开后有 3 个多字体选择器；
   - 选一个系统字体，确认正文/代码/终端即时改变；重启后仍在；
   - 确认 `ui-theme` 的 `textFontFamily` 等字段出现在 `cordis.patch.yml`。
8. **文档**：更新 `README.md`（新架构、旧令牌覆盖已移除、如何自救）；把本报告回填为"实现与探究的差异"（沿用 custom-css 的体例）。

---

## 11. 参考坐标

| 对象                           | 路径 / 符号                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 字体后端（Host Config + 首屏） | `app.asar → dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/index.js:187`（Config）、`:145`（引导脚本）、`:204`（index-inject） |
| 字体角色 / 范围 / 字段         | 同上 `lib/client.js:1002`（FONT_ROLES）、`:1012`（FONT_SIZE_SPECS）、`:1042`（FONT_FAMILY_FIELDS）                                    |
| 规范化                         | 同上 `lib/client.js:1121`、`lib/index.js:122`                                                                                         |
| 字体行 / 字号行 / 组           | 同上 `lib/client.js:1182`（FontFamilyRow）、`:1233`（FontSizeRow）、`:1321`（FontSettingsGroup）                                      |
| 行注册                         | 同上 `lib/client.js:2047`（appearance）、`:2055`（font-size）                                                                         |
| 服务写入与订阅                 | 同上 `lib/client.js:1726`（setFontSize）、`:1769`（setFontFamily，契约外）、`:1788`（adopt）                                          |
| CSS 组合                       | 同上 `lib/client.js:1408`（base.css）                                                                                                 |
| 实时呈现器                     | `…/dsh-client-ui-layout/lib/client.js:525-527`、`:558`（apply）                                                                       |
| 终端字体                       | `…/dsh-client-ui-sidebar-terminal/lib/client.terminal.js:13392`（`terminalFontFamily`）                                               |
| 槽位冲突规则                   | 前端 shell bundle `dsh-web-frontend/dist/assets/index-CN7NIWNw.js:488025`（`case "list"`）                                            |
| `configForms` 跨命名空间       | `…/dsh-client-ui-settings/lib/client.js`（`ConfigForms.get` / `whileServed`）                                                         |
| 槽位活体目录                   | `cordis_inspect_query` → Client `Slots.listSubTree{root:"settings.general.item"}`                                                     |
| 主题服务契约                   | `cordis_inspect_query` → Client `Service.listService{service:"theme"}`                                                                |
| 版本闸门                       | `…/dsh-app-boot/lib/index.js:277`（`satisfies`，`includePrerelease: true`）                                                           |
| 可照抄的当前版本行范例         | `local-plugins/dsh-custom-css/client.js:224-311`（摘要 + 展开）、`:479`（注册）                                                       |
| 可照抄的注入/清理范例          | `local-plugins/dsh-font-settings/client.js:840-848`（style 标签 + effect）                                                            |
| 可照抄的 Client 桩测试范例     | `local-plugins/dsh-enhanced-prompt/test/lifecycle.test.mjs`                                                                           |
| 本机 profile                   | `~/.dsh/profiles/desktop/{package.json,cordis.patch.yml}`                                                                             |

---

## 12. 一句话总结

**不要重建后端，也不要和新后端抢夺令牌。** 把插件收缩成"一层更好的前端"：写内置的 `textFontFamily` / `codeFontFamily` / `terminalFontFamily`，用 list 槽位的 `id + priority: -1` 整行替换 `font-size` 组以移走三个纯文本框，再在 11.25 位置放一行自己的"字体"——顶层只回答"是否自定义"，展开后是三个复用现有 `SansRow` 的多字体栈。首屏、终端、持久化、热更新全部交给内置后端。
