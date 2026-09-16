<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';
	import AccountMenu from '$lib/AccountMenu.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header class="site">
	{#if page.url.pathname !== '/'}
		<a class="home display" href="/">{m.home()}</a>
	{:else}
		<span></span>
	{/if}
	<AccountMenu accounts={data.accounts} current={data.current} avatar={data.avatar} />
</header>

{@render children()}

<style>
	.site {
		padding: var(--space-4) var(--space-5);
		display: flex;
		justify-content: space-between;
		align-items: center;
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
