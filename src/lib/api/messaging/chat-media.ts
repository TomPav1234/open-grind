import z from "zod";

import { invokeRest } from "$lib/api/transport";
import { demoEnabled, demoUploadChatMedia } from "$lib/demo";
import { mediaUrlSchema } from "$lib/model/media";
import { type PickedMedia, readMediaBytes } from "$lib/platform/media-picker";
import { toBase64 } from "$lib/util/base64";
import { type DrawerMedia, saveMediaToDrawer } from "./drawer";

const mediaUploadResponseSchema = z.object({
	mediaId: z.int(),
	url: mediaUrlSchema,
	mediaHash: z.string(),
});

export type MediaUploadResponse = z.infer<typeof mediaUploadResponseSchema>;

function chatMediaUploadPath(takenOnGrindr: boolean): string {
	return takenOnGrindr
		? "/v6/chat/media/upload?takenOnGrindr=true"
		: "/v5/chat/media/upload?takenOnGrindr=false";
}

async function uploadChatMedia(
	bytes: Uint8Array<ArrayBuffer>,
	options: { contentType: string; takenOnGrindr: boolean },
): Promise<MediaUploadResponse> {
	if (demoEnabled) {
		return demoUploadChatMedia({ bytes, contentType: options.contentType });
	}
	const path = chatMediaUploadPath(options.takenOnGrindr);
	const response = await invokeRest("upload_media", {
		args: {
			path,
			signed: options.takenOnGrindr,
			contentType: options.contentType,
			data: toBase64(bytes),
		},
		requestInfo: { method: "POST", path },
	});
	return response.jsonParsed(mediaUploadResponseSchema);
}

export async function addMediaToDrawer(
	media: PickedMedia,
): Promise<DrawerMedia> {
	const takenOnGrindr = false;
	const bytes = await readMediaBytes(media);
	const contentType = media.mimeType ?? "image/jpeg";
	const uploaded = await uploadChatMedia(bytes, {
		contentType,
		takenOnGrindr,
	});
	await saveMediaToDrawer(uploaded.mediaId);

	return {
		id: uploaded.mediaId,
		url: uploaded.url,
		contentType,
		createdTs: Date.now(),
		used: false,
		takenOnGrindr,
	};
}
