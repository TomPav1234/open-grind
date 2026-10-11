<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import {
		ArrowLeftIcon,
		ArrowUUpLeftIcon,
		ImagesIcon,
		PlusIcon,
		UserIcon,
		VideoIcon,
	} from "phosphor-svelte";
	import { untrack } from "svelte";
	import { toast } from "svelte-sonner";

	import { getMyAlbumsState } from "$lib/albums/my-albums-state.svelte";
	import {
		clearDismissedReceivedAlbums,
		dismissReceivedAlbum,
		getDismissedAlbumIds,
		restoreReceivedAlbum,
	} from "$lib/albums/dismissed-albums";
	import { getReceivedAlbums } from "$lib/api/messaging/albums";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import AddTile from "$lib/components/shared/AddTile.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import ScrollToTopButton from "$lib/components/shared/ScrollToTopButton.svelte";
	import { Button } from "$lib/components/ui/button";
	import Skeleton from "$lib/components/ui/skeleton/skeleton.svelte";
	import type { SharedAlbumItem } from "$lib/model/messaging/albums";
	import EmptyAlbumsList from "./EmptyAlbumsList.svelte";
	import MyAlbumCard from "./MyAlbumCard.svelte";
	import ReceivedAlbumCard from "./ReceivedAlbumCard.svelte";

	const { data }: import("./$types").PageProps = $props();

	type TabMode = "received" | "mine";
	type FilterMode = "all" | "online" | "video";

	const initialTab =
		page.url.searchParams.get("tab") === "mine" ? "mine" : "received";
	let activeTab = $state<TabMode>(initialTab);
	let activeFilter = $state<FilterMode>("all");

	// Received albums state
	let loadingReceived = $state(true);
	let refreshing = $state(false);
	let receivedError = $state<Error | null>(null);
	let rawReceivedAlbums = $state<SharedAlbumItem[]>([]);
	let dismissedIds = $state<Set<number>>(new Set());

	// My albums state
	const myAlbums = untrack(() => getMyAlbumsState(data.ourProfileId));
	const atAlbumCap = $derived(
		myAlbums.albums !== null &&
			myAlbums.maxAlbums !== null &&
			myAlbums.albums.length >= myAlbums.maxAlbums,
	);

	let container: HTMLDivElement | null = $state(null);

	async function loadReceived() {
		try {
			receivedError = null;
			dismissedIds = getDismissedAlbumIds();
			const res = await getReceivedAlbums();
			rawReceivedAlbums = res.sharedAlbums ?? [];
		} catch (err) {
			console.error("Failed to load received albums", err);
			receivedError = err instanceof Error ? err : new Error(String(err));
		} finally {
			loadingReceived = false;
			refreshing = false;
		}
	}

	async function handleRefresh() {
		refreshing = true;
		if (activeTab === "received") {
			await loadReceived();
		} else {
			await myAlbums.refresh();
			refreshing = false;
		}
	}

	$effect(() => {
		void loadReceived();
		void myAlbums.refresh();
	});

	// Filter out dismissed received albums
	const activeReceivedAlbums = $derived(
		rawReceivedAlbums.filter((a) => !dismissedIds.has(a.albumId)),
	);

	const filteredReceivedAlbums = $derived.by(() => {
		if (activeFilter === "online") {
			return activeReceivedAlbums.filter(
				(a) =>
					a.profile?.onlineUntil != null &&
					a.profile.onlineUntil > Date.now(),
			);
		}
		if (activeFilter === "video") {
			return activeReceivedAlbums.filter((a) => (a.videoCount ?? 0) > 0);
		}
		return activeReceivedAlbums;
	});

	function handleDeleteReceived(albumId: number) {
		dismissReceivedAlbum(albumId);
		dismissedIds = getDismissedAlbumIds();
		toast.success("Album rimosso dai ricevuti", {
			action: {
				label: "Annulla",
				onClick: () => {
					restoreReceivedAlbum(albumId);
					dismissedIds = getDismissedAlbumIds();
				},
			},
		});
	}

	function handleRestoreAllDismissed() {
		clearDismissedReceivedAlbums();
		dismissedIds = new Set();
		toast.success("Tutti gli album nascosti sono stati ripristinati");
	}

	function handleBack() {
		if (window.navigation?.canGoBack ?? history.length > 1) {
			history.back();
		} else {
			void goto("/chat");
		}
	}
</script>

