import z from "zod";

import { mediaUrlSchema } from "$lib/model/media";
import { knownValueOrNull, serverDefault } from "$lib/model/tolerance";
import { unixTimestampMsSchema, unmodeledSchema } from "$lib/model/types";

export const albumPreviewSchema = z.object({
	albumId: z.int(),
	hasUnseenContent: z.boolean(),
});

export const albumMinSchema = albumPreviewSchema.extend({
	albumName: z.string().nullable(),
	profileId: z.int(),
	albumViewable: z.boolean(),
});

export const albumDetailsSchema = z.object({
	sharedCount: z.int(),
	createdAt: z.iso.datetime({ local: true }),
	updatedAt: z.iso.datetime({ local: true }),
});

export const AlbumExpiration = {
	INDEFINITE: 0,
	ONCE: 1,
	TEN_MINUTES: 2,
	ONE_HOUR: 3,
	ONE_DAY: 4,
} as const;

export const albumExpirationTypeSchema = z.enum(
	Object.keys(AlbumExpiration) as (keyof typeof AlbumExpiration)[],
);

export type AlbumExpirationType = z.infer<typeof albumExpirationTypeSchema>;

export const albumExpirationSchema = z.object({
	expiresAt: unixTimestampMsSchema.nullable(),
	expirationType: knownValueOrNull({
		value: albumExpirationTypeSchema,
		label: "album expirationType",
	}).optional(),
});

export const albumContentMin = z.object({
	contentId: z.int(),
	contentType: z.string(),
	coverUrl: mediaUrlSchema.nullable(),
	statusId: z.int(),
});

export const albumContentSchema = albumContentMin.extend({
	thumbUrl: mediaUrlSchema,
	url: mediaUrlSchema.or(z.literal("")),
	processing: z.boolean().nullable(),
	rejectionId: unmodeledSchema,
});

export const myAlbumSchema = albumDetailsSchema.extend({
	albumId: z.int(),
	albumName: z.string().nullable(),
	profileId: z.int(),
	version: z.int(),
	content: z.array(albumContentSchema),
	isShareable: z.boolean(),
});

export type MyAlbum = z.infer<typeof myAlbumSchema>;

export const myAlbumsResponseSchema = z.object({
	albums: z.array(myAlbumSchema),
});

export const albumShareRequestSchema = z.object({
	profiles: z.array(
		z.object({
			profileId: z.int(),
			expirationType: albumExpirationTypeSchema,
		}),
	),
});

export type AlbumShareRequest = z.infer<typeof albumShareRequestSchema>;

export const albumSharesResponseSchema = z.object({
	profileIds: z.array(z.int()),
});

export const albumUnshareRequestProfileItemSchema = z.object({
	profileId: z.int(),
	shareId: z.string(),
});

export const albumUnshareRequestSchema = z.object({
	profiles: z.array(albumUnshareRequestProfileItemSchema),
});

export type AlbumUnshareRequest = z.infer<typeof albumUnshareRequestSchema>;

export const pressieProfileMiniSchema = z.object({
	profileId: z.int(),
	name: z.string().nullish(),
	profileUrl: z.string().nullish(),
	onlineUntil: unixTimestampMsSchema.nullish(),
	distanceKm: z.number().nullish(),
});

export type PressieProfileMini = z.infer<typeof pressieProfileMiniSchema>;

export const pressieCoverContentSchema = z.object({
	id: z.int().nullish(),
	contentType: z.string().nullish(),
	location: z.string().nullish(),
	status: z.string().nullish(),
});

export type PressieCoverContent = z.infer<typeof pressieCoverContentSchema>;

export const sharedAlbumItemSchema = z.object({
	albumId: z.int(),
	albumViewable: serverDefault({ value: z.boolean(), fallback: true }),
	albumVersion: z.int().nullish(),
	expiresAt: unixTimestampMsSchema.nullish(),
	name: z.string().nullish(),
	ownerProfileId: z.int().nullish(),
	imageCount: serverDefault({ value: z.int(), fallback: 0 }),
	videoCount: serverDefault({ value: z.int(), fallback: 0 }),
	hasUnseenContent: serverDefault({ value: z.boolean(), fallback: false }),
	coverContent: pressieCoverContentSchema.nullish(),
	profile: pressieProfileMiniSchema.nullish(),
	paywallUrls: z.array(z.string()).nullish(),
});

export type SharedAlbumItem = z.infer<typeof sharedAlbumItemSchema>;

export const pressieAlbumsFeedResponseSchema = z.object({
	profileFeeds: z.array(unmodeledSchema).nullish(),
	sharedAlbums: serverDefault({
		value: z.array(sharedAlbumItemSchema),
		fallback: [],
	}),
	nonEmptyPersonalAlbumCount: z.int().nullish(),
	emptyAlbumId: z.int().nullish(),
});

export type PressieAlbumsFeedResponse = z.infer<
	typeof pressieAlbumsFeedResponseSchema
>;

export const albumPaywallItemSchema = z.object({
	albumId: z.int(),
	profile: pressieProfileMiniSchema.nullish(),
	paywallCoverUrl: z.string().nullish(),
	paywallUrls: z.array(z.string()).nullish(),
	albumsItemCount: z.int().nullish(),
});

export type AlbumPaywallItem = z.infer<typeof albumPaywallItemSchema>;

export const pressieAlbumsPaywallResponseSchema = z.object({
	albumPaywallContent: serverDefault({
		value: z.array(albumPaywallItemSchema),
		fallback: [],
	}),
});

export type PressieAlbumsPaywallResponse = z.infer<
	typeof pressieAlbumsPaywallResponseSchema
>;
