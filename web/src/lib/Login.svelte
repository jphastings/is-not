<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';

  // Verified as atproto authorization servers; a handle typed above reaches any
  // other PDS, since the client resolves it before redirecting.
  const services = [
    { name: 'Bluesky', pds: 'https://bsky.social', logo: '/pds/bluesky.png' },
    { name: 'Eurosky', pds: 'https://eurosky.social', logo: '/pds/eurosky.png' },
    { name: 'Blacksky', pds: 'https://blacksky.app', logo: '/pds/blacksky.png' },
    { name: 'Northsky', pds: 'https://northsky.social', logo: '/pds/northsky.png' },
  ];
</script>

<div class="login">
  <p class="heading">{m.login_heading()}</p>
  <div class="entry">
    <input
      form="login-form"
      name="handle"
      autocapitalize="none"
      autocorrect="off"
      spellcheck="false"
      placeholder={m.login_placeholder()}
      aria-label={m.login_heading()}
    />
    <button form="login-form" class="pill small">{m.login_continue()}</button>
  </div>

  <p class="or"><span>{m.login_or()}</span></p>

  <ul class="services">
    {#each services as service (service.pds)}
      <li>
        <button
          form="login-form"
          name="pds"
          value={service.pds}
          title={m.login_on({ service: service.name })}
        >
          <img src={service.logo} alt="" width="28" height="28" />
          <span>{service.name}</span>
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .login {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
    background: var(--paper);
    border: 1px solid var(--moss-tint);
    border-radius: 18px;
    box-shadow: 0 10px 40px oklch(22% 0.03 140 / 0.12);
    font-family: var(--font-body);
    font-size: var(--step-0);
    font-weight: 400;
    text-align: start;
    min-width: min(20rem, 80vw);
  }

  .heading {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: var(--step-1);
  }

  .entry {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .entry input {
    flex: 1 1 10rem;
    min-width: 0;
    font: inherit;
    padding: var(--space-2) var(--space-3);
    background: var(--paper);
    border: 1px solid var(--ink-soft);
    border-radius: 10px;
    color: inherit;
  }

  .or {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin: 0;
    color: var(--ink-soft);
  }

  .or::before,
  .or::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--moss-tint);
  }

  .services {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);
  }

  .services button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    font: inherit;
    color: inherit;
    background: var(--paper);
    border: 1px solid var(--moss-tint);
    border-radius: 12px;
    cursor: pointer;
  }

  .services button:hover {
    border-color: var(--moss);
    background: var(--moss-tint);
  }

  img {
    border-radius: 6px;
    flex: none;
  }
</style>
