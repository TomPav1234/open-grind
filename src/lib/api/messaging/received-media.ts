import { getAllDrawerMedia, type DrawerMedia } from "$lib/api/messaging/drawer";
import { getReceivedAlbums } from "$lib/api/messaging/albums";
import { getConversations } from "$lib/api/messaging/conversations";
import { getConversationMessages } from "$lib/api/messaging/messages";
import type { Message } from "$lib/model/messaging/messages";

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

export async function getReceivedMedia(ourProfileId?: number): Promise<ReceivedMediaItem[]> {
	const items: ReceivedMediaItem[] = [];
	const seenUrls = new Set<string>();

	// 1. Fetch Drawer Media
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
		console.warn("Failed to load drawer media", e);
	}

	// 2. Fetch Received Albums (including paywalled albums exceeding the 5-album limit)
	try {
		const { sharedAlbums } = await getReceivedAlbums();
		for (const album of sharedAlbums) {
			const coverUrl = album.coverContent?.location;
			if (!coverUrl || seenUrls.has(coverUrl)) continue;
			seenUrls.add(coverUrl);
			items.push({
				id: `album-${album.albumId}`,
				url: coverUrl,
				contentType: (album.videoCount ?? 0) > 0 && (album.imageCount ?? 0) === 0 ? "video" : "image",
				timestamp: album.expiresAt ?? Date.now(),
				sender: album.profile
					? {
							profileId: album.profile.profileId,
							name: album.profile.name ?? undefined,
							avatarUrl: album.profile.profileUrl ?? null,
						}
					: null,
				source: "album",
				albumId: album.albumId,
			});
		}
	} catch (e) {
		console.warn("Failed to load received albums for media gallery", e);
	}

	// 3. Scan recent inbox conversations for media messages
	try {
		const inbox = await getConversations({ page: 1 });
		const recentConversations = (inbox.entries ?? []).slice(0, 8);

		await Promise.allSettled(
			recentConversations.map(async (entry) => {
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

				try {
					const { messages } = await getConversationMessages({
						conversationId: convId,
					});

					for (const msg of messages) {
						if (ourProfileId !== undefined && msg.senderId === ourProfileId) {
							continue;
						}

						if (msg.type === "Image" && "url" in msg.body && msg.body.url) {
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
							msg.type === "Video" &&
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
						}
					}
				} catch {}
			}),
		);
	} catch (e) {
		console.warn("Failed to load conversations for media gallery", e);
	}

	// Sort chronologically (newest first)
	items.sort((a, b) => b.timestamp - a.timestamp);

	return items;
}
