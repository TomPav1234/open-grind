<script lang="ts">
	import { goto } from "$app/navigation";
	import {
		ChatCircleDotsIcon,
		DotsThreeVerticalIcon,
		ImagesIcon,
		TrashIcon,
		UserIcon,
		VideoIcon,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { unshareAlbum } from "$lib/api/messaging/albums";
	import { openAlbumLightbox } from "$lib/components/albums/open-album";
	import DistanceFormatted from "$lib/components/profile/DistanceFormatted.svelte";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import type { SharedAlbumItem } from "$lib/model/messaging/albums";
	import { proxyMediaUrl } from "$lib/util/media";

	let {
		album,
		ondelete,
	}: {
		album: SharedAlbumItem;
		ondelete?: (albumId: number) => void;
	} = $props();

	const coverUrl = $derived(
		proxyMediaUrl(album.coverContent?.location ?? null),
	);
	const hasVideo = $derived((album.videoCount ?? 0) > 0);
	const totalItems = $derived(
		(album.imageCount ?? 0) + (album.videoCount ?? 0),
	);
	const isOnline = $derived(
		album.profile?.onlineUntil != null &&
			album.profile.onlineUntil > Date.now(),
	);

	let opening = $state(false);
	let confirmDelete = $state(false);
	let menuOpen = $state(false);

	async function handleClick() {
		if (opening || menuOpen) return;
		opening = true;
		try {
			await openAlbumLightbox(album.albumId, album);
		} finally {
			opening = false;
		}
	}

	async function handleDelete() {
		confirmDelete = false;
		try {
			// Notify parent callback immediately
			ondelete?.(album.albumId);

			// Attempt server-side unshare if counterparty is known (best effort)
			if (album.profile?.profileId) {
				try {
					await unshareAlbum({
						albumId: album.albumId,
						profileIds: [album.profile.profileId],
					});
				} catch {
					// Ignore API error since counterparty unshare may only work owner->receiver
				}
			}

			toast.success("Album rimosso dai ricevuti");
		} catch (err) {
			console.error("Failed to remove received album", err);
			toast.error("Impossibile rimuovere l'album");
		}
	}
</script>

<div
	role="button"
	tabindex="0"
	class={[
		"group relative isolate flex aspect-3/4 flex-col justify-between overflow-hidden rounded-2xl border border-border/40 bg-card shadow-xs transition-all select-none",
		{
			"ring-2 ring-accent ring-offset-2 ring-offset-background":
				album.hasUnseenContent,
			"cursor-pointer hover:border-border hover:shadow-md active:scale-[0.98]":
				!opening,
			"opacity-75": opening,
		},
	]}
	onclick={handleClick}
	onkeydown={(e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			void handleClick();
		}
	}}
>
	<!-- Cover Image -->
	<MediaImage
		src={coverUrl}
		loading="lazy"
		class="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
		imgClass="bg-card-foreground/10"
	/>

	<!-- Top Bar: Badges & Action Menu -->
	<div class="z-2 flex w-full items-center justify-between p-2">
		<div class="flex items-center gap-1.5">
			<div
				class="flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2 py-0.5 text-2xs font-semibold text-white backdrop-blur-md"
			>
				<ImagesIcon weight="fill" class="size-3.5" />
				<span>{totalItems}</span>
				{#if hasVideo}
					<span class="mx-0.5 opacity-40">|</span>
					<VideoIcon weight="fill" class="size-3.5 text-amber-400" />
					<span>{album.videoCount}</span>
				{/if}
			</div>

			{#if album.hasUnseenContent}
				<Badge
					class="bg-accent px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wider text-accent-foreground shadow-xs"
				>
					Nuovo
				</Badge>
			{/if}
		</div>

		<!-- Action Menu Button -->
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
				<DropdownMenu.Content align="end" class="w-48">
					{#if album.profile?.profileId}
						<DropdownMenu.Item
							onSelect={() =>
								void goto(`/profile/${album.profile?.profileId}`)}
						>
							<UserIcon class="mr-2 size-4" />
							Visualizza profilo
						</DropdownMenu.Item>
						<DropdownMenu.Item
							onSelect={() =>
								void goto(`/chat/${album.profile?.profileId}`)}
						>
							<ChatCircleDotsIcon class="mr-2 size-4" />
							Apri chat
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
					{/if}
					<DropdownMenu.Item
						variant="destructive"
						onSelect={() => (confirmDelete = true)}
					>
						<TrashIcon class="mr-2 size-4" />
						Elimina dai ricevuti
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>

	<!-- Bottom Scrim & Profile Info -->
	<div
		class="z-2 mt-auto flex w-full flex-col gap-1.5 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-3 pt-8 text-white"
	>
		{#if album.name}
			<h3
				class="truncate text-sm font-semibold tracking-tight text-white drop-shadow-xs"
			>
				{album.name}
			</h3>
		{/if}

		{#if album.profile}
			<div class="flex items-center justify-between gap-1.5">
				<a
					href="/profile/{album.profile.profileId}"
					class="flex min-w-0 items-center gap-1.5 hover:underline"
					onclick={(e) => e.stopPropagation()}
				>
					<div class="relative shrink-0">
						{#if album.profile.profileUrl}
							<img
								src={proxyMediaUrl(album.profile.profileUrl)}
								alt=""
								class="size-6 rounded-full object-cover ring-1 ring-white/30"
							/>
						{:else}
							<div
								class="flex size-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white ring-1 ring-white/30"
							>
								{album.profile.name?.slice(0, 1) ?? "U"}
							</div>
						{/if}
						{#if isOnline}
							<span
								class="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-emerald-400 ring-1 ring-black"
								title="Online"
							></span>
						{/if}
					</div>

					<span class="truncate text-xs font-medium text-white/90">
						{album.profile.name ?? "Utente"}
					</span>
				</a>

				{#if album.profile.distanceKm != null}
					<span class="shrink-0 text-3xs text-white/70">
						<DistanceFormatted
							distance={album.profile.distanceKm * 1000}
						/>
					</span>
				{/if}
			</div>
		{/if}
	</div>
</div>

<!-- Confirmation Alert Dialog -->
<AlertDialog.Root bind:open={confirmDelete}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Rimuovere l'album?</AlertDialog.Title>
			<AlertDialog.Description>
				Questo album verrà rimosso dai tuoi album ricevuti. Potrai comunque
				chiederne una nuova condivisione nella chat con l'utente.
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
