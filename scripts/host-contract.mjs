/**
 * Build-time contract probe for the font-settings bundle.
 *
 * The plugin is now a thin presentation layer over `@deepseek-ai/dsh-client-ui-theme`.
 * Three contracts are worth asserting, and all three are checked here:
 *
 *  1. The Host half is inert. It owns no settings namespace and injects no
 *     first-paint style — the shipped ui-theme Host half owns both — and its
 *     Config still accepts the legacy `sans` / `mono` keys a profile patch may
 *     carry.
 *  2. The Client half registers exactly what the shadowing scheme requires:
 *     `font-size` at priority -1 (the shipped cell it replaces) and `font` at
 *     11.25 (between the size row and custom-css), writing through
 *     `configForms.get('ui-theme')` and never through a token override.
 *  3. The installed ui-theme bundle still has the roles, ranges, fields and row
 *     order this plugin mirrors. That check is skipped on a machine without a
 *     DSH installation, and fails loudly when an upgrade changes the shape.
 *
 * The probe runs in a fresh process (`lib/probe-runner.mjs`) so a failed
 * `import()` is reported rather than cached.
 *
 * @module scripts/host-contract
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

import { runProbe } from './lib/probe-runner.mjs';

/** The three roles the shipped backend defines. */
const ROLES = ['text', 'code', 'terminal'];
/** Mirrored FONT_SIZE_SPECS: [min, max, default]. */
const SIZE_RANGES = { text: [10, 22, 14], code: [10, 16, 11], terminal: [10, 20, 13] };

/**
 * Assert the Host half is inert and still parses a legacy patch config.
 * @param root - plugin directory.
 * @param patchId - entry id the bundle patch declares.
 * @param check - assertion collector.
 */
async function probeHostHalf({ root, patchId, check }) {
  const mod = await import(pathToFileURL(join(root, 'index.js')).href);

  check('the Host half exports apply()', typeof mod.apply === 'function');
  check('the Host half exports Config', typeof mod.Config === 'function');

  let legacy;
  try {
    legacy = mod.Config({ sans: '', mono: 'Maple Mono Normal NF CN' });
    check('Config accepts the legacy sans/mono keys a profile patch may carry', legacy !== null && typeof legacy === 'object');
  } catch (error) {
    check('Config accepts the legacy sans/mono keys a profile patch may carry', false, error.message);
  }

  const calls = [];
  const ctx = {
    fiber: { name: 'fiber' },
    inject: (...args) => calls.push(['inject', ...args]),
    on: (...args) => {
      calls.push(['on', ...args]);
      return () => {};
    },
    effect: (...args) => {
      calls.push(['effect', ...args]);
      return () => {};
    },
  };
  mod.apply(ctx, legacy);
  check('apply() wires no settings namespace and no index injection', calls.length === 0, JSON.stringify(calls));

  if (patchId !== undefined) {
    check('the bundle patch still mounts the ui-font entry id', patchId === 'ui-font', `patch declares ${JSON.stringify(patchId)}`);
  }
}

/**
 * Evaluate the client half in a VM with stubbed platform seeds and a Cordis
 * context, then assert the registration contract and the pure helpers.
 * @param root - plugin directory.
 * @param check - assertion collector.
 */
