import "photoswipe/style.css";

import { showErrorToast } from "$lib/api/error-toast";
import {
	type AlbumContentResponse,
	getAlbumContent,
} from "$lib/api/messaging/albums";
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

export async function openAlbumLightbox(albumId: number): Promise<void> {
	try {
		const cached = cachedAlbums.get(albumId);
		let loaded: LoadedAlbum;

		if (cached && now() - cached.time < ALBUM_MEMO_TTL_MS) {
			loaded = cached.album;
		} else {
			const album = await getAlbumContent(albumId);
			loaded = {
				...album,
				content: await Promise.all(
					album.content.map(async (slide) => {
						const kind = slide.contentType.startsWith("video/")
							? "video"
							: "image";
						const url = proxyMediaUrl(slide.url, { as: kind });
						const coverUrl = proxyMediaUrl(slide.coverUrl);
						const measurable = { video: coverUrl, image: url }[kind];
						return {
							...slide,
							url,
							coverUrl,
							...(measurable === null
								? await measureVideo(url)
								: await measureImage(measurable)),
						};
					}),
				),
			};
			cachedAlbums.set(albumId, { album: loaded, time: now() });
		}

		if (loaded.content.length === 0) {
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
