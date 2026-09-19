import { DAY, demoMeProfileId, NOW } from "../config";
import { picsum, unsplash } from "./avatars";

function localDateTime(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 19);
}

const UNSPLASH_COVER_BLUR = 30;
const UNSPLASH_ALBUM_COVERS = new Map([[5004, "1645973342475-e9fcd3fc0d39"]]);

export function albumCoverUrl(albumId: number): string {
	const photo = UNSPLASH_ALBUM_COVERS.get(albumId);
	if (photo) {
		return unsplash({
			photo,
			width: 300,
			height: 400,
			blur: UNSPLASH_COVER_BLUR,
		});
	}
	return picsum({ seed: `album-${albumId}-cover`, width: 300, height: 400 });
}

const ALBUMS_WITH_VIDEO = new Set([5001, 5004]);

export function demoAlbumContent(albumId: number) {
	const count = 3 + (albumId % 3);
	const content = Array.from({ length: count }, (_, i) => {
		const thumb = picsum({
			seed: `album-${albumId}-${i}`,
			width: 300,
			height: 400,
		});
		const video = ALBUMS_WITH_VIDEO.has(albumId) && i === count - 1;
		return {
			contentId: albumId * 100 + i,
			contentType: video ? "video/mp4" : "image/jpeg",
			coverUrl: thumb,
			statusId: 1,
			thumbUrl: thumb,
			url: picsum({ seed: `album-${albumId}-${i}` }),
			processing: false,
			rejectionId: null,
		};
	});
	return {
		albumId,
		hasUnseenContent: false,
		albumName: null,
		profileId: demoMeProfileId,
		albumViewable: true,
		sharedCount: 1,
		createdAt: localDateTime(NOW - 3 * DAY),
		updatedAt: localDateTime(NOW - DAY),
		content,
	};
}

const FIRST_ALBUM_ID = 900;
const demoSharedWithProfileId = 100001;

const demoAlbumSeeds = [
	{ albumName: "Weekend trip" },
	{ albumName: "Gym progress", hasVideo: true, shared: true },
	{ albumName: null, isShareable: false },
	{ albumName: "Studio", shared: true },
];

const albumShares = new Map<number, Set<number>>(
	demoAlbumSeeds.flatMap((seed, i) =>
		seed.shared
			? [[FIRST_ALBUM_ID + i, new Set([demoSharedWithProfileId])]]
			: [],
	),
);

export function demoShareAlbum({
	albumId,
	profileIds,
}: {
	albumId: number;
	profileIds: number[];
}): void {
	const shared = albumShares.get(albumId) ?? new Set<number>();
	for (const profileId of profileIds) shared.add(profileId);
	albumShares.set(albumId, shared);
}

export function demoUnshareAlbum({
	albumId,
	profileIds,
}: {
	albumId: number;
	profileIds: number[];
}): void {
	const shared = albumShares.get(albumId);
	if (shared === undefined) return;
	for (const profileId of profileIds) shared.delete(profileId);
}

export function demoAlbumShares(albumId: number): number[] {
	return [...(albumShares.get(albumId) ?? [])];
}

export function demoMyAlbums() {
	return {
		albums: demoAlbumSeeds.map((seed, i) => {
			const albumId = FIRST_ALBUM_ID + i;
			const album = demoAlbumContent(albumId);
			return {
				...album,
				albumName: seed.albumName,
				version: 1,
				isShareable: seed.isShareable ?? true,
				sharedCount:
					album.sharedCount + (albumShares.get(albumId)?.size ?? 0),
				content: album.content.map((item, j) =>
					seed.hasVideo && j === 0
						? { ...item, contentType: "video/mp4" }
						: item,
				),
			};
		}),
	};
}

export function demoReceivedAlbums() {
	return {
		profileFeeds: [],
		sharedAlbums: [
			{
				albumId: 900,
				albumViewable: true,
				albumVersion: 1,
				expiresAt: null,
				name: "Vacation Photos",
				ownerProfileId: 100001,
				imageCount: 4,
				videoCount: 1,
				hasUnseenContent: true,
				coverContent: {
					id: 1,
					contentType: "image/jpeg",
					location: albumCoverUrl(900),
					status: "APPROVED",
				},
				profile: {
					profileId: 100001,
					name: "Marco",
					profileUrl: null,
					onlineUntil: Date.now() + 600000,
					distanceKm: 0.8,
				},
			},
			{
				albumId: 901,
				albumViewable: true,
				albumVersion: 1,
				expiresAt: null,
				name: "Gym & Workout",
				ownerProfileId: 100002,
				imageCount: 6,
				videoCount: 0,
				hasUnseenContent: false,
				coverContent: {
					id: 2,
					contentType: "image/jpeg",
					location: albumCoverUrl(901),
					status: "APPROVED",
				},
				profile: {
					profileId: 100002,
					name: "Alex",
					profileUrl: null,
					onlineUntil: Date.now() - 3600000,
					distanceKm: 2.4,
				},
			},
		],
	};
}

export function demoPaywalledAlbums() {
	return {
		albumPaywallContent: [
			{
				albumId: 902,
				profile: {
					profileId: 100003,
					name: "Lorenzo",
					profileUrl: null,
					onlineUntil: Date.now() + 1200000,
					distanceKm: 1.2,
				},
				paywallCoverUrl: albumCoverUrl(902),
				paywallUrls: [albumCoverUrl(902)],
				albumsItemCount: 5,
			},
			{
				albumId: 903,
				profile: {
					profileId: 100004,
					name: "Matteo",
					profileUrl: null,
					onlineUntil: Date.now() - 7200000,
					distanceKm: 4.8,
				},
				paywallCoverUrl: albumCoverUrl(903),
				paywallUrls: [albumCoverUrl(903)],
				albumsItemCount: 8,
			},
			{
				albumId: 904,
				profile: {
					profileId: 100005,
					name: "Davide",
					profileUrl: null,
					onlineUntil: Date.now() + 300000,
					distanceKm: 0.3,
				},
				paywallCoverUrl: albumCoverUrl(904),
				paywallUrls: [albumCoverUrl(904)],
				albumsItemCount: 3,
			},
			{
				albumId: 905,
				profile: {
					profileId: 100006,
					name: "Andrea",
					profileUrl: null,
					onlineUntil: Date.now() - 1800000,
					distanceKm: 3.1,
				},
				paywallCoverUrl: albumCoverUrl(905),
				paywallUrls: [albumCoverUrl(905)],
				albumsItemCount: 12,
			},
		],
	};
}
