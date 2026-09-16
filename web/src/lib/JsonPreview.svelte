<script module lang="ts">
  /** Stands in for a value the record doesn't have yet: rendered as a bare `???`. */
  export const MISSING = Symbol('missing');
  /** Stands in for an object the record doesn't have yet: rendered as `{ ??? }`. */
  export const MISSING_OBJECT = Symbol('missing object');
</script>

<script lang="ts">
  type Kind = 'key' | 'string' | 'number' | 'literal' | 'punct' | 'ws' | 'invalid';
  type Token = { text: string; kind: Kind; path: string };

  let { value }: { value: unknown } = $props();

  const join = (path: string, segment: string) => (path === '' ? segment : `${path}/${segment}`);
  const indent = (depth: number) => '  '.repeat(depth);

  function emit(v: unknown, path: string, depth: number, out: Token[]) {
    if (v === MISSING || v === MISSING_OBJECT) {
      out.push({ text: v === MISSING ? '???' : '{ ??? }', kind: 'invalid', path });
      return;
    }
    if (v === null || typeof v !== 'object') {
      const kind: Kind =
        typeof v === 'string' ? 'string' : typeof v === 'number' ? 'number' : 'literal';
      out.push({ text: JSON.stringify(v), kind, path });
      return;
    }
    const isArray = Array.isArray(v);
    const entries: [string, unknown][] = isArray
      ? (v as unknown[]).map((item, i) => [String(i), item])
      : Object.entries(v as Record<string, unknown>);
    out.push({ text: isArray ? '[' : '{', kind: 'punct', path });
    entries.forEach(([key, item], i) => {
      out.push({ text: '\n' + indent(depth + 1), kind: 'ws', path });
      const childPath = join(path, key);
      if (!isArray) {
        out.push({ text: JSON.stringify(key), kind: 'key', path: childPath });
        out.push({ text: ':', kind: 'punct', path });
        out.push({ text: ' ', kind: 'ws', path });
      }
      emit(item, childPath, depth + 1, out);
      if (i < entries.length - 1) out.push({ text: ',', kind: 'punct', path });
    });
    if (entries.length > 0) out.push({ text: '\n' + indent(depth), kind: 'ws', path });
    out.push({ text: isArray ? ']' : '}', kind: 'punct', path });
  }

  // Walks previous/next together rather than diffing rendered text, so a
  // change is a path (`tags/0/adjective`), not a line number.
  function diffPaths(a: unknown, b: unknown, path: string, out: Set<string>) {
    if (a === b) return;
    const aObj = a !== null && typeof a === 'object';
    const bObj = b !== null && typeof b === 'object';
    if (!aObj || !bObj) {
      out.add(path);
      return;
    }
    const aArr = Array.isArray(a);
    const bArr = Array.isArray(b);
    if (aArr !== bArr) {
      out.add(path);
      return;
    }
    if (aArr && bArr) {
      for (let i = Math.min(a.length, b.length); i < Math.max(a.length, b.length); i++) {
        out.add(join(path, String(i)));
      }
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        diffPaths(a[i], b[i], join(path, String(i)), out);
      }
      return;
    }
    const aRec = a as Record<string, unknown>;
    const bRec = b as Record<string, unknown>;
    for (const key of new Set([...Object.keys(aRec), ...Object.keys(bRec)])) {
      const childPath = join(path, key);
      if (!(key in aRec) || !(key in bRec)) out.add(childPath);
      else diffPaths(aRec[key], bRec[key], childPath, out);
    }
  }

  const tokens = $derived.by(() => {
    const out: Token[] = [];
    emit(value, '', 0, out);
    return out;
  });

  // Rendered as block-level lines, like a diff: a change tints the whole line.
  const lines = $derived.by(() => {
    const out: { tokens: Token[]; changed: boolean }[] = [{ tokens: [], changed: false }];
    for (const token of tokens) {
      if (token.kind === 'ws' && token.text.startsWith('\n')) {
        out.push({ tokens: [{ ...token, text: token.text.slice(1) }], changed: false });
        continue;
      }
      const line = out[out.length - 1];
      line.tokens.push(token);
      if (token.kind !== 'ws' && isChanged(token.path)) line.changed = true;
    }
    return out;
  });

  // Plain (non-reactive) closure state: the previous value to diff against,
  // updated from the effect below rather than tracked by Svelte itself.
  let previous: unknown;
  let hasPrevious = false;
  let changed = $state<Set<string>>(new Set());

  $effect(() => {
    const next = value;
    const paths = new Set<string>();
    if (hasPrevious) diffPaths(previous, next, '', paths);
    changed = paths;
    hasPrevious = true;
    // $state.snapshot, not structuredClone: a value that arrived through $state is a proxy, which cannot be cloned.
    previous = $state.snapshot(next);
  });

  function isChanged(path: string): boolean {
    for (const c of changed) {
      if (path === c || path.startsWith(c + '/')) return true;
    }
    return false;
  }
</script>

<pre><code
  >{#each lines as line, i (i)}<span class="line" class:changed={line.changed}
      >{#each line.tokens as token, j (j)}<span class={token.kind}>{token.text}</span>{/each}</span
    >{/each}</code
></pre>

<style>
  pre {
    margin: 0;
    padding: var(--space-4) 0;
    background: var(--moss-tint);
    border-radius: 14px;
    overflow-x: auto;
    font-size: var(--step--1);
    white-space: pre;
  }

  .key {
    color: var(--moss-deep);
  }

  .string {
    color: var(--ink);
  }

  .number,
  .literal {
    color: var(--moss);
  }

  /* Deliberately not JSON: the record can't be written until this is filled in. */
  .invalid {
    color: var(--ink-soft);
    font-style: italic;
  }

  .punct {
    color: var(--ink-soft);
  }

  .line {
    display: block;
    box-sizing: border-box;
    min-width: 100%;
    width: max-content;
    padding-inline: var(--space-4);
  }

  /* A diff's added line: the tint says "this just changed" without touching the text. */
  .line.changed {
    background: color-mix(in oklch, var(--moss) 22%, var(--moss-tint));
  }
</style>
