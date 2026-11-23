/**
 * The legacy page's translator, ported: data-page text (built in English from the figures) is matched
 * against the migrated phrase dictionary, with country and food names as [N1].. and numbers as [1]..
 * placeholders, exactly as the legacy I18N block did. Dictionaries load only for non-English languages.
 */
type Dict = Record<string, string>;

const phraseLoaders = import.meta.glob<{ default: Dict }>('../../../../locales/*/legacy.json');
const nameLoaders = import.meta.glob<{ default: Dict }>('../../../../locales/*/names.json');

interface Translator {
  tr: (text: string) => string | null;
}
const cache = new Map<string, Promise<Translator>>();

export function loadTranslator(lang: string): Promise<Translator> | null {
  if (lang === 'en') return null;
  let p = cache.get(lang);
  if (!p) {
    p = (async () => {
      const [T, NM] = await Promise.all([
        phraseLoaders[`../../../../locales/${lang}/legacy.json`]!().then((m) => m.default),
        nameLoaders[`../../../../locales/${lang}/names.json`]!().then((m) => m.default),
      ]);
      const list = Object.keys(NM)
        .sort((a, b) => b.length - a.length)
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const RE = new RegExp(
        '(?<!\\p{L})(' +
          list.join('|') +
          ')(?!\\p{L})|((?:US\\$\\s?|KES\\s)?[-+−]?\\d(?:[\\d,.]*\\d)?(?:\\s?(?:Mt|kt|bn|kcal|ha|%)(?!\\p{L})|(?:m|k|t|g)(?!\\p{L}))?)',
        'gu',
      );
      const nameTr = (n: string) => {
        const t = NM[n];
        if (!t || t === n) return n;
        return /^\p{Ll}/u.test(n) && lang !== 'ar' ? t.charAt(0).toLowerCase() + t.slice(1) : t;
      };
      const memo = new Map<string, string | null>();
      const tr = (text: string): string | null => {
        if (memo.has(text)) return memo.get(text)!;
        const names: string[] = [];
        const nums: string[] = [];
        const key = text.replace(RE, (_x, nm: string | undefined, d: string | undefined) => {
          if (nm) {
            names.push(nm);
            return `[N${names.length}]`;
          }
          nums.push(d!);
          return `[${nums.length}]`;
        });
        let out: string | null = null;
        const fill = (s: string) =>
          s.replace(/\[N(\d+)\]/g, (_x, k) => nameTr(names[+k - 1]!)).replace(/\[(\d+)\]/g, (_x, k) => nums[+k - 1]!);
        if (/^[[\]N\d,;/·\s]+$/.test(key) && names.length) out = fill(key);
        else if (T[key]) out = fill(T[key]!);
        if (memo.size > 20000) memo.clear();
        memo.set(text, out);
        return out;
      };
      return { tr };
    })();
    cache.set(lang, p);
  }
  return p;
}

const EN = new WeakMap<Node, string>();
const SKIP = /^(SCRIPT|STYLE|TEXTAREA|OPTION)$/;

/** Translate every text node and placeholder under `root`; remembers the English so it can switch back. */
export function translateTree(root: Element, t: Translator | null) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      SKIP.test(n.parentNode?.nodeName ?? '') || (n.parentElement && n.parentElement.closest('[data-no-tr]')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let n: Node | null;
  while ((n = walker.nextNode())) {
    let en = EN.get(n);
    if (en === undefined) {
      if (!/\p{L}/u.test(n.nodeValue ?? '')) continue;
      en = n.nodeValue ?? '';
      EN.set(n, en);
    }
    const k = en.trim();
    let v = en;
    if (t && k) {
      const x = t.tr(k);
      if (x != null) v = en.replace(k, x);
    }
    if (n.nodeValue !== v) n.nodeValue = v;
  }
}

/** Record a React-driven text change as the new English source for that node. */
export function noteEnglish(n: Node) {
  EN.set(n, n.nodeValue ?? '');
}