function probeClientHalf({ root, check }) {
  const source = readFileSync(join(root, 'client.js'), 'utf8');
  const loaded = [];
  const styleTags = [];

  const icon = () => null;
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: (initial) => ({ current: initial }),
    useMemo: (factory) => factory(),
    useCallback: (fn) => fn,
    useEffect: () => {},
    useId: () => 'contract-id',
    useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
    useReducer: (reducer, initial) => [initial, () => {}],
  };
  const primitives = {
    IconCheckOutlineRegular: icon,
    IconChevronDownOutlineRegular: icon,
    IconChevronUpOutlineRegular: icon,
    IconCloseOutlineRegular: icon,
  };
  const requireStub = (name) => {
    if (name === 'react') return React;
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
    throw new Error(`unexpected require: ${name}`);
  };

  const documentStub = {
    head: {
      appendChild: (tag) => styleTags.push(tag),
    },
    createElement: (tagName) => ({
      tagName,
      dataset: {},
      textContent: '',
      remove() {},
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const windowStub = {
    __ModuleLoader__: {
      load: (definition) => loaded.push(definition),
    },
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const sandbox = {
    window: windowStub,
    document: documentStub,
    console,
    __DSF_CONTRACT__: true,
    Node: class Node {},
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'client.js' });

  check('the client half registers one module', loaded.length === 1 && loaded[0].id === '@local/dsh-font-settings', JSON.stringify(loaded.map((entry) => entry.id)));
  if (loaded.length !== 1) return;

  const plugin = loaded[0].factory(requireStub);
  check('the client half exports apply()', typeof plugin.apply === 'function');
  check(
    'the client half injects slots, locale, theme and configForms',
    JSON.stringify(plugin.inject) === JSON.stringify(['slots', 'locale', 'theme', 'configForms']),
    JSON.stringify(plugin.inject),
  );

  const registrations = [];
  const effects = [];
  const events = [];
  const locales = [];
  const forms = [];
  const overrides = [];
  const writes = [];
  const sizes = [];

  const form = {
    set: (field, value) => {
      writes.push([field, value]);
      return Promise.resolve(true);
    },
    getSnapshot: () => ({ value: {} }),
    subscribe: () => () => {},
  };
  const snapshot = {
    preference: 'system',
    fontSizes: { text: 14, code: 11, terminal: 13 },
    fontFamilies: { text: '', code: '', terminal: '' },
    active: { id: 'light', colorScheme: 'light', tokens: {} },
    themes: [],
    revision: 0,
  };
  const ctx = {
    effect: (callback, label) => {
      const disposer = callback();
      effects.push(label);
      return () => {
        if (typeof disposer === 'function') disposer();
      };
    },
    on: (event) => {
      events.push(event);
      return () => {};
    },
    locale: {
      register: (namespace, dictionaries) => {
        locales.push([namespace, dictionaries]);
        return () => {};
      },
      bind: () => (key) => key,
      subscribe: () => () => {},
    },
    slots: {
      inject: (_key, callback) => {
        const disposer = callback();
        return typeof disposer === 'function' ? disposer : () => {};
      },
      register: (options, component) => {
        registrations.push({ options, component });
        return () => {};
      },
    },
    configForms: {
      get: (namespace) => {
        forms.push(namespace);
        return form;
      },
    },
    theme: {
      getTheme: () => snapshot,
      setFontSize: (role, px) => sizes.push([role, px]),
      overrideTokens: (source, tokens) => {
        overrides.push([source, tokens]);
        return () => {};
      },
    },
  };

  plugin.apply(ctx);

  check('the plugin injects its stylesheet with a data-plugin marker', styleTags.length === 1 && styleTags[0].dataset.plugin === '@local/dsh-font-settings', JSON.stringify(styleTags.map((tag) => tag.dataset)));
  check('the plugin registers its dictionary namespace', locales.length === 1 && locales[0][0] === 'settings.font', JSON.stringify(locales.map((entry) => entry[0])));
  check('the plugin subscribes to theme/change', events.includes('theme/change'), JSON.stringify(events));
  check('the plugin reads the ui-theme settings scope', forms.includes('ui-theme'), JSON.stringify(forms));
  check('the plugin writes no token override layer', overrides.length === 0, JSON.stringify(overrides));
  check('the plugin performs no settings write at startup', writes.length === 0, JSON.stringify(writes));

  const cell = (id) => registrations.find((entry) => entry.options.id === id);
  const sizeRow = cell('font-size');
  const fontRow = cell('font');

  check('two rows are registered into settings.general.item', registrations.length === 2 && registrations.every((entry) => entry.options.name === 'settings.general.item'), JSON.stringify(registrations.map((entry) => entry.options)));
  check(
    'the size row shadows the shipped font-size cell at priority -1',
    sizeRow !== undefined && sizeRow.options.order === 11 && sizeRow.options.priority === -1,
    JSON.stringify(sizeRow?.options),
  );
  check(
    'the font row sits between the size row and custom-css',
    fontRow !== undefined && fontRow.options.order === 11.25 && fontRow.options.priority === undefined,
    JSON.stringify(fontRow?.options),
  );
  check(
    'both rows are localized with this plugin dictionary',
    sizeRow?.options.locale === 'settings.font' && fontRow?.options.locale === 'settings.font',
    JSON.stringify([sizeRow?.options.locale, fontRow?.options.locale]),
  );

  const pure = sandbox.__DSF_PURE__;
  check('the contract seam exposes the pure helpers', pure !== undefined && typeof pure.serializeFamilies === 'function');
  if (pure === undefined) return;

  check('dictionaries have identical key sets', JSON.stringify(Object.keys(pure.zh).sort()) === JSON.stringify(Object.keys(pure.en).sort()));
  check('three roles are mirrored', JSON.stringify(ROLES) === JSON.stringify(Object.keys(pure.FAMILY_FIELDS)));
  check(
    'serialization quotes non-generic families',
    pure.serializeFamilies(['Iosevka', 'PingFang SC']) === '"Iosevka", "PingFang SC"',
    pure.serializeFamilies(['Iosevka', 'PingFang SC']),
  );
  check('serialization leaves generic families unquoted', pure.serializeFamilies(['monospace']) === 'monospace', pure.serializeFamilies(['monospace']));
  check(
    'normalization drops quotes, backslashes, angle brackets and control characters',
    pure.normalizeFamily(' A"B\\C<D\u0001E ') === 'ABCDE',
    pure.normalizeFamily(' A"B\\C<D\u0001E '),
  );
  check(
    'a stored list parses back to ordered families',
    JSON.stringify(pure.parseFamilies('"Iosevka", "PingFang SC"')) === JSON.stringify(['Iosevka', 'PingFang SC']),
    JSON.stringify(pure.parseFamilies('"Iosevka", "PingFang SC"')),
  );
  check('the six-family cap holds on parse', pure.parseFamilies('A, B, C, D, E, F, G, H').length === 6, String(pure.parseFamilies('A, B, C, D, E, F, G, H').length));
  check(
    'serialize and parse round-trip',
    JSON.stringify(pure.parseFamilies(pure.serializeFamilies(['Iosevka', 'PingFang SC', 'monospace']))) === JSON.stringify(['Iosevka', 'PingFang SC', 'monospace']),
    pure.serializeFamilies(['Iosevka', 'PingFang SC', 'monospace']),
  );
  check(
    'the mirrored size ranges match the shipped values',
    JSON.stringify(pure.SIZE_SPECS) === JSON.stringify({ text: { min: 10, max: 22 }, code: { min: 10, max: 16 }, terminal: { min: 10, max: 20 } }),
    JSON.stringify(pure.SIZE_SPECS),
  );
}

/**
 * Locate the installed DSH archive.
 * @returns the archive path, or undefined when this machine has no installation.
 */
function findDshArchive() {
  const explicit = process.env.DSH_APP_ASAR;
  if (typeof explicit === 'string' && explicit !== '' && existsSync(explicit)) return explicit;
  const mac = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar';
  return existsSync(mac) ? mac : undefined;
}

/**
 * Read one entry out of an asar archive.
 * @param archive - archive path.
 * @param parts - path segments inside the archive.
 * @returns the entry's text, or undefined when it is absent.
 */
function readAsarEntry(archive, parts) {
  const buffer = readFileSync(archive);
  const jsonLength = buffer.readUInt32LE(12);
  const header = JSON.parse(buffer.subarray(16, 16 + jsonLength).toString('utf8'));
  const dataStart = 16 + jsonLength;
  let node = header;
  for (const part of parts) {
    if (node === undefined || node.files === undefined || node.files[part] === undefined) return undefined;
    node = node.files[part];
  }
  if (node.offset === undefined) return undefined;
  const start = dataStart + Number(node.offset);
  return buffer.subarray(start, start + node.size).toString('utf8');
}

/**
 * Assert that the installed ui-theme bundle still matches everything this
 * plugin mirrors. Skipped when no DSH archive is present.
 * @param check - assertion collector.
 */
function probeUpstream(check) {
  const archive = findDshArchive();
  if (archive === undefined) {
    check(
      'ui-theme drift probe (skipped without a DSH installation)',
      true,
      'no app.asar found; set DSH_APP_ASAR to enable the check',
    );
    return;
  }

  const text = readAsarEntry(archive, [
    'dsh',
    'node_modules',
    '@deepseek-ai',
    'dsh-client-ui-theme',
    'lib',
    'client.js',
  ]);
  if (text === undefined) {
    check('the installed ui-theme bundle is readable', false, archive);
    return;
  }

  check(
    'ui-theme still defines the text/code/terminal roles',
    /FONT_ROLES\s*=\s*\[\s*"text"\s*,\s*"code"\s*,\s*"terminal"\s*\]/u.test(text),
  );
  check(
    'ui-theme family fields are unchanged',
    /text:\s*"textFontFamily"/u.test(text)
      && /code:\s*"codeFontFamily"/u.test(text)
      && /terminal:\s*"terminalFontFamily"/u.test(text),
  );

  for (const [role, [min, max, fallback]] of Object.entries(SIZE_RANGES)) {
    const pattern = new RegExp(
      `${role}:\\s*\\{\\s*field:[^,]+,\\s*variable:\\s*"[^"]+",\\s*min:\\s*${min},\\s*max:\\s*${max},\\s*default:\\s*${fallback}`,
      'u',
    );
    const ok = pattern.test(text);
    check(
      `ui-theme keeps the ${role} font-size range ${min}..${max} (default ${fallback})`,
      ok,
      ok ? undefined : 'the mirrored SIZE_SPECS in client.js no longer match the shipped bundle',
    );
  }

  const groupOrder = /family\("text"\)[\s\S]{0,120}family\("code"\)[\s\S]{0,120}size\("code"\)[\s\S]{0,120}family\("terminal"\)[\s\S]{0,120}size\("terminal"\)/u.test(text);
  check(
    'the shipped group still renders families then sizes in the mirrored order',
    groupOrder,
    groupOrder ? undefined : 'FontSettingsGroup changed shape: re-check which rows the shadowed font-size cell must redraw',
  );

  const rowRegistration = /id:\s*"font-size",\s*order:\s*11\b/u.test(text);
  check(
    'the shipped row is still registered as font-size at order 11',
    rowRegistration,
    rowRegistration ? undefined : 'the cell this plugin shadows moved; re-check the registration contract',
  );
}

/**
 * Assert the whole bundle contract.
 * @param context - `{ root, patchId, check }`.
 */
async function probePlugin({ root, patchId, check }) {
  await probeHostHalf({ root, patchId, check });
  probeClientHalf({ root, check });
  probeUpstream(check);
}

runProbe(import.meta.url, probePlugin);
