import { getAllDrawerMedia, getDrawerMedia } from "$lib/api/messaging/drawer";
import { getReceivedAlbums, getAlbumContent } from "$lib/api/messaging/albums";
import { getConversations } from "$lib/api/messaging/conversations";
import { getConversationMessages } from "$lib/api/messaging/messages";

export type ReceivedMediaItem = {
	id: string | number;
	url: string;
	contentType: "image" | "video";
	timestamp: number;
	sender?: {
		profileId?: number;
		name?: string;
		avatarUrl?: string | null;
	} | null;
	conversationId?: string | null;
	source: "chat" | "drawer" | "album";
	albumId?: number;
};

async function pMap<T, R>(
	items: T[],
	limit: number,
	mapper: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let index = 0;
	async function worker() {
		while (index < items.length) {
			const i = index++;
			try {
				results[i] = await mapper(items[i]!);
			} catch {
				// Ignore errors from individual requests
			}
		}
	}
	const workers = Array.from(
		{ length: Math.min(limit, items.length) },
		() => worker(),
	);
	await Promise.all(workers);
	return results;
}

export async function getReceivedMedia(
	ourProfileId?: number,
): Promise<ReceivedMediaItem[]> {
	const items: ReceivedMediaItem[] = [];
	const seenUrls = new Set<string>();

	// 1. Fetch Global Drawer Media
	try {
		const drawerMedia = await getAllDrawerMedia();
		for (const m of drawerMedia) {
			if (!m.url || seenUrls.has(m.url)) continue;
			seenUrls.add(m.url);
			items.push({
				id: `drawer-${m.id}`,
				url: m.url,
				contentType: m.contentType.startsWith("video/") ? "video" : "image",
				timestamp: m.createdTs,
				source: "drawer",
			});
		}
	} catch (e) {
		console.warn("Failed to load global drawer media", e);
	}

	// 2. Fetch Received Albums & Extract All Photos/Videos inside them
	try {
		const { sharedAlbums } = await getReceivedAlbums();

		// Fetch album contents concurrently (batch of 6)
		const albumContents = await pMap(sharedAlbums, 6, async (album) => {
			try {
				return await getAlbumContent(album.albumId);
			} catch {
				return null;
			}
		});

		for (let i = 0; i < sharedAlbums.length; i++) {
			const album = sharedAlbums[i]!;
			const contentResponse = albumContents[i];
			const albumSender = album.profile
				? {
						profileId: album.profile.profileId,
						name: album.profile.name ?? undefined,
						avatarUrl: album.profile.profileUrl ?? null,
					}
				: null;

			let addedForThisAlbum = false;

			// Add slides from album content response
			if (contentResponse && contentResponse.content.length > 0) {
				for (const slide of contentResponse.content) {
					const mediaUrl = slide.url || slide.thumbUrl;
					if (mediaUrl && !seenUrls.has(mediaUrl)) {
						seenUrls.add(mediaUrl);
						addedForThisAlbum = true;
						items.push({
							id: `album-${album.albumId}-slide-${slide.contentId}`,
							url: mediaUrl,
							contentType: slide.contentType.startsWith("video/")
								? "video"
								: "image",
							timestamp: album.expiresAt ?? Date.now(),
							sender: albumSender,
							source: "album",
							albumId: album.albumId,
						});
					}
				}
			}

			// Add items from paywall URLs if not already added
			if (!addedForThisAlbum && album.paywallUrls && album.paywallUrls.length > 0) {
				for (let j = 0; j < album.paywallUrls.length; j++) {
					const pUrl = album.paywallUrls[j];
					if (pUrl && !seenUrls.has(pUrl)) {
						seenUrls.add(pUrl);
						addedForThisAlbum = true;
						items.push({
							id: `album-${album.albumId}-paywall-${j}`,
							url: pUrl,
							contentType:
								pUrl.includes(".mp4") || pUrl.includes("/video")
									? "video"
									: "image",
							timestamp: album.expiresAt ?? Date.now(),
							sender: albumSender,
							source: "album",
							albumId: album.albumId,
						});
					}
				}
			}

			// Fallback to cover if nothing else could be loaded
			if (!addedForThisAlbum) {
				const cover = album.coverContent?.location;
				if (cover && !seenUrls.has(cover)) {
					seenUrls.add(cover);
					items.push({
						id: `album-${album.albumId}-cover`,
						url: cover,
						contentType:
							(album.videoCount ?? 0) > 0 && (album.imageCount ?? 0) === 0
								? "video"
								: "image",
						timestamp: album.expiresAt ?? Date.now(),
						sender: albumSender,
						source: "album",
						albumId: album.albumId,
					});
				}
			}
		}
	} catch (e) {
		console.warn("Failed to load received albums for media gallery", e);
	}

	// 3. Scan Inbox Conversations & Their Per-Conversation Drawers
	try {
		const [inboxPage1, inboxPage2] = await Promise.allSettled([
			getConversations({ page: 1 }),
			getConversations({ page: 2 }),
		]);

		const entries = [
			...(inboxPage1.status === "fulfilled"
				? inboxPage1.value.entries ?? []
				: []),
			...(inboxPage2.status === "fulfilled"
				? inboxPage2.value.entries ?? []
				: []),
		];

		await pMap(entries, 6, async (entry) => {
			const convId = entry.data.conversationId;
			const otherParticipant = entry.data.participants.find(
				(p) => ourProfileId === undefined || p.profileId !== ourProfileId,
			);
			const sender = otherParticipant
				? {
						profileId: otherParticipant.profileId,
						name: entry.data.name,
						avatarUrl: otherParticipant.primaryMediaHash ?? null,
					}
				: null;

			// 3a. Per-conversation drawer media
			try {
				const drawerMedia = await getDrawerMedia(convId);
				for (const m of drawerMedia) {
					if (!m.url || seenUrls.has(m.url)) continue;
					seenUrls.add(m.url);
					items.push({
						id: `conv-drawer-${m.id}`,
						url: m.url,
						contentType: m.contentType.startsWith("video/")
							? "video"
							: "image",
						timestamp: m.createdTs,
						sender,
						conversationId: convId,
						source: "chat",
					});
				}
			} catch {
				// Continue if drawer media fails for this conversation
			}

			// 3b. Recent messages in conversation
			try {
				const { messages } = await getConversationMessages({
					conversationId: convId,
				});

				for (const msg of messages) {
					if (ourProfileId !== undefined && msg.senderId === ourProfileId) {
						continue;
					}

					if (
						(msg.type === "Image" || msg.type === "ExpiringImage") &&
						"url" in msg.body &&
						msg.body.url
					) {
						if (!seenUrls.has(msg.body.url)) {
							seenUrls.add(msg.body.url);
							items.push({
								id: msg.messageId,
								url: msg.body.url,
								contentType: "image",
								timestamp: msg.timestamp,
								sender,
								conversationId: convId,
								source: "chat",
							});
						}
					} else if (
						(msg.type === "Video" || msg.type === "PrivateVideo") &&
						"url" in msg.body &&
						msg.body.url
					) {
						if (!seenUrls.has(msg.body.url)) {
							seenUrls.add(msg.body.url);
							items.push({
								id: msg.messageId,
								url: msg.body.url,
								contentType: "video",
								timestamp: msg.timestamp,
								sender,
								conversationId: convId,
								source: "chat",
							});
						}
					} else if (
						(msg.type === "AlbumContentReaction" ||
							msg.type === "AlbumContentReply") &&
						"previewUrl" in msg.body &&
						msg.body.previewUrl
					) {
						if (!seenUrls.has(msg.body.previewUrl)) {
							seenUrls.add(msg.body.previewUrl);
							items.push({
								id: msg.messageId,
								url: msg.body.previewUrl,
								contentType: "image",
								timestamp: msg.timestamp,
								sender,
								conversationId: convId,
								source: "chat",
							});
						}
					} else if (
						(msg.type === "Album" ||
							msg.type === "ExpiringAlbum" ||
							msg.type === "ExpiringAlbumV2") &&
						"coverUrl" in msg.body &&
						msg.body.coverUrl
					) {
						if (!seenUrls.has(msg.body.coverUrl)) {
							seenUrls.add(msg.body.coverUrl);
							items.push({
								id: msg.messageId,
								url: msg.body.coverUrl,
								contentType: "image",
								timestamp: msg.timestamp,
								sender,
								conversationId: convId,
								source: "chat",
							});
						}
					}
				}
			} catch {
				// Ignore message fetch errors for individual conversation
			}
		});
	} catch (e) {
		console.warn("Failed to load conversations for media gallery", e);
	}

	// Sort chronologically (newest first)
	items.sort((a, b) => b.timestamp - a.timestamp);

	return items;
}
