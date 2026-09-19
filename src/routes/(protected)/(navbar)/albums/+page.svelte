<script lang="ts">
	import { goto } from "$app/navigation";
	import { ArrowLeftIcon, VideoIcon } from "phosphor-svelte";

	import { getReceivedAlbums } from "$lib/api/messaging/albums";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import ScrollToTopButton from "$lib/components/shared/ScrollToTopButton.svelte";
	import { Button } from "$lib/components/ui/button";
	import Skeleton from "$lib/components/ui/skeleton/skeleton.svelte";
	import type { SharedAlbumItem } from "$lib/model/messaging/albums";
	import EmptyAlbumsList from "./EmptyAlbumsList.svelte";
	import ReceivedAlbumCard from "./ReceivedAlbumCard.svelte";

	type FilterMode = "all" | "online" | "video";

	let loading = $state(true);
	let refreshing = $state(false);
	let error = $state<Error | null>(null);
	let albums = $state<SharedAlbumItem[]>([]);
	let activeFilter = $state<FilterMode>("all");
	let container: HTMLDivElement | null = $state(null);

	async function loadAlbums() {
		try {
			error = null;
			const res = await getReceivedAlbums();
			albums = res.sharedAlbums ?? [];
		} catch (err) {
			console.error("Failed to load received albums", err);
			error = err instanceof Error ? err : new Error(String(err));
		} finally {
			loading = false;
			refreshing = false;
		}
	}

	async function handleRefresh() {
		refreshing = true;
		await loadAlbums();
	}

	$effect(() => {
		void loadAlbums();
	});

	const filteredAlbums = $derived.by(() => {
		if (activeFilter === "online") {
			return albums.filter(
				(a) =>
					a.profile?.onlineUntil != null &&
					a.profile.onlineUntil > Date.now(),
			);
		}
		if (activeFilter === "video") {
			return albums.filter((a) => (a.videoCount ?? 0) > 0);
		}
		return albums;
	});

	function handleBack() {
		if (window.navigation?.canGoBack ?? history.length > 1) {
			history.back();
		} else {
			void goto("/chat");
		}
	}
</script>

<svelte:head>
	<title>Album Ricevuti - Open Grind</title>
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
				<div class="flex items-center gap-2">
					<h1 class="text-lg font-semibold tracking-tight text-foreground">
						Album Ricevuti
					</h1>
					{#if !loading && albums.length > 0}
						<span
							class="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
						>
							{albums.length}
						</span>
					{/if}
				</div>
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
				variant={activeFilter === "online" ? "secondary" : "ghost"}
				size="sm"
				class={["h-7.5 gap-1.5 rounded-full px-3 text-xs font-medium", {
					"bg-foreground text-background hover:bg-foreground/90":
						activeFilter === "online",
				}]}
				onclick={() => (activeFilter = "online")}
			>
				<span class="size-2 rounded-full bg-emerald-500"></span>
				Online
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
				Con video
			</Button>
		</div>
	</ProgressiveBlur>

	<!-- Main Scroller -->
	<div bind:this={container} class="pull-scroller">
		<div
			class="mx-auto flex min-h-overscrollable w-full max-w-160 flex-col px-4 pt-header-clear-20 pb-nav-clear"
		>
			{#if loading}
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{#each Array(6)}
						<Skeleton class="aspect-3/4 w-full rounded-2xl" />
					{/each}
				</div>
			{:else if error && albums.length === 0}
				<div class="flex flex-1 items-center justify-center py-12">
					<ApiErrorDisplay
						{error}
						onRetry={() => void loadAlbums()}
						class="m-auto"
					/>
				</div>
			{:else if filteredAlbums.length === 0}
				<EmptyAlbumsList />
			{:else}
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{#each filteredAlbums as album (album.albumId)}
						<ReceivedAlbumCard {album} />
					{/each}
				</div>
			{/if}
		</div>
	</div>

	{#if !loading && (albums.length > 0 || !error)}
		<DataRefreshControl
			{container}
			updating={refreshing}
			position="top"
			onrefresh={handleRefresh}
		/>
	{/if}

	<ScrollToTopButton {container} class="bottom-nav-clear" />
</div>
