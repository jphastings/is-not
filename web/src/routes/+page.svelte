<script lang="ts">
	import { fade } from 'svelte/transition';
	import { directionPhrase } from '$lib/tags';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let i = $state(0);

	$effect(() => {
		const id = setInterval(() => {
			i = (i + 1) % data.tags.length;
		}, 15000);
		return () => clearInterval(id);
	});
</script>

<svelte:head>
	<title>is/not</title>
</svelte:head>

<main>
	{#if data.tags.length === 0}
		<p class="sentence">Nobody has said anything yet.</p>
	{:else}
		{#key i}
			<p class="sentence" transition:fade>
				<span>@{data.tags[i].handle || data.tags[i].did}</span> thinks
				<span>{data.tags[i].title}</span>
				{directionPhrase(data.tags[i].direction)}
				<span>{data.tags[i].adjective}</span>
			</p>
		{/key}
	{/if}
</main>

<style>
	main {
		height: 100vh;
		display: grid;
		place-items: center;
		padding: 1rem;
	}

	.sentence {
		font-size: clamp(1.5rem, 5vw, 4rem);
		font-weight: 700;
		text-align: center;
		max-width: 60ch;
	}
</style>
