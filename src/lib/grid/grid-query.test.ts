import { describe, expect, it } from "vitest";

import { defaultFilters, GENDER_ASK_ME } from "$lib/model/browse/grid/filters";
import { Tribe } from "$lib/model/users/profiles";
import { buildCascadeQuery, sentFilterKeys } from "./grid-query";

const geohash = "u33dc0";

describe("buildCascadeQuery", () => {
	it("never sends the Ask me gender", () => {
		const query = buildCascadeQuery({
			geohash,
			filters: {
				...defaultFilters,
				genderEnabled: true,
				genders: [1, GENDER_ASK_ME],
			},
		});

		expect(query.genders).toEqual([1]);
	});

	it("never sends the Trans tribe, which moved to genders", () => {
		const query = buildCascadeQuery({
			geohash,
			filters: {
				...defaultFilters,
				tribesEnabled: true,
				tribes: [Tribe.Bear, Tribe.Trans],
			},
		});

		expect(query.tribes).toEqual([Tribe.Bear]);
	});

	it("leaves out a list filter that is on but has nothing sendable", () => {
		const query = buildCascadeQuery({
			geohash,
			filters: {
				...defaultFilters,
				genderEnabled: true,
				genders: [GENDER_ASK_ME],
				tribesEnabled: true,
				tribes: [Tribe.Trans],
				positionEnabled: true,
				bodyTypesEnabled: true,
				relationshipStatusesEnabled: true,
				acceptNSFWPicsEnabled: true,
				lookingForEnabled: true,
				meetAtEnabled: true,
				healthPracticesEnabled: true,
				tagsEnabled: true,
			},
		});

		expect(
			Object.entries(query).filter(([, value]) => value !== undefined),
		).toEqual([["nearbyGeoHash", geohash]]);
	});
});

describe("sentFilterKeys", () => {
	it("lists nothing for the defaults", () => {
		expect(sentFilterKeys(defaultFilters)).toEqual([]);
	});

	it("ignores a filter that is on but sends nothing", () => {
		expect(
			sentFilterKeys({
				...defaultFilters,
				isFavorite: true,
				tribesEnabled: true,
				tribes: [Tribe.Trans],
			}),
		).toEqual(["favorites"]);
	});

	it("lists every filter the request carries", () => {
		expect(
			sentFilterKeys({
				...defaultFilters,
				isFavorite: true,
				genderEnabled: true,
				genders: [-1],
			}),
		).toEqual(["favorites", "genders"]);
	});
});
