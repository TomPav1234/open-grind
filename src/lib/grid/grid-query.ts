import type z from "zod";

import {
	type GridSearchFilters,
	isFilterableGenderId,
	isFilterableTribe,
	WEIGHT_KG_MAX,
	WEIGHT_KG_MIN,
} from "$lib/model/browse/grid/filters";
import type { cascadeV4QuerySchema } from "$lib/model/browse/grid/cascade/query/v4";

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
	const genders = filters.genders.filter(isFilterableGenderId);
	const tribes = filters.tribes.filter(isFilterableTribe);
	return {
		favorites: filters.isFavorite || undefined,
		onlineOnly: filters.isOnline || undefined,
		rightNow: filters.isRightNow || undefined,
		...(filters.ageEnabled && {
			ageMin: filters.age[0],
			ageMax: filters.age[1],
		}),
		...(filters.genderEnabled && genders.length > 0 && { genders }),
		...(filters.positionEnabled && { sexualPositions: filters.positions }),
		...(filters.photosEnabled &&
			filters.photos.includes("has-photos") && { photoOnly: true }),
		...(filters.photosEnabled &&
			filters.photos.includes("has-albums") && { hasAlbum: true }),
		...(filters.photosEnabled &&
			filters.photos.includes("has-face-pics") && { faceOnly: true }),
		...(filters.tribesEnabled && tribes.length > 0 && { tribes }),
		...(filters.bodyTypesEnabled && { bodyTypes: filters.bodyTypes }),
		...(filters.heightEnabled && {
			heightCmMin: filters.height[0],
			heightCmMax: filters.height[1],
		}),
		...(filters.weightEnabled && {
			weightGramsMin: (filters.weight[0] ?? WEIGHT_KG_MIN) * 1000,
			weightGramsMax: (filters.weight[1] ?? WEIGHT_KG_MAX) * 1000,
		}),
		...(filters.relationshipStatusesEnabled && {
			relationshipStatuses: filters.relationshipStatuses,
		}),
		...(filters.acceptNSFWPicsEnabled &&
			filters.acceptNSFWPics !== undefined && {
				nsfwPics: filters.acceptNSFWPics,
			}),
		...(filters.lookingForEnabled && { lookingFor: filters.lookingFor }),
		...(filters.meetAtEnabled && { meetAt: filters.meetAt }),
		notRecentlyChatted: filters.haventChattedTodayEnabled || undefined,
		...(filters.healthPracticesEnabled && {
			sexualHealth: filters.healthPractices,
		}),
		...(filters.tagsEnabled && filters.tags && { tags: filters.tags }),
		fresh: filters.isFresh || undefined,
	};
}
