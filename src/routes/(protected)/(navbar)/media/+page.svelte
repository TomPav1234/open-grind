<script lang="ts">
	import { goto } from "$app/navigation";
	import {
		ArrowLeftIcon,
		ImageIcon,
		VideoIcon,
	} from "phosphor-svelte";

	import {
		getReceivedMedia,
		type ReceivedMediaItem,
	} from "$lib/api/messaging/received-media";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import ScrollToTopButton from "$lib/components/shared/ScrollToTopButton.svelte";
	import { Button } from "$lib/components/ui/button";
	import Skeleton from "$lib/components/ui/skeleton/skeleton.svelte";
	import { openMediaLightbox } from "$lib/components/media/open-media";
	import EmptyMediaList from "./EmptyMediaList.svelte";
	import ReceivedMediaTile from "./ReceivedMediaTile.svelte";

	let { data }: import("./$types").PageProps = $props();

	type FilterMode = "all" | "image" | "video";

	let loading = $state(true);
	let refreshing = $state(false);
	let error = $state<Error | null>(null);
	let mediaItems = $state<ReceivedMediaItem[]>([]);
	let activeFilter = $state<FilterMode>("all");
	let container: HTMLDivElement | null = $state(null);

	async function loadMedia() {
		try {
			error = null;
			mediaItems = await getReceivedMedia(data.ourProfileId);
		} catch (err) {
			console.error("Failed to load received media", err);
			error = err instanceof Error ? err : new Error(String(err));
		} finally {
			loading = false;
			refreshing = false;
		}
	}

	async function handleRefresh() {
		refreshing = true;
		await loadMedia();
	}

	$effect(() => {
		void loadMedia();
	});

	const filteredMedia = $derived.by(() => {
		if (activeFilter === "image") {
			return mediaItems.filter((m) => m.contentType === "image");
		}
		if (activeFilter === "video") {
			return mediaItems.filter((m) => m.contentType === "video");
		}
		return mediaItems;
	});

	function handleBack() {
		if (window.navigation?.canGoBack ?? history.length > 1) {
			history.back();
		} else {
			void goto("/chat");
		}
	}

	function handleOpenMedia(index: number) {
		void openMediaLightbox(filteredMedia, index);
	}
</script>

<svelte:head>
	<title>Media Ricevuti - Open Grind</title>
</svelte:head>

<div class="screen-nav-host">
	<!-- Top Sticky Header -->
	<ProgressiveBlur
		direction="topToBottom"
		data-fixed-header
		class="fixed inset-x-0 top-0 z-20"
		bgClass="bg-linear-to-b from-background via-background/90 to-transparent"
		contentClass="flex flex-col gap-2.5 px-4 pt-fixed-header pb-2 max-w-160 mx-auto w-full"
	>
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					class="size-9 rounded-full"
					onclick={handleBack}
					aria-label="Torna indietro"
				>
					<ArrowLeftIcon weight="bold" class="size-5" />
				</Button>

				<!-- Section Navigation Tabs -->
				<div
					class="flex items-center rounded-full bg-muted/80 p-0.5 text-xs ring-1 ring-border/50"
				>
					<a
						href="/albums"
						class="rounded-full px-3 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
					>
						Album
					</a>
					<span
						class="rounded-full bg-background px-3 py-1 font-semibold text-foreground shadow-xs"
					>
						Media
					</span>
				</div>

				{#if !loading && mediaItems.length > 0}
					<span
						class="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
					>
						{mediaItems.length}
					</span>
				{/if}
			</div>
		</div>

		<!-- Filter Pills -->
		<div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
			<Button
				variant={activeFilter === "all" ? "secondary" : "ghost"}
				size="sm"
				class={["h-7.5 rounded-full px-3 text-xs font-medium", {
					"bg-foreground text-background hover:bg-foreground/90":
						activeFilter === "all",
				}]}
				onclick={() => (activeFilter = "all")}
			>
				Tutti
			</Button>

			<Button
				variant={activeFilter === "image" ? "secondary" : "ghost"}
				size="sm"
				class={["h-7.5 gap-1.5 rounded-full px-3 text-xs font-medium", {
					"bg-foreground text-background hover:bg-foreground/90":
						activeFilter === "image",
				}]}
				onclick={() => (activeFilter = "image")}
			>
				<ImageIcon weight="bold" class="size-3.5" />
				Solo foto
			</Button>

			<Button
				variant={activeFilter === "video" ? "secondary" : "ghost"}
				size="sm"
				class={["h-7.5 gap-1.5 rounded-full px-3 text-xs font-medium", {
					"bg-foreground text-background hover:bg-foreground/90":
						activeFilter === "video",
				}]}
				onclick={() => (activeFilter = "video")}
			>
				<VideoIcon weight="bold" class="size-3.5" />
				Solo video
			</Button>
		</div>
	</ProgressiveBlur>

	<!-- Main Scroller -->
	<div bind:this={container} class="pull-scroller">
		<div
			class="mx-auto flex min-h-overscrollable w-full max-w-160 flex-col px-4 pt-header-clear-20 pb-nav-clear"
		>
			{#if loading}
				<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
					{#each Array(15)}
						<Skeleton class="aspect-square w-full rounded-xl" />
					{/each}
				</div>
			{:else if error && mediaItems.length === 0}
				<div class="flex flex-1 items-center justify-center py-12">
					<ApiErrorDisplay
						{error}
						onRetry={() => void loadMedia()}
						class="m-auto"
					/>
				</div>
			{:else if filteredMedia.length === 0}
				<EmptyMediaList />
			{:else}
				<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
					{#each filteredMedia as item, i (item.id)}
						<ReceivedMediaTile
							{item}
							onclick={() => handleOpenMedia(i)}
						/>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	{#if !loading && (mediaItems.length > 0 || !error)}
		<DataRefreshControl
			{container}
			updating={refreshing}
			position="top"
			onrefresh={handleRefresh}
		/>
	{/if}

	<ScrollToTopButton {container} class="bottom-nav-clear" />
</div>
