<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';
	import AccountMenu from '$lib/AccountMenu.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const imagePath = $derived(page.data.ogImage ?? '/og.png');
	const description = $derived(page.data.description ?? m.meta_home());
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta property="og:site_name" content={m.site_title()} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={`${page.data.origin}${page.url.pathname}`} />
	<meta property="og:image" content={`${page.data.origin}${imagePath}`} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="description" content={description} />
	<meta property="og:description" content={description} />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<header class="site">
	{#if page.url.pathname !== '/'}
		<a class="home display" href="/"><img class="logo" src={favicon} alt="" />{m.home()}</a>
	{:else}
		<span></span>
	{/if}
	<AccountMenu accounts={data.accounts} current={data.current} avatar={data.avatar} />
</header>

{@render children()}

<style>
	.site {
		box-sizing: border-box;
		height: var(--header-height);
		padding: 0 var(--space-5);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.home {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--moss-deep);
		text-decoration: none;
		font-size: var(--step-1);
	}

	.home:hover {
		text-decoration: underline;
	}

	.logo {
		height: 1.2em;
		width: auto;
	}
</style>
