<script lang="ts">
	import { PlayIcon, ImagesIcon } from "phosphor-svelte";

	import type { ReceivedMediaItem } from "$lib/api/messaging/received-media";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { profileMediaUrl, proxyMediaUrl } from "$lib/util/media";

	let {
		item,
		onclick,
	}: {
		item: ReceivedMediaItem;
		onclick: () => void;
	} = $props();

	const isVideo = $derived(item.contentType === "video");
	const isAlbum = $derived(item.source === "album");
	const mediaUrl = $derived(proxyMediaUrl(item.url));
</script>

<div
	role="button"
	tabindex="0"
	class="group relative isolate aspect-square overflow-hidden rounded-xl border border-border/40 bg-card shadow-2xs transition-all cursor-pointer hover:border-border hover:shadow-sm active:scale-95 select-none"
	{onclick}
	onkeydown={(e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onclick();
		}
	}}
>
	<MediaImage
		src={mediaUrl}
		loading="lazy"
		class="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
		imgClass="bg-card-foreground/10"
	/>

	<!-- Video Play Overlay / Indicator -->
	{#if isVideo}
		<div
			class="absolute inset-0 z-1 flex items-center justify-center bg-black/25 transition-colors group-hover:bg-black/35"
		>
			<div
				class="flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-xs ring-1 ring-white/20"
			>
				<PlayIcon weight="fill" class="size-4 translate-x-0.5" />
			</div>
		</div>
	{/if}

	<!-- Source / Type Badges -->
	<div class="absolute top-1.5 right-1.5 z-2 flex items-center gap-1">
		{#if isAlbum}
			<div
				class="flex size-5 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-xs ring-1 ring-white/20"
				title="Da un album"
			>
				<ImagesIcon weight="fill" class="size-3" />
			</div>
		{/if}
	</div>

	<!-- Sender Info Overlay -->
	{#if item.sender}
		<div
			class="absolute inset-x-0 bottom-0 z-2 flex items-center justify-between gap-1 bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-4 text-white"
		>
			<div class="flex min-w-0 items-center gap-1">
				{#if item.sender.avatarUrl}
					{@const avatarSrc = item.sender.avatarUrl.startsWith("http")
						? proxyMediaUrl(item.sender.avatarUrl)
						: profileMediaUrl({ mediaHash: item.sender.avatarUrl, size: "thumb" })}
					<img
						src={avatarSrc}
						alt=""
						class="size-4 rounded-full object-cover ring-1 ring-white/30"
					/>
				{/if}
				{#if item.sender.name}
					<span class="truncate text-3xs font-medium text-white/90">
						{item.sender.name}
					</span>
				{/if}
			</div>
		</div>
	{/if}
</div>
