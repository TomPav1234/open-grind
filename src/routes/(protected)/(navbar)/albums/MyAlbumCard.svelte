<script lang="ts">
	import { goto } from "$app/navigation";
	import {
		DotsThreeVerticalIcon,
		ImagesIcon,
		PencilSimpleIcon,
		TrashIcon,
		UsersIcon,
		VideoIcon,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { getMyAlbumsState } from "$lib/albums/my-albums-state.svelte";
	import { deleteAlbum } from "$lib/api/messaging/albums";
	import {
		albumCoverContent,
		albumDisplayName,
		readyAlbumMedia,
	} from "$lib/components/album/album";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import type { MyAlbum } from "$lib/model/messaging/albums";
	import { proxyMediaUrl } from "$lib/util/media";

	let {
		album,
		ourProfileId,
	}: {
		album: MyAlbum;
		ourProfileId: number;
	} = $props();

	const coverMedia = $derived(albumCoverContent(album.content));
	const coverUrl = $derived(proxyMediaUrl(coverMedia?.thumbUrl ?? null));
	const readyMedia = $derived(readyAlbumMedia(album.content));
	const myAlbums = $derived(getMyAlbumsState(ourProfileId));

	let confirmDelete = $state(false);
	let deleting = $state(false);
	let menuOpen = $state(false);

	function handleClick() {
		if (menuOpen || deleting) return;
		void goto(`/settings/albums/${album.albumId}`);
	}

	async function handleDelete() {
		deleting = true;
		confirmDelete = false;
		try {
			await deleteAlbum({ albumId: album.albumId });
			myAlbums.remove(album.albumId);
			toast.success("Album eliminato con successo");
		} catch (err) {
			console.error("Failed to delete album", err);
			toast.error("Impossibile eliminare l'album");
		} finally {
			deleting = false;
		}
	}
</script>

<div
	role="button"
	tabindex="0"
	class={[
		"group relative isolate flex aspect-3/4 flex-col justify-between overflow-hidden rounded-2xl border border-border/40 bg-card shadow-xs transition-all select-none cursor-pointer hover:border-border hover:shadow-md active:scale-[0.98]",
		{ "opacity-50 pointer-events-none": deleting },
	]}
	onclick={handleClick}
	onkeydown={(e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			handleClick();
		}
	}}
>
	<!-- Cover Image -->
	{#if coverUrl}
		<MediaImage
			src={coverUrl}
			loading="lazy"
			class="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
			imgClass="bg-card-foreground/10"
		/>
	{:else}
		<div
			class="absolute inset-0 flex items-center justify-center bg-muted/40 text-muted-foreground"
		>
			<ImagesIcon class="size-10 opacity-30" />
		</div>
	{/if}

	<!-- Top Bar: Media Count & Menu -->
	<div class="z-2 flex w-full items-center justify-between p-2">
		<div class="flex items-center gap-1.5">
			<div
				class="flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2 py-0.5 text-2xs font-semibold text-white backdrop-blur-md"
			>
				<ImagesIcon weight="fill" class="size-3.5" />
				<span>{readyMedia.count}</span>
				{#if readyMedia.hasVideo}
					<span class="mx-0.5 opacity-40">|</span>
					<VideoIcon weight="fill" class="size-3.5 text-amber-400" />
				{/if}
			</div>

			{#if album.sharedCount > 0}
				<div
					class="flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2 py-0.5 text-2xs font-semibold text-white backdrop-blur-md"
				>
					<UsersIcon weight="fill" class="size-3" />
					<span>{album.sharedCount}</span>
				</div>
			{/if}
		</div>

		<!-- Action Menu -->
		<div onclick={(e) => e.stopPropagation()} role="none">
			<DropdownMenu.Root bind:open={menuOpen}>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon"
							class="size-7.5 rounded-full border border-white/15 bg-black/60 text-white backdrop-blur-md hover:bg-black/80 hover:text-white"
							aria-label="Opzioni album"
						>
							<DotsThreeVerticalIcon weight="bold" class="size-4" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-44">
					<DropdownMenu.Item
						onSelect={() =>
							void goto(`/settings/albums/${album.albumId}`)}
					>
						<PencilSimpleIcon class="mr-2 size-4" />
						Modifica album
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item
						variant="destructive"
						onSelect={() => (confirmDelete = true)}
					>
						<TrashIcon class="mr-2 size-4" />
						Elimina album
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>

	<!-- Bottom Scrim & Name -->
	<div
		class="z-2 mt-auto flex w-full flex-col gap-1 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-3 pt-8 text-white"
	>
		<h3
			class="truncate text-sm font-semibold tracking-tight text-white drop-shadow-xs"
		>
			{albumDisplayName(album.albumName)}
		</h3>
		<span class="text-3xs text-white/70">
			{readyMedia.count} {readyMedia.count === 1 ? "elemento" : "elementi"}
		</span>
	</div>
</div>

<!-- Confirmation Alert Dialog -->
<AlertDialog.Root bind:open={confirmDelete}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Eliminare l'album?</AlertDialog.Title>
			<AlertDialog.Description>
				Questo album e tutti i suoi contenuti verranno eliminati
				definitivamente. Chiunque abbia accesso non potrà più visualizzarlo.
				Questa operazione non può essere annullata.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg">Annulla</AlertDialog.Cancel>
			<AlertDialog.Action
				variant="destructive"
				size="lg"
				onclick={handleDelete}
			>
				Elimina
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
