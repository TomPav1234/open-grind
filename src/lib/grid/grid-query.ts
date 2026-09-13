import type z from "zod";

import {
	type GridSearchFilters,
	isFilterableGenderId,
	isFilterableTribe,
	WEIGHT_KG_MAX,
	WEIGHT_KG_MIN,
} from "$lib/model/browse/grid/filters";
import type { cascadeV4QuerySchema } from "$lib/model/browse/grid/cascade/query/v4";

const sendable = <T>({ enabled, values }: { enabled: boolean; values: T[] }) =>
	enabled && values.length > 0 ? values : undefined;

type CascadeQuery = z.infer<typeof cascadeV4QuerySchema>;
type CascadeFilters = Omit<CascadeQuery, "nearbyGeoHash">;

export function buildCascadeQuery({
	geohash,
	filters,
}: {
	geohash: string;
	filters: GridSearchFilters | null;
}): CascadeQuery {
	return { nearbyGeoHash: geohash, ...(filters && cascadeFilters(filters)) };
}

export function sentFilterKeys(
	filters: GridSearchFilters,
): (keyof CascadeFilters)[] {
	return Object.entries(cascadeFilters(filters))
		.filter(([, value]) => value !== undefined)
		.map(([key]) => key as keyof CascadeFilters);
}

function cascadeFilters(filters: GridSearchFilters): CascadeFilters {
	return {
		favorites: filters.isFavorite || undefined,
		onlineOnly: filters.isOnline || undefined,
		rightNow: filters.isRightNow || undefined,
		...(filters.ageEnabled && {
			ageMin: filters.age[0],
			ageMax: filters.age[1],
		}),
		genders: sendable({
			enabled: filters.genderEnabled,
			values: filters.genders.filter(isFilterableGenderId),
		}),
		sexualPositions: sendable({
			enabled: filters.positionEnabled,
			values: filters.positions,
		}),
		photoOnly:
			(filters.photosEnabled && filters.photos.includes("has-photos")) ||
			undefined,
		hasAlbum:
			(filters.photosEnabled && filters.photos.includes("has-albums")) ||
			undefined,
		faceOnly:
			(filters.photosEnabled &&
				filters.photos.includes("has-face-pics")) ||
			undefined,
		tribes: sendable({
			enabled: filters.tribesEnabled,
			values: filters.tribes.filter(isFilterableTribe),
		}),
		bodyTypes: sendable({
			enabled: filters.bodyTypesEnabled,
			values: filters.bodyTypes,
		}),
		...(filters.heightEnabled && {
			heightCmMin: filters.height[0],
			heightCmMax: filters.height[1],
		}),
		...(filters.weightEnabled && {
			weightGramsMin: (filters.weight[0] ?? WEIGHT_KG_MIN) * 1000,
			weightGramsMax: (filters.weight[1] ?? WEIGHT_KG_MAX) * 1000,
		}),
		relationshipStatuses: sendable({
			enabled: filters.relationshipStatusesEnabled,
			values: filters.relationshipStatuses,
		}),
		nsfwPics: sendable({
			enabled: filters.acceptNSFWPicsEnabled,
			values: filters.acceptNSFWPics,
		}),
		lookingFor: sendable({
			enabled: filters.lookingForEnabled,
			values: filters.lookingFor,
		}),
		meetAt: sendable({
			enabled: filters.meetAtEnabled,
			values: filters.meetAt,
		}),
		notRecentlyChatted: filters.haventChattedTodayEnabled || undefined,
		sexualHealth: sendable({
			enabled: filters.healthPracticesEnabled,
			values: filters.healthPractices,
		}),
		tags: sendable({ enabled: filters.tagsEnabled, values: filters.tags }),
		fresh: filters.isFresh || undefined,
	};
}
