import z from "zod";

import { fetchRest } from "$lib/api/transport";
import {
	albumContentSchema,
	albumDetailsSchema,
	type AlbumExpirationType,
	albumMinSchema,
	type AlbumShareRequest,
	albumSharesResponseSchema,
	type AlbumUnshareRequest,
	myAlbumsResponseSchema,
	pressieAlbumsFeedResponseSchema,
	type PressieAlbumsFeedResponse,
	pressieAlbumsPaywallResponseSchema,
	type PressieAlbumsPaywallResponse,
	type SharedAlbumItem,
} from "$lib/model/messaging/albums";

const albumResponseSchema = z.object({
	...albumMinSchema.shape,
	...albumDetailsSchema.shape,
	content: z.array(
		z.object({
			...albumContentSchema.shape,
			remainingViews: z.int().optional(),
		}),
	),
});

export async function getAlbumContent(albumId: number) {
	return await fetchRest(`/v2/albums/${albumId}`).then((res) =>
		res.jsonParsed(albumResponseSchema),
	);
}

export type AlbumContentResponse = Awaited<ReturnType<typeof getAlbumContent>>;

export async function getMyAlbums() {
	return await fetchRest("/v1/albums").then((res) =>
		res.jsonParsed(myAlbumsResponseSchema),
	);
}

export async function shareAlbum({
	albumId,
	profileIds,
	expirationType = "INDEFINITE",
}: {
	albumId: number;
	profileIds: number[];
	expirationType?: AlbumExpirationType;
}) {
	await fetchRest(`/v4/albums/${albumId}/shares`, {
		method: "POST",
		body: {
			profiles: profileIds.map((profileId) => ({
				profileId,
				expirationType,
			})),
		} satisfies AlbumShareRequest,
	}).then((res) => res.assertOk());
}

export async function getAlbumShares(albumId: number) {
	return await fetchRest(`/v1/albums/${albumId}/shares`).then((res) =>
		res.jsonParsed(albumSharesResponseSchema),
	);
}

export async function unshareAlbum({
	albumId,
	profileIds,
}: {
	albumId: number;
	profileIds: number[];
}) {
	await fetchRest(`/v1/albums/${albumId}/unshares`, {
		method: "PUT",
		body: {
			profiles: profileIds.map((profileId) => ({
				profileId,
				shareId: crypto.randomUUID(),
			})),
		} satisfies AlbumUnshareRequest,
	}).then((res) => res.assertOk());
}

export type ReceivedAlbumsFilterRequest = {
	isFavorite?: boolean;
	isOnline?: boolean;
	onlyVideo?: boolean;
	blur?: boolean;
};

export async function getReceivedAlbums(
	filters?: ReceivedAlbumsFilterRequest,
): Promise<{
	sharedAlbums: SharedAlbumItem[];
	profileFeeds?: unknown[];
}> {
	const [feedResult, paywallResult] = await Promise.allSettled([
		fetchRest("/v3/pressie-albums/feed", {
			method: "POST",
			body: filters ?? {},
		}).then((res) => res.jsonParsed(pressieAlbumsFeedResponseSchema)),
		fetchRest("/v3/pressie-albums/feed/paywall/", {
			method: "POST",
			body: {},
		}).then((res) => res.jsonParsed(pressieAlbumsPaywallResponseSchema)),
	]);

	const feed = feedResult.status === "fulfilled" ? feedResult.value : null;
	const paywall =
		paywallResult.status === "fulfilled" ? paywallResult.value : null;

	const albumsMap = new Map<number, SharedAlbumItem>();

	// Add albums from normal feed
	for (const album of feed?.sharedAlbums ?? []) {
		albumsMap.set(album.albumId, album);
	}

	// Add albums from paywall endpoint (bypassing free tier 5-album limit)
	for (const item of paywall?.albumPaywallContent ?? []) {
		if (!albumsMap.has(item.albumId)) {
			albumsMap.set(item.albumId, {
				albumId: item.albumId,
				albumViewable: true,
				albumVersion: 1,
				expiresAt: null,
				name: null,
				ownerProfileId: item.profile?.profileId ?? null,
				imageCount:
					item.albumsItemCount ?? item.paywallUrls?.length ?? 1,
				videoCount: 0,
				hasUnseenContent: false,
				coverContent: {
					id: null,
					contentType: "image/jpeg",
					location: item.paywallCoverUrl,
					status: "APPROVED",
				},
				profile: item.profile,
			});
		}
	}

	return {
		sharedAlbums: Array.from(albumsMap.values()),
		profileFeeds: feed?.profileFeeds ?? [],
	};
}
