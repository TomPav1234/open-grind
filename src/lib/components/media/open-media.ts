import "photoswipe/style.css";

import { showErrorToast } from "$lib/api/error-toast";
import type { ReceivedMediaItem } from "$lib/api/messaging/received-media";
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

type LoadedMediaItem = ReceivedMediaItem & MediaDimensions;

export async function openMediaLightbox(
	items: ReceivedMediaItem[],
	initialIndex = 0,
): Promise<void> {
	if (items.length === 0) return;

	try {
		const loaded: LoadedMediaItem[] = await Promise.all(
			items.map(async (item) => {
				const isVideo = item.contentType === "video";
				const url = proxyMediaUrl(item.url, { as: isVideo ? "video" : "image" });
				try {
					const dims = isVideo
						? await measureVideo(url)
						: await measureImage(url);
					return { ...item, url, ...dims };
				} catch {
					return { ...item, url, width: 800, height: 1000 };
				}
			}),
		);

		const { default: PhotoSwipeLightbox } = await import("photoswipe/lightbox");
		const lightbox = new PhotoSwipeLightbox({
			showHideAnimationType: "fade",
			pswpModule: () => import("photoswipe"),
			mainClass: "pswp--buttons-visible",
		});

		applyPhotoSwipeErrorUi(lightbox);
		applyPhotoSwipeViewportSync(lightbox);
		lightbox.addFilter("numItems", () => loaded.length);
		lightbox.addFilter("itemData", (itemData, index) => {
			const media = loaded[index];
			if (media === undefined) return itemData;
			return {
				src: media.url,
				width: media.width,
				height: media.height,
			};
		});
		applyPhotoSwipeBackGesture(lightbox);
		applyPhotoSwipeVideo(lightbox, (index) => {
			const media = loaded[index];
			if (media?.contentType !== "video") return null;
			return { src: media.url };
		});

		lightbox.init();
		lightbox.loadAndOpen(initialIndex);
	} catch (error) {
		console.error("Failed to open media lightbox", error);
		showErrorToast({ label: "Impossibile aprire il visualizzatore media", error });
	}
}
