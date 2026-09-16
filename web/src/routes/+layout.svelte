<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if page.url.pathname !== '/'}
	<header class="site">
		<a class="home display" href="/">{m.home()}</a>
	</header>
{/if}

{@render children()}

<style>
	.site {
		padding: var(--space-4) var(--space-5);
	}

	.home {
		color: var(--moss-deep);
		text-decoration: none;
		font-size: var(--step-1);
	}

	.home:hover {
		text-decoration: underline;
	}
</style>
