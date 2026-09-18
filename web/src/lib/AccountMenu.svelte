<script lang="ts">
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages.js';
  import Login from '$lib/Login.svelte';

  type Account = { did: string; handle: string };

  let {
    accounts,
    current,
    avatar,
  }: {
    accounts: Account[];
    current: Account | null;
    avatar: Promise<string | null> | null;
  } = $props();
</script>

<button
  type="button"
  class="avatar"
  popovertarget={current ? 'accounts-popover' : 'login-popover'}
  aria-label={current ? m.account_menu() : m.sign_in()}
>
  {#if avatar}
    {#await avatar}
      <span class="at">@</span>
    {:then url}
      {#if url}
        <img src={url} alt="" width="36" height="36" />
      {:else}
        <span class="at">@</span>
      {/if}
    {:catch}
      <span class="at">@</span>
    {/await}
  {:else}
    <span class="at">@</span>
  {/if}
</button>

<div id="login-popover" popover="auto"><Login /></div>

{#if current}
  <div id="accounts-popover" popover="auto">
    <ul class="accounts">
      {#each accounts as account (account.did)}
        <li class:current={account.did === current.did}>
          {#if account.did === current.did}
            <a href={`/reviews/${account.did}`} class="account">
              @{account.handle || account.did}
            </a>
          {:else}
            <button form="switch-form" name="did" value={account.did} class="account">
              @{account.handle || account.did}
            </button>
          {/if}
          <button
            form="logout-form"
            name="did"
            value={account.did}
            class="signout"
            aria-label={m.sign_out()}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M4 4 12 12M12 4 4 12" />
            </svg>
          </button>
        </li>
      {/each}
      <li class="another">
        <button type="button" popovertarget="login-popover">{m.sign_in()}</button>
      </li>
    </ul>
  </div>
{/if}

<form id="login-form" method="POST" action="/oauth/login" hidden></form>
<form id="switch-form" method="POST" action="/oauth/switch" hidden>
  <input type="hidden" name="next" value={page.url.pathname} />
</form>
<form id="logout-form" method="POST" action="/oauth/logout" hidden>
  <input type="hidden" name="next" value={page.url.pathname} />
</form>

<style>
  .avatar {
    width: 2.25rem;
    height: 2.25rem;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    overflow: hidden;
    border: 1px solid var(--moss-tint);
    padding: 0;
    background: var(--moss-tint);
    cursor: pointer;
  }

  .avatar:hover {
    border-color: var(--moss);
  }

  .avatar:focus-visible {
    outline: 2px solid var(--moss);
    outline-offset: 2px;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .at {
    color: var(--moss);
    font-family: var(--font-display);
    font-weight: 700;
  }

  [popover] {
    border: 0;
    padding: 0;
    background: none;
    overflow: visible;
  }

  [popover]::backdrop {
    background: oklch(22% 0.03 140 / 0.3);
  }

  /* Anchored to whichever button opened it (the corner avatar or the handle
     slot in ReviewForm's sentence): a popover's invoker is its implicit anchor.
     Centred beneath it, and slid back inside the viewport (less its margin)
     when centring would push it off an edge. Without anchor positioning it
     stays centred as a dialog. */
  @supports (anchor-name: --a) {
    #accounts-popover {
      position: absolute;
      position-area: bottom span-all;
      justify-self: anchor-center;
      position-try-fallbacks: flip-block;
      margin: var(--space-2) var(--space-3) 0;
    }

    #accounts-popover::backdrop {
      background: none;
    }
  }

  .accounts {
    list-style: none;
    margin: 0;
    padding: var(--space-2);
    display: grid;
    gap: var(--space-1);
    min-width: max-content;
    background: var(--paper);
    border: 1px solid var(--moss-tint);
    border-radius: 14px;
    box-shadow: var(--shadow);
    font-family: var(--font-body);
    font-size: var(--step-0);
    font-weight: 400;
    text-align: start;
  }

  /* One box per row: the outer corners are rounded and the halves inside it are
     clipped flush against each other. */
  .accounts li {
    display: flex;
    align-items: stretch;
    min-height: 2.75rem;
    border-radius: 10px;
    overflow: hidden;
  }

  .accounts li.current {
    background: var(--moss-tint);
  }

  .accounts button,
  .accounts a {
    font: inherit;
    letter-spacing: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
    text-decoration: none;
  }

  .accounts .account {
    flex: 1;
    display: flex;
    align-items: center;
    text-align: start;
  }

  .accounts li.current .account {
    font-weight: 700;
  }

  /* The whole right of the row. Square by explicit width rather than
     aspect-ratio, which contributes nothing to the panel's intrinsic width and
     so used to push the cross outside it. */
  .accounts .signout {
    display: grid;
    place-items: center;
    width: 2.75rem;
    padding: 0;
    color: var(--ink-soft);
  }

  /* A fraction of that square, so the cross sits the same distance from the
     top, right and bottom edges. */
  .accounts .signout svg {
    width: 40%;
    height: 40%;
    fill: none;
    stroke: currentcolor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  /* Paper flips with the theme, so half of it over the row reads as lighter on
     light and darker on dark. The tint this used to use is the selected row's
     own colour, which left the cross invisible on exactly the row it matters. */
  .accounts .signout:hover {
    color: var(--ink);
    background: color-mix(in oklch, var(--paper) 50%, transparent);
  }

  .accounts .another button {
    color: var(--moss-deep);
    width: 100%;
    text-align: start;
  }
</style>
