import "photoswipe/style.css";

import { showErrorToast } from "$lib/api/error-toast";
import {
	type AlbumContentResponse,
	getAlbumContent,
} from "$lib/api/messaging/albums";
import type { SharedAlbumItem } from "$lib/model/messaging/albums";
import { now } from "$lib/util/clock";
import { proxyMediaUrl } from "$lib/util/media";
import {
	measureImage,
	measureVideo,
	type MediaDimensions,
} from "$lib/util/media-dimensions";
import {
	applyPhotoSwipeBackGesture,
	applyPhotoSwipeErrorUi,
	applyPhotoSwipeVideo,
	applyPhotoSwipeViewportSync,
} from "$lib/util/photoswipe";

type LoadedAlbum = AlbumContentResponse & {
	content: (AlbumContentResponse["content"][number] & MediaDimensions)[];
};

const ALBUM_MEMO_TTL_MS = 10 * 60 * 1000;
const cachedAlbums = new Map<number, { album: LoadedAlbum; time: number }>();

export async function openAlbumLightbox(
	albumId: number,
	fallbackAlbum?: SharedAlbumItem | null,
): Promise<void> {
	try {
		const cached = cachedAlbums.get(albumId);
		let loaded: LoadedAlbum | null = null;

		if (cached && now() - cached.time < ALBUM_MEMO_TTL_MS) {
			loaded = cached.album;
		} else {
			try {
				const album = await getAlbumContent(albumId);
				if (album && album.content && album.content.length > 0) {
					loaded = {
						...album,
						content: await Promise.all(
							album.content.map(async (slide) => {
								const kind = slide.contentType.startsWith("video/")
									? "video"
									: "image";
								const rawUrl = slide.url || slide.thumbUrl;
								const url = proxyMediaUrl(rawUrl, { as: kind });
								const coverUrl = proxyMediaUrl(slide.coverUrl);
								const measurable = { video: coverUrl, image: url }[kind];
								let dims: MediaDimensions = { width: 800, height: 1000 };
								try {
									dims =
										measurable === null
											? await measureVideo(url)
											: await measureImage(measurable);
								} catch {}
								return {
									...slide,
									url,
									coverUrl,
									...dims,
								};
							}),
						),
					};
					cachedAlbums.set(albumId, { album: loaded, time: now() });
				}
			} catch (e) {
				console.warn(`Failed to fetch /v2/albums/${albumId}`, e);
			}
		}

		// If album has no content (e.g. old / expired album or 403 / paywalled past limit), check fallbackAlbum
		if (!loaded || loaded.content.length === 0) {
			const fallbackSlides: (AlbumContentResponse["content"][number] & MediaDimensions)[] = [];

			if (fallbackAlbum?.paywallUrls && fallbackAlbum.paywallUrls.length > 0) {
				for (let i = 0; i < fallbackAlbum.paywallUrls.length; i++) {
					const rawUrl = fallbackAlbum.paywallUrls[i];
					if (!rawUrl) continue;
					const isVideo = rawUrl.includes(".mp4") || rawUrl.includes("/video");
					const kind = isVideo ? "video" : "image";
					const url = proxyMediaUrl(rawUrl, { as: kind });
					let dims: MediaDimensions = { width: 800, height: 1000 };
					try {
						dims = isVideo ? await measureVideo(url) : await measureImage(url);
					} catch {}
					fallbackSlides.push({
						contentId: i + 1,
						contentType: isVideo ? "video/mp4" : "image/jpeg",
						coverUrl: url,
						thumbUrl: url,
						url,
						statusId: 1,
						processing: false,
						rejectionId: null,
						...dims,
					});
				}
			} else if (fallbackAlbum?.coverContent?.location) {
				const rawUrl = fallbackAlbum.coverContent.location;
				const isVideo =
					(fallbackAlbum.videoCount ?? 0) > 0 &&
					(fallbackAlbum.imageCount ?? 0) === 0;
				const kind = isVideo ? "video" : "image";
				const url = proxyMediaUrl(rawUrl, { as: kind });
				let dims: MediaDimensions = { width: 800, height: 1000 };
				try {
					dims = isVideo ? await measureVideo(url) : await measureImage(url);
				} catch {}
				fallbackSlides.push({
					contentId: 1,
					contentType: isVideo ? "video/mp4" : "image/jpeg",
					coverUrl: url,
					thumbUrl: url,
					url,
					statusId: 1,
					processing: false,
					rejectionId: null,
					...dims,
				});
			}

			if (fallbackSlides.length > 0) {
				loaded = {
					albumId,
					albumName: fallbackAlbum?.name ?? null,
					profileId: fallbackAlbum?.profile?.profileId ?? 0,
					albumViewable: true,
					hasUnseenContent: false,
					sharedCount: 0,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					content: fallbackSlides,
				};
			}
		}

		if (!loaded || loaded.content.length === 0) {
			showErrorToast({ label: "L'album è vuoto" });
			return;
		}

		const { default: PhotoSwipeLightbox } = await import("photoswipe/lightbox");
		const lightbox = new PhotoSwipeLightbox({
			showHideAnimationType: "fade",
			pswpModule: () => import("photoswipe"),
			mainClass: "pswp--buttons-visible",
		});

		applyPhotoSwipeErrorUi(lightbox);
		applyPhotoSwipeViewportSync(lightbox);
		lightbox.addFilter("numItems", () => loaded.content.length);
		lightbox.addFilter("itemData", (itemData, index) => {
			const slide = loaded.content[index];
			if (slide === undefined) return itemData;
			return {
				src: slide.url,
				width: slide.width,
				height: slide.height,
			};
		});
		applyPhotoSwipeBackGesture(lightbox);
		applyPhotoSwipeVideo(lightbox, (index) => {
			const slide = loaded.content[index];
			if (!slide?.contentType.startsWith("video/")) return null;
			return { src: slide.url, poster: slide.coverUrl };
		});

		lightbox.init();
		lightbox.loadAndOpen(0);
	} catch (error) {
		console.error("Failed to open album", error);
		showErrorToast({ label: "Impossibile aprire l'album", error });
	}
}