<svelte:head>
	<title>{activeTab === "received" ? "Album Ricevuti" : "I miei album"} - Open Grind</title>
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
		<!-- Top Bar -->
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
				<h1 class="text-lg font-semibold tracking-tight text-foreground">
					Album
				</h1>
			</div>

			<!-- Quick Create Album Button when in My Albums tab -->
			{#if activeTab === "mine" && !atAlbumCap}
				<Button
					href="/settings/albums/new"
					size="sm"
					class="h-8 gap-1.5 rounded-full px-3 text-xs font-semibold"
				>
					<PlusIcon weight="bold" class="size-4" />
					Nuovo album
				</Button>
			{/if}
		</div>

		<!-- Segmented Tab Switcher -->
		<div class="flex rounded-xl bg-muted/60 p-1">
			<button
				type="button"
				class={[
					"flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all select-none cursor-pointer",
					activeTab === "received"
						? "bg-background text-foreground shadow-xs"
						: "text-muted-foreground hover:text-foreground",
				]}
				onclick={() => (activeTab = "received")}
			>
				<ImagesIcon weight={activeTab === "received" ? "fill" : "bold"} class="size-4" />
				<span>Ricevuti</span>
				{#if !loadingReceived && activeReceivedAlbums.length > 0}
					<span
						class="rounded-full bg-muted px-1.5 py-0.2 text-3xs font-bold"
					>
						{activeReceivedAlbums.length}
					</span>
				{/if}
			</button>

			<button
				type="button"
				class={[
					"flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all select-none cursor-pointer",
					activeTab === "mine"
						? "bg-background text-foreground shadow-xs"
						: "text-muted-foreground hover:text-foreground",
				]}
				onclick={() => (activeTab = "mine")}
			>
				<UserIcon weight={activeTab === "mine" ? "fill" : "bold"} class="size-4" />
				<span>I miei album</span>
				{#if myAlbums.albums !== null && myAlbums.albums.length > 0}
					<span
						class="rounded-full bg-muted px-1.5 py-0.2 text-3xs font-bold"
					>
						{myAlbums.albums.length}
					</span>
				{/if}
			</button>
		</div>

		<!-- Filter Pills for Received Tab -->
		{#if activeTab === "received"}
			<div class="flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
				<div class="flex items-center gap-1.5">
					<Button
						variant={activeFilter === "all" ? "secondary" : "ghost"}
						size="sm"
						class={[
							"h-7 rounded-full px-3 text-xs font-medium",
							{
								"bg-foreground text-background hover:bg-foreground/90":
									activeFilter === "all",
							},
						]}
						onclick={() => (activeFilter = "all")}
					>
						Tutti
					</Button>

					<Button
						variant={activeFilter === "online" ? "secondary" : "ghost"}
						size="sm"
						class={[
							"h-7 gap-1.5 rounded-full px-3 text-xs font-medium",
							{
								"bg-foreground text-background hover:bg-foreground/90":
									activeFilter === "online",
							},
						]}
						onclick={() => (activeFilter = "online")}
					>
						<span class="size-2 rounded-full bg-emerald-500"></span>
						Online
					</Button>

					<Button
						variant={activeFilter === "video" ? "secondary" : "ghost"}
						size="sm"
						class={[
							"h-7 gap-1.5 rounded-full px-3 text-xs font-medium",
							{
								"bg-foreground text-background hover:bg-foreground/90":
									activeFilter === "video",
							},
						]}
						onclick={() => (activeFilter = "video")}
					>
						<VideoIcon weight="bold" class="size-3.5" />
						Con video
					</Button>
				</div>

				{#if dismissedIds.size > 0}
					<Button
						variant="ghost"
						size="sm"
						class="h-7 gap-1 rounded-full px-2 text-3xs text-muted-foreground hover:text-foreground"
						onclick={handleRestoreAllDismissed}
						title="Ripristina album rimossi"
					>
						<ArrowUUpLeftIcon class="size-3.5" />
						Ripristina ({dismissedIds.size})
					</Button>
				{/if}
			</div>
		{/if}
	</ProgressiveBlur>

	<!-- Main Scroller -->
	<div bind:this={container} class="pull-scroller">
		<div
			class="mx-auto flex min-h-overscrollable w-full max-w-160 flex-col px-4 pt-header-clear-28 pb-nav-clear"
		>
			{#if activeTab === "received"}
				<!-- Received Albums Tab Content -->
				{#if loadingReceived}
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{#each Array(6)}
							<Skeleton class="aspect-3/4 w-full rounded-2xl" />
						{/each}
					</div>
				{:else if receivedError && activeReceivedAlbums.length === 0}
					<div class="flex flex-1 items-center justify-center py-12">
						<ApiErrorDisplay
							error={receivedError}
							onRetry={() => void loadReceived()}
							class="m-auto"
						/>
					</div>
				{:else if filteredReceivedAlbums.length === 0}
					<EmptyAlbumsList mode="received" />
				{:else}
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{#each filteredReceivedAlbums as album (album.albumId)}
							<ReceivedAlbumCard
								{album}
								ondelete={handleDeleteReceived}
							/>
						{/each}
					</div>
				{/if}
			{:else}
				<!-- My Personal Albums Tab Content -->
				{#if myAlbums.albums === null && myAlbums.error === null}
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{#each Array(6)}
							<Skeleton class="aspect-3/4 w-full rounded-2xl" />
						{/each}
					</div>
				{:else if myAlbums.error && (myAlbums.albums === null || myAlbums.albums.length === 0)}
					<div class="flex flex-1 items-center justify-center py-12">
						<ApiErrorDisplay
							error={myAlbums.error}
							onRetry={() => void myAlbums.reload()}
							class="m-auto"
						/>
					</div>
				{:else if myAlbums.albums && myAlbums.albums.length === 0}
					<EmptyAlbumsList mode="mine" />
				{:else if myAlbums.albums}
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{#if !atAlbumCap}
							<AddTile
								href="/settings/albums/new"
								label="Crea album"
								class="aspect-3/4 rounded-2xl"
							/>
						{/if}
						{#each myAlbums.albums as album (album.albumId)}
							<MyAlbumCard
								{album}
								ourProfileId={data.ourProfileId}
							/>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</div>

	<DataRefreshControl
		{container}
		updating={refreshing}
		position="top"
		onrefresh={handleRefresh}
	/>

	<ScrollToTopButton {container} class="bottom-nav-clear" />
</div>
