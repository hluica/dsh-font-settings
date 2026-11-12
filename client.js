/**
 * Client half of the font-settings bundle.
 *
 * The font backend belongs to `@deepseek-ai/dsh-client-ui-theme`: three roles
 * (`text`, `code`, `terminal`) whose family lists live in the `ui-theme` settings
 * namespace, whose first paint that plugin's Host half injects, and whose values
 * the layout presenter applies to `body`. This half owns presentation only.
 *
 * It contributes two rows to the General section:
 *
 *  - `font-size` — shadows the shipped `FontSettingsGroup` (same cell id, lower
 *    priority) and re-draws it with the three size rows exactly as shipped but
 *    without the three plain-text family inputs, which this plugin replaces.
 *  - `font` — collapsed, it answers only "default or customized"; expanded, it
 *    lays the three family stacks out flat, each one an ordered, searchable stack
 *    of up to six system families.
 *
 * Families are written through `ctx.configForms.get('ui-theme')`, the shared
 * settings scope ui-theme itself adopts from, so the shipped rows, the presenter,
 * the terminal and the boot script all observe one value. Sizes go through the
 * public `theme.setFontSize`.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-font-settings',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    // The shell exposes the design system's icon set as a platform seed module,
    // so these rows draw the same chevrons, close mark and check as every
    // shipped settings control instead of shipping lookalike text glyphs.
    const {
      IconCheckOutlineRegular,
      IconChevronDownOutlineRegular,
      IconChevronUpOutlineRegular,
      IconCloseOutlineRegular,
    } = require('@deepseek-ai/dsh-client-ui-primitives');

    /** Dictionary namespace carrying this plugin's copy. */
    const DICT_NAMESPACE = 'settings.font';
    /** Settings namespace owned by ui-theme; the font backend lives there. */
    const THEME_NAMESPACE = 'ui-theme';
    /** The three font roles the shipped backend defines. */
    const ROLES = ['text', 'code', 'terminal'];
    /** Settings fields carrying one role's family list. */
    const FAMILY_FIELDS = Object.freeze({
      text: 'textFontFamily',
      code: 'codeFontFamily',
      terminal: 'terminalFontFamily',
    });
    /** Size rows the shadowed group keeps inside its disclosure, in shipped order. */
    const NESTED_SIZE_ROLES = ['code', 'terminal'];
    /**
     * Size ranges from ui-theme's `FONT_SIZE_SPECS`. The package does not export
     * them, so they are mirrored here and pinned against the installed bundle by
     * the drift probe in `scripts/host-contract.mjs`.
     */
    const SIZE_SPECS = Object.freeze({
      text: { min: 10, max: 22 },
      code: { min: 10, max: 16 },
      terminal: { min: 10, max: 20 },
    });
    /** Most families one role's stack may name. */
    const MAX_FAMILIES = 6;
    /** Row positions: the shipped size row, then this font row, then custom-css (11.5). */
    const ROW_ORDER = Object.freeze({ sizes: 11, font: 11.25 });
    /**
     * CSS Fonts generic and system family keywords, which must stay unquoted.
     * Mirrors ui-theme's own list so a value written here round-trips through
     * that package's `normalizeFontFamily` unchanged.
     */
    const GENERIC_FAMILIES = new Set([
      'serif',
      'sans-serif',
      'monospace',
      'cursive',
      'fantasy',
      'system-ui',
      'ui-serif',
      'ui-sans-serif',
      'ui-monospace',
      'ui-rounded',
      'emoji',
      'math',
      'fangsong',
      '-apple-system',
      'blinkmacsystemfont',
    ]);

    /** Families offered when the Local Font Access API cannot be read. */
    const FALLBACK_FAMILIES = [
      'Arial', 'Avenir', 'Avenir Next', 'Cascadia Code', 'Consolas', 'Courier New', 'DejaVu Sans',
      'DejaVu Sans Mono', 'Fira Code', 'Futura', 'Georgia', 'Gill Sans', 'Helvetica', 'Helvetica Neue',
      'Hiragino Sans GB', 'IBM Plex Mono', 'JetBrains Mono', 'Liberation Mono', 'Menlo', 'Microsoft YaHei',
      'Monaco', 'Noto Sans CJK SC', 'Optima', 'PingFang SC', 'Roboto Mono', 'SF Mono', 'Segoe UI',
      'SimHei', 'SimSun', 'Songti SC', 'Source Code Pro', 'Source Han Sans SC', 'Tahoma',
      'Times New Roman', 'Trebuchet MS', 'Ubuntu Mono', 'Verdana',
    ];

    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      'row.title': '字体',
      'summary.default': '默认',
      'summary.customized': '已自定义',
      'role.text.title': '正文字体',
      'role.text.description': '用于界面与会话正文。可添加多个字体，按顺序回退；留空使用默认字体',
      'role.code.title': '代码字体',
      'role.code.description': '用于代码块、行内代码与工具输出。可添加多个字体，按顺序回退；留空使用默认字体',
      'role.terminal.title': '终端字体',
      'role.terminal.description': '用于侧栏终端。可添加多个字体，按顺序回退；留空使用默认字体',
      'role.reset': '恢复默认',
      'fontSize.text.title': '字号大小',
      'fontSize.text.description': '仅影响会话内容的字号',
      'fontSize.text.increase': '增大字号',
      'fontSize.text.decrease': '减小字号',
      'fontSize.code.title': '代码字号',
      'fontSize.code.description': '用于代码块、行内代码与工具输出',
      'fontSize.code.increase': '增大代码字号',
      'fontSize.code.decrease': '减小代码字号',
      'fontSize.terminal.title': '终端字号',
      'fontSize.terminal.description': '用于侧栏终端',
      'fontSize.terminal.increase': '增大终端字号',
      'fontSize.terminal.decrease': '减小终端字号',
      'fontSize.unit': 'px',
      'fontSize.more': '更多字号',
      'menu.search': '搜索字体',
      'menu.empty': '没有匹配的字体',
      'menu.loading': '正在读取系统字体…',
      'menu.denied': '无法读取系统字体列表，仅显示常用字体',
      'menu.fallback': '当前环境不支持读取系统字体，仅显示常用字体',
      'stack.empty': '尚未指定字体，当前使用默认字体栈。',
      'stack.add': '添加字体',
      'stack.limit': '已达到字体数量上限',
      'stack.moveUp': '上移',
      'stack.moveDown': '下移',
      'stack.remove': '移除',
      'stack.added': '已在列表中',
      'stack.missing': '系统中未找到该字体',
      'stack.orderHint': '按从上到下的顺序应用；前面的字体缺少某个字形时，回退到后面的字体。',
    };
    /** English dictionary, checked complete against the zh key set. */
    const en = {
      'row.title': 'Fonts',
      'summary.default': 'Default',
      'summary.customized': 'Customized',
      'role.text.title': 'Text font',
      'role.text.description': 'Used for the interface and conversation text. Add several families; they fall back in order. Leave empty for the default',
      'role.code.title': 'Code font',
      'role.code.description': 'Used for code blocks, inline code, and tool output. Add several families; they fall back in order. Leave empty for the default',
      'role.terminal.title': 'Terminal font',
      'role.terminal.description': 'Used for the sidebar terminal. Add several families; they fall back in order. Leave empty for the default',
      'role.reset': 'Reset',
      'fontSize.text.title': 'Font size',
      'fontSize.text.description': 'Only affects conversation content',
      'fontSize.text.increase': 'Increase font size',
      'fontSize.text.decrease': 'Decrease font size',
      'fontSize.code.title': 'Code font size',
      'fontSize.code.description': 'Used for code blocks, inline code, and tool output',
      'fontSize.code.increase': 'Increase code font size',
      'fontSize.code.decrease': 'Decrease code font size',
      'fontSize.terminal.title': 'Terminal font size',
      'fontSize.terminal.description': 'Used for the sidebar terminal',
      'fontSize.terminal.increase': 'Increase terminal font size',
      'fontSize.terminal.decrease': 'Decrease terminal font size',
      'fontSize.unit': 'px',
      'fontSize.more': 'More font sizes',
      'menu.search': 'Search fonts',
      'menu.empty': 'No matching font',
      'menu.loading': 'Reading system fonts…',
      'menu.denied': 'Could not read the system font list; showing common families only',
      'menu.fallback': 'This environment cannot list system fonts; showing common families only',
      'stack.empty': 'No font chosen; the default stack is in use.',
      'stack.add': 'Add font',
      'stack.limit': 'Family limit reached',
      'stack.moveUp': 'Move up',
      'stack.moveDown': 'Move down',
      'stack.remove': 'Remove',
      'stack.added': 'Already in the list',
      'stack.missing': 'This font is not installed',
      'stack.orderHint': 'Applied top to bottom: a family falls back to the ones below it for glyphs it lacks.',
    };

    /**
     * Row styles. The size rows mirror the shipped FontSizeRow geometry so
     * replacing the group is invisible; everything else reuses the shipped
     * picker, menu and stack shapes. Colours and radii are design tokens only.
     */
    const CSS = [
      '.dsf-sizeGroup{flex-direction:column;display:flex}',
      '.dsf-sizeRow{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}',
      '.dsf-sizeRowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}',
      '.dsf-sizeTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}',
      '.dsf-sizeDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}',
      '.dsf-sizeControl{align-items:center;gap:8px;display:inline-flex;flex:0 0 auto}',
      '.dsf-stepper{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);justify-content:center;align-items:center;min-width:72px;height:36px;display:inline-flex;position:relative}',
      '.dsf-stepperValue{text-align:center;font-variant-numeric:tabular-nums;min-width:18px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}',
      '.dsf-stepperUnit{color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}',
      '.dsf-arrows{opacity:0;flex-direction:column;gap:2px;display:flex;position:absolute;right:8px}',
      '.dsf-stepper:hover .dsf-arrows,.dsf-stepper:focus-within .dsf-arrows{opacity:1}',
      '.dsf-arrow{border-radius:var(--dsw-radius-xs);background:color-mix(in srgb, var(--dsw-alias-bg-layer-1) 75%, transparent);width:17px;height:12px;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;justify-content:center;align-items:center;padding:0;display:inline-flex}',
      '.dsf-arrow:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}',
      '.dsf-arrow:disabled{color:var(--dsw-alias-label-caption);cursor:default}',
      '.dsf-expander{border-radius:var(--dsw-radius-xs);width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;justify-content:center;align-items:center;padding:0;display:inline-flex;flex:0 0 auto}',
      '.dsf-expander:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsf-expander:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsf-entry{border-bottom:.5px solid var(--dsw-alias-border-l2);flex-direction:column;display:flex}',
      '.dsf-row{align-items:center;gap:8px;padding:16px 0;display:flex}',
      '.dsf-rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}',
      '.dsf-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}',
      '.dsf-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}',
      '.dsf-picker{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);border:none;cursor:pointer;align-items:center;gap:8px;height:36px;max-width:280px;padding:0 12px;display:inline-flex;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;font-family:var(--dsw-font-family)}',
      '.dsf-picker:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsf-picker:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dsf-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
      '.dsf-chevron{color:var(--dsw-alias-label-tertiary);flex:0 0 auto}',
      '.dsf-panel{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);flex-direction:column;margin:0 0 16px;padding:2px 14px 12px;display:flex}',
      '.dsf-role{flex-direction:column;gap:6px;padding:12px 0;display:flex}',
      '.dsf-role+.dsf-role{border-top:.5px solid var(--dsw-alias-border-l2)}',
      '.dsf-roleHead{align-items:baseline;gap:8px;display:flex}',
      '.dsf-roleTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px;flex:1;min-width:0}',
      '.dsf-reset{border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:var(--dsw-radius-xs);padding:0 4px;font-family:var(--dsw-font-family);font-size:12px;line-height:18px;flex:0 0 auto}',
      '.dsf-reset:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dsf-reset:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsf-roleDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.dsf-stack{flex-direction:column;gap:2px;margin-top:2px;display:flex}',
      '.dsf-stackRow{align-items:center;gap:8px;min-height:30px;display:flex}',
      '.dsf-stackIndex{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;text-align:right;flex:0 0 auto;min-width:14px;font-size:12px;line-height:18px}',
      '.dsf-stackName{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;font-size:14px;line-height:22px;overflow:hidden}',
      '.dsf-stackName[data-missing="true"]{color:var(--dsw-alias-state-warn-label)}',
      '.dsf-missing{flex:0 0 auto;color:var(--dsw-alias-state-warn-label);border:.5px solid var(--dsw-alias-state-warn-primary);border-radius:999px;width:16px;height:16px;font-size:11px;line-height:15px;text-align:center;cursor:help}',
      '.dsf-stackEmpty{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:4px 0}',
      '.dsf-iconButton{border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:var(--dsw-radius-xs);flex:0 0 auto;justify-content:center;align-items:center;width:22px;height:22px;padding:0;display:inline-flex}',
      '.dsf-iconButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dsf-iconButton:disabled{color:var(--dsw-alias-label-caption);cursor:default}',
      '.dsf-iconButton:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsf-addButton{border:.5px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;align-self:flex-start;height:32px;padding:0 10px;font-family:var(--dsw-font-family);font-size:13px;line-height:20px;margin-top:2px}',
      '.dsf-addButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dsf-addButton:disabled{color:var(--dsw-alias-label-caption);cursor:default}',
      '.dsf-addButton:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dsf-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding-top:8px}',
      // `box-sizing:border-box` keeps the inline `max-height` a budget for the
      // WHOLE card: without it the 8px padding and the border are added on top of
      // the measured viewport budget, so the card overhangs the margin menuBox
      // reserved for it.
      '.dsf-menu{position:fixed;z-index:1200;box-sizing:border-box;background:var(--dsw-alias-bg-overlay);border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);box-shadow:0 12px 32px rgba(0,0,0,.16);display:flex;flex-direction:column;overflow:hidden;padding:8px;gap:8px}',
      // The search box and the list are the card's two flex items. Only the list
      // may give up height — it is the scrollport — so the fixed-height box has
      // to opt out of shrinking explicitly.
      '.dsf-input{flex:0 0 auto;width:100%;box-sizing:border-box;height:32px;border-radius:var(--dsw-radius-sm);border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;padding:0 10px;font-family:var(--dsw-font-family)}',
      '.dsf-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}',
      // The list is the card's scrollport (`min-height:0` is what lets it shrink).
      // Its rows must NOT shrink with it: a column flex container shrinks its
      // items before it ever overflows, and `overflow:hidden` here zeroes the
      // automatic minimum size that would otherwise protect them.
      '.dsf-list{overflow-y:auto;display:flex;flex-direction:column;gap:1px;min-height:0}',
      '.dsf-option{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:var(--dsw-radius-sm);cursor:pointer;color:var(--dsw-alias-label-primary);font-size:14px;line-height:20px;white-space:nowrap;overflow:hidden}',
      '.dsf-option[data-active="true"]{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsf-optionName{overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}',
      '.dsf-check{color:var(--dsw-alias-brand-primary);flex:0 0 auto}',
      '.dsf-note{flex:0 0 auto;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:2px 10px 6px}',
      '.dsf-option[data-added="true"] .dsf-optionName{color:var(--dsw-alias-label-tertiary)}',
    ].join('');

    /**
     * Normalize one family name exactly as ui-theme's `normalizeFontFamily`
     * does: drop quotes, backslashes, angle brackets and control characters,
     * collapse whitespace, trim.
     * @param name - a user-visible family name.
     * @returns the normalized name, or an empty string.
     */
    function normalizeFamily(name) {
      return String(name === undefined || name === null ? '' : name)
        .replace(/["'\\<>\u0000-\u001f\u007f]/gu, '')
        .replace(/\s+/gu, ' ')
        .trim();
    }

    /**
     * Quote one family for a CSS font-family list, leaving generics unquoted.
     * @param name - a family name.
     * @returns the quoted list element, or an empty string.
     */
    function quoteFamily(name) {
      const clean = normalizeFamily(name);
      if (clean === '') return '';
      return GENERIC_FAMILIES.has(clean.toLowerCase()) ? clean : '"' + clean + '"';
    }

    /**
     * Parse a stored list back into ordered family names. Surrounding quotes are
     * stripped; the result is capped at the UI limit.
     * @param raw - stored field value.
     * @returns ordered family names.
     */
    function parseFamilies(raw) {
      if (typeof raw !== 'string' || raw === '') return [];
      return raw
        .split(',')
        .map((part) => part.trim())
        .map((part) => part.replace(/^["']/, '').replace(/["']$/, '').trim())
        .filter((part) => part !== '')
        .slice(0, MAX_FAMILIES);
    }

    /**
     * Serialize ordered families into the stored form, matching ui-theme's
     * normalization so the value survives a round trip through that package.
     * @param families - ordered family names.
     * @returns a comma-separated, quoted font list.
     */
    function serializeFamilies(families) {
      return families
        .map(normalizeFamily)
        .filter((name) => name !== '')
        .slice(0, MAX_FAMILIES)
        .map(quoteFamily)
        .join(', ');
    }

    /** Filter the family list by a case-insensitive substring. */
    function filterFamilies(families, query) {
      const needle = query.trim().toLowerCase();
      if (needle === '') return families;
      return families.filter((family) => family.toLowerCase().includes(needle));
    }

    /** Compute the popup box from the trigger's viewport rect, then clamp it inside the window. */
    function menuBox(rect) {
      const margin = 8;
      const width = Math.max(240, Math.min(320, Math.round(rect.width)));
      const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin));
      const below = window.innerHeight - rect.bottom - margin;
      const above = rect.top - margin;
      const openUp = below < 240 && above > below;
      const maxHeight = Math.max(160, Math.min(360, (openUp ? above : below) - 8));
      const top = openUp ? Math.max(margin, rect.top - maxHeight - 6) : rect.bottom + 6;
      return { top, left, width, maxHeight };
    }

    /** A minimal external store so the rows share one live plugin state. */
    function createStore(initial) {
      let value = initial;
      const listeners = new Set();
      const emit = () => {
        for (const listener of [...listeners]) listener();
      };
      return {
        get: () => value,
        set: (next) => {
          if (next === value) return;
          value = next;
          emit();
        },
        subscribe: (listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        update: (patch) => {
          const next = { ...value, ...patch };
          if (next === value) return;
          value = next;
          emit();
        },
      };
    }

    /** Subscribe a component to the shared store. */
    function useStore(store) {
      return React.useSyncExternalStore(store.subscribe, store.get, store.get);
    }

    /** Re-render on locale change so row copy follows the active language. */
    function useLocaleRevision(ctx) {
      const [revision, bump] = React.useReducer((n) => n + 1, 0);
      React.useEffect(() => ctx.locale.subscribe(bump), []);
      return revision;
    }

    /** Load the installed font families once and record how the list was obtained. */
    function loadFamilies(store) {
      if (typeof window === 'undefined' || typeof window.queryLocalFonts !== 'function') {
        store.set({ families: FALLBACK_FAMILIES, status: 'unsupported' });
        return;
      }
      Promise.resolve()
        .then(() => window.queryLocalFonts())
        .then((available) => {
          const seen = new Set();
          for (const font of available) {
            const family = font !== null && typeof font.family === 'string' ? font.family.trim() : '';
            if (family !== '') seen.add(family);
          }
          if (seen.size === 0) {
            store.set({ families: FALLBACK_FAMILIES, status: 'unsupported' });
            return;
          }
          store.set({
            families: [...seen].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
            status: 'system',
          });
        })
        .catch(() => {
          store.set({ families: FALLBACK_FAMILIES, status: 'denied' });
        });
    }

    /**
     * The font list popup: search, keyboard navigation, Escape and click-outside
     * dismissal. `marked` lists the families already in the role's stack, so the
     * popup can show them as taken instead of adding a duplicate.
     * @param props - popup box, families, marks, enumeration status, copy and callbacks.
     * @returns the popup element tree.
     */
    function FontMenu(props) {
      const { box, families, marked, status, t, onSelect, onClose } = props;
      const [query, setQuery] = React.useState('');
      const [active, setActive] = React.useState(0);
      const boxRef = React.useRef(null);
      const inputRef = React.useRef(null);
      const listRef = React.useRef(null);
      const markedSet = React.useMemo(
        () => new Set(marked.map((family) => family.toLowerCase())),
        [marked],
      );

      const options = React.useMemo(() => filterFamilies(families, query), [families, query]);

      React.useEffect(() => {
        setActive(0);
      }, [query]);

      React.useEffect(() => {
        const input = inputRef.current;
        // `preventScroll` matters: focusing an element can scroll its ancestors,
        // and that scroll would be seen by the listener below and close the menu
        // the instant it opened.
        if (input !== null) input.focus({ preventScroll: true });
        const onPointerDown = (event) => {
          const node = boxRef.current;
          if (node !== null && !node.contains(event.target)) onClose();
        };
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation();
          onClose();
        };
        // The card is fixed-positioned, so a scroll anywhere UNDER it leaves it
        // pointing at nothing and it has to close. Its own scrolling must not
        // count: a `scroll` listener on the window in the capture phase sees
        // every descendant scrollport, so without this filter the menu closes on
        // the user wheeling through a long family list.
        const onScroll = (event) => {
          const node = boxRef.current;
          if (node !== null && event.target instanceof Node && node.contains(event.target)) return;
          onClose();
        };
        const onResize = () => onClose();
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('resize', onResize);
        window.addEventListener('scroll', onScroll, true);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown, true);
          window.removeEventListener('resize', onResize);
          window.removeEventListener('scroll', onScroll, true);
        };
      }, [onClose]);

      // Keep the highlighted row inside the list's own scrollport. Scrolling that
      // port by hand, instead of calling `scrollIntoView`, is what guarantees no
      // ancestor is scrolled: the card is fixed to the viewport.
      React.useEffect(() => {
        const list = listRef.current;
        if (list === null) return;
        const current = list.querySelector('[data-active="true"]');
        if (current === null) return;
        const listRect = list.getBoundingClientRect();
        const rowRect = current.getBoundingClientRect();
        if (rowRect.top < listRect.top) list.scrollTop -= listRect.top - rowRect.top;
        else if (rowRect.bottom > listRect.bottom) list.scrollTop += rowRect.bottom - listRect.bottom;
      }, [active, options]);

      const commit = (family) => {
        if (markedSet.has(family.toLowerCase())) return;
        onSelect(family);
        onClose();
      };

      const onInputKeyDown = (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setActive((index) => Math.min(index + 1, options.length - 1));
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          setActive((index) => Math.max(index - 1, 0));
        } else if (event.key === 'Home') {
          event.preventDefault();
          setActive(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          setActive(options.length - 1);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          const option = options[active];
          if (option !== undefined) commit(option);
        }
      };

      const note =
        status === 'loading'
          ? t('menu.loading')
          : status === 'denied'
            ? t('menu.denied')
            : status === 'unsupported'
              ? t('menu.fallback')
              : null;

      return h(
        'div',
        {
          className: 'dsf-menu',
          ref: boxRef,
          style: { top: box.top + 'px', left: box.left + 'px', width: box.width + 'px', maxHeight: box.maxHeight + 'px' },
        },
        h('input', {
          ref: inputRef,
          className: 'dsf-input',
          type: 'text',
          role: 'combobox',
          'aria-expanded': 'true',
          'aria-autocomplete': 'list',
          'aria-label': t('menu.search'),
          placeholder: t('menu.search'),
          spellCheck: false,
          autoComplete: 'off',
          value: query,
          onChange: (event) => setQuery(event.target.value),
          onKeyDown: onInputKeyDown,
        }),
        h(
          'div',
          {
            ref: listRef,
            className: 'dsf-list',
            role: 'listbox',
            'aria-label': t('menu.search'),
          },
          note !== null ? h('div', { className: 'dsf-note' }, note) : null,
          options.length === 0
            ? h('div', { className: 'dsf-note' }, t('menu.empty'))
            : options.map((option, index) => {
                const taken = markedSet.has(option.toLowerCase());
                return h(
                  'div',
                  {
                    key: option,
                    className: 'dsf-option',
                    role: 'option',
                    'aria-selected': taken ? 'true' : 'false',
                    'data-active': index === active ? 'true' : 'false',
                    'data-added': taken ? 'true' : 'false',
                    title: taken ? t('stack.added') : undefined,
                    style: { fontFamily: quoteFamily(option) },
                    onPointerMove: () => setActive(index),
                    onClick: () => commit(option),
                  },
                  h('span', { className: 'dsf-optionName' }, option),
                  taken ? h(IconCheckOutlineRegular, { className: 'dsf-check', size: 14 }) : null,
                );
              }),
        ),
      );
    }

    /**
     * One size row, identical in geometry to the shipped FontSizeRow.
     * @param props - role, current size, copy, write path and an optional disclosure.
     * @returns the row element tree.
     */
    function SizeRow(props) {
      const { role, px, t, onSize, expander } = props;
      const { min, max } = SIZE_SPECS[role];
      return h(
        'div',
        { className: 'dsf-sizeRow' },
        h(
          'div',
          { className: 'dsf-sizeRowText' },
          h('div', { className: 'dsf-sizeTitle' }, t('fontSize.' + role + '.title')),
          h('div', { className: 'dsf-sizeDesc' }, t('fontSize.' + role + '.description')),
        ),
        h(
          'div',
          { className: 'dsf-sizeControl' },
          h(
            'div',
            { className: 'dsf-stepper' },
            h('span', { className: 'dsf-stepperValue' }, String(px)),
            h('span', { className: 'dsf-stepperUnit' }, t('fontSize.unit')),
            h(
              'div',
              { className: 'dsf-arrows' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsf-arrow',
                  'aria-label': t('fontSize.' + role + '.increase'),
                  title: t('fontSize.' + role + '.increase'),
                  disabled: px >= max,
                  onClick: () => onSize(role, Math.min(max, px + 1)),
                },
                h(IconChevronUpOutlineRegular, { size: 10 }),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsf-arrow',
                  'aria-label': t('fontSize.' + role + '.decrease'),
                  title: t('fontSize.' + role + '.decrease'),
                  disabled: px <= min,
                  onClick: () => onSize(role, Math.max(min, px - 1)),
                },
                h(IconChevronDownOutlineRegular, { size: 10 }),
              ),
            ),
          ),
        ),
        expander === undefined
          ? null
          : h(
              'button',
              {
                type: 'button',
                className: 'dsf-expander',
                'aria-expanded': expander.open ? 'true' : 'false',
                'aria-controls': expander.controls,
                'aria-label': t('fontSize.more'),
                title: t('fontSize.more'),
                onClick: expander.onToggle,
              },
              h(expander.open ? IconChevronUpOutlineRegular : IconChevronDownOutlineRegular, { size: 14 }),
            ),
      );
    }

    /**
     * Shadow the shipped `font-size` cell: the three size rows stay, the three
     * plain-text family inputs do not. The disclosure starts collapsed on every
     * mount, exactly like the shipped group.
     * @param ctx - client cordis context.
     * @param deps - shared stores and write paths.
     * @returns the row component.
     */
    function createSizeGroup(ctx, deps) {
      return function SizeGroup() {
        useLocaleRevision(ctx);
        const t = ctx.locale.bind(DICT_NAMESPACE);
        const state = useStore(deps.themeStore);
        const [open, setOpen] = React.useState(false);
        const regionId = React.useId();
        const sizes = state.snapshot.fontSizes;

        const onSize = (role, px) => {
          try {
            ctx.theme.setFontSize(role, px);
          } catch (error) {
            // Out of range: the arrows clamp already, so this only guards a
            // stale range mirrored from an older ui-theme build.
          }
        };

        return h(
          'div',
          { className: 'dsf-sizeGroup' },
          h(SizeRow, {
            role: 'text',
            px: sizes.text,
            t,
            onSize,
            expander: {
              open,
              controls: regionId,
              onToggle: () => setOpen((value) => !value),
            },
          }),
          open
            ? h(
                'div',
                { id: regionId },
                NESTED_SIZE_ROLES.map((role) =>
                  h(SizeRow, { key: role, role, px: sizes[role], t, onSize }),
                ),
              )
            : null,
        );
      };
    }

    /**
     * One role's flat stack editor: title, ordered families, add/reset and the
     * system-font menu. Marks a chosen family the enumeration did not find.
     * @param props - role, stored value, known families, status, copy and writer.
     * @returns the section element tree.
     */
    function RoleSection(props) {
      const { role, value, families, status, t, onWrite } = props;
      const chosen = React.useMemo(() => parseFamilies(value), [value]);
      const known = React.useMemo(
        () => new Set(families.map((family) => family.toLowerCase())),
        [families],
      );
      const [box, setBox] = React.useState(null);
      const addRef = React.useRef(null);

      const close = React.useCallback(() => {
        setBox(null);
        const node = addRef.current;
        if (node !== null) node.focus();
      }, []);

      const toggle = () => {
        if (box !== null) {
          close();
          return;
        }
        const node = addRef.current;
        if (node === null) return;
        setBox(menuBox(node.getBoundingClientRect()));
      };

      const write = (next) => onWrite(role, serializeFamilies(next));
      const add = (family) => {
        if (chosen.some((item) => item.toLowerCase() === family.toLowerCase())) return;
        if (chosen.length >= MAX_FAMILIES) return;
        write(chosen.concat([family]));
      };
      const move = (index, delta) => {
        const target = index + delta;
        if (target < 0 || target >= chosen.length) return;
        const next = chosen.slice();
        const moved = next.splice(index, 1)[0];
        next.splice(target, 0, moved);
        write(next);
      };
      const remove = (index) => write(chosen.filter((_item, at) => at !== index));
      const absent = (family) =>
        status === 'system'
        && !GENERIC_FAMILIES.has(family.toLowerCase())
        && !known.has(family.toLowerCase());
      const full = chosen.length >= MAX_FAMILIES;

      return h(
        'section',
        { className: 'dsf-role' },
        h(
          'div',
          { className: 'dsf-roleHead' },
          h('div', { className: 'dsf-roleTitle' }, t('role.' + role + '.title')),
          chosen.length === 0
            ? null
            : h(
                'button',
                { type: 'button', className: 'dsf-reset', onClick: () => write([]) },
                t('role.reset'),
              ),
        ),
        h('div', { className: 'dsf-roleDesc' }, t('role.' + role + '.description')),
        h(
          'div',
          { className: 'dsf-stack' },
          chosen.length === 0
            ? h('div', { className: 'dsf-stackEmpty' }, t('stack.empty'))
            : chosen.map((family, index) => {
                const missing = absent(family);
                return h(
                  'div',
                  { className: 'dsf-stackRow', key: family + '#' + String(index) },
                  h('span', { className: 'dsf-stackIndex', 'aria-hidden': true }, String(index + 1)),
                  h(
                    'span',
                    {
                      className: 'dsf-stackName',
                      'data-missing': missing ? 'true' : undefined,
                      style: { fontFamily: quoteFamily(family) },
                    },
                    family,
                  ),
                  missing
                    ? h(
                        'span',
                        {
                          className: 'dsf-missing',
                          title: t('stack.missing'),
                          'aria-label': t('stack.missing'),
                        },
                        '!',
                      )
                    : null,
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsf-iconButton',
                      'aria-label': t('stack.moveUp'),
                      title: t('stack.moveUp'),
                      disabled: index === 0,
                      onClick: () => move(index, -1),
                    },
                    h(IconChevronUpOutlineRegular, { size: 14 }),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsf-iconButton',
                      'aria-label': t('stack.moveDown'),
                      title: t('stack.moveDown'),
                      disabled: index === chosen.length - 1,
                      onClick: () => move(index, 1),
                    },
                    h(IconChevronDownOutlineRegular, { size: 14 }),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsf-iconButton',
                      'aria-label': t('stack.remove'),
                      title: t('stack.remove'),
                      onClick: () => remove(index),
                    },
                    h(IconCloseOutlineRegular, { size: 14 }),
                  ),
                );
              }),
          h(
            'button',
            {
              type: 'button',
              ref: addRef,
              className: 'dsf-addButton',
              'aria-haspopup': 'listbox',
              'aria-expanded': box !== null ? 'true' : 'false',
              disabled: full,
              title: full ? t('stack.limit') : t('stack.add'),
              onClick: toggle,
            },
            '+ ' + t('stack.add'),
          ),
        ),
        box === null
          ? null
          : h(FontMenu, {
              box,
              families,
              marked: chosen,
              status,
              t,
              onSelect: add,
              onClose: close,
            }),
      );
    }

    /**
     * The font entry: a status summary that expands into the three flat role
     * stacks. Writes are optimistic so a chip appears on click and the durable
     * value replaces the overlay once the settings round trip settles.
     * @param ctx - client cordis context.
     * @param deps - shared stores and the `ui-theme` form.
     * @returns the row component.
     */
    function createFontRow(ctx, deps) {
      return function FontRow() {
        useLocaleRevision(ctx);
        const t = ctx.locale.bind(DICT_NAMESPACE);
        const state = useStore(deps.themeStore);
        const fontState = useStore(deps.fontStore);
        const [open, setOpen] = React.useState(false);
        const [pending, setPending] = React.useState({});
        const seqRef = React.useRef(0);
        const panelId = React.useId();

        const valueOf = (role) => {
          const overlay = pending[role];
          if (overlay !== undefined) return overlay.value;
          const durable = state.snapshot.fontFamilies[role];
          return typeof durable === 'string' ? durable : '';
        };
        const custom = ROLES.some((role) => valueOf(role) !== '');

        const writeFamily = (role, value) => {
          const seq = seqRef.current + 1;
          seqRef.current = seq;
          setPending((prev) => ({ ...prev, [role]: { value, seq } }));
          Promise.resolve()
            .then(() => deps.form.set(FAMILY_FIELDS[role], value))
            .catch(() => {})
            .then(() => {
              setPending((prev) => {
                if (prev[role] === undefined || prev[role].seq !== seq) return prev;
                const next = { ...prev };
                delete next[role];
                return next;
              });
            });
        };

        return h(
          'div',
          { className: 'dsf-entry' },
          h(
            'div',
            { className: 'dsf-row' },
            h(
              'div',
              { className: 'dsf-rowText' },
              h('div', { className: 'dsf-title' }, t('row.title')),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsf-picker',
                'aria-expanded': open ? 'true' : 'false',
                'aria-controls': panelId,
                title: custom ? t('summary.customized') : t('summary.default'),
                onClick: () => setOpen((value) => !value),
              },
              h('span', { className: 'dsf-value' }, custom ? t('summary.customized') : t('summary.default')),
              h(open ? IconChevronUpOutlineRegular : IconChevronDownOutlineRegular, {
                className: 'dsf-chevron',
                size: 14,
              }),
            ),
          ),
          open
            ? h(
                'div',
                { id: panelId, className: 'dsf-panel' },
                ROLES.map((role) =>
                  h(RoleSection, {
                    key: role,
                    role,
                    value: valueOf(role),
                    families: fontState.families,
                    status: fontState.status,
                    t,
                    onWrite: writeFamily,
                  }),
                ),
                h('div', { className: 'dsf-hint' }, t('stack.orderHint')),
              )
            : null,
        );
      };
    }

    /**
     * Client plugin body. Owns presentation only; every persistence and
     * first-paint concern belongs to `ui-theme`.
     * @param ctx - client cordis context.
     */
    function apply(ctx) {
      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset.plugin = '@local/dsh-font-settings';
        tag.dataset.pluginCss = '@local/dsh-font-settings/client.css';
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }, 'ui-font: row styles');

      ctx.effect(() => ctx.locale.register(DICT_NAMESPACE, { zh, en }), 'ui-font: dictionaries');

      const themeStore = createStore({ snapshot: ctx.theme.getTheme() });
      ctx.effect(() => {
        const off = ctx.on('theme/change', (snapshot) => themeStore.set({ snapshot }));
        return () => {
          if (typeof off === 'function') off();
        };
      }, 'ui-font: theme snapshot');

      const fontStore = createStore({ families: [], status: 'loading' });
      loadFamilies(fontStore);

      const deps = {
        themeStore,
        fontStore,
        // The shared scope ui-theme itself adopts from: a write here reaches the
        // shipped rows, the presenter, the terminal and the boot script.
        form: ctx.configForms.get(THEME_NAMESPACE),
      };

      // Same cell id as the shipped row, lower priority: the shipped
      // FontSettingsGroup stays registered but is shadowed, and `entriesOfSlot`
      // renders the lowest priority. Restoring this plugin's absence restores
      // the shipped row with no cleanup.
      ctx.slots.inject('settings.general.item', () =>
        ctx.slots.register(
          {
            name: 'settings.general.item',
            id: 'font-size',
            order: ROW_ORDER.sizes,
            priority: -1,
            locale: DICT_NAMESPACE,
          },
          createSizeGroup(ctx, deps),
        ),
      );

      ctx.slots.inject('settings.general.item', () =>
        ctx.slots.register(
          {
            name: 'settings.general.item',
            id: 'font',
            order: ROW_ORDER.font,
            locale: DICT_NAMESPACE,
          },
          createFontRow(ctx, deps),
        ),
      );
    }

    // Build-time contract seam: the probe in scripts/host-contract.mjs sets this
    // flag before evaluating the client half, so it can assert the pure
    // serialization rules without a browser. Never set at runtime.
    if (typeof globalThis !== 'undefined' && globalThis.__DSF_CONTRACT__ === true) {
      globalThis.__DSF_PURE__ = {
        parseFamilies,
        quoteFamily,
        serializeFamilies,
        normalizeFamily,
        FAMILY_FIELDS,
        ROW_ORDER,
        SIZE_SPECS,
        MAX_FAMILIES,
        zh,
        en,
      };
    }

    return {
      inject: ['slots', 'locale', 'theme', 'configForms'],
      apply,
    };
  },
});
