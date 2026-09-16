<script lang="ts">
  type Kind = 'key' | 'string' | 'number' | 'literal' | 'punct' | 'ws';
  type Token = { text: string; kind: Kind; path: string };

  let { value }: { value: unknown } = $props();

  const join = (path: string, segment: string) => (path === '' ? segment : `${path}/${segment}`);
  const indent = (depth: number) => '  '.repeat(depth);

  function emit(v: unknown, path: string, depth: number, out: Token[]) {
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
  >{#each tokens as token, i (i)}<span
      class={token.kind}
      class:changed={token.kind !== 'ws' && isChanged(token.path)}>{token.text}</span
    >{/each}</code
></pre>

<style>
  pre {
    margin: 0;
    padding: var(--space-4);
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

  .punct {
    color: var(--ink-soft);
  }

  .changed {
    text-decoration: underline;
    text-decoration-color: var(--moss);
    text-decoration-thickness: 0.12em;
    text-underline-offset: 0.15em;
  }
</style>
