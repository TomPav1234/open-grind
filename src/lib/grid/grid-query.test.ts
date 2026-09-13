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

	it("leaves genders out when only Ask me is selected", () => {
		const query = buildCascadeQuery({
			geohash,
			filters: {
				...defaultFilters,
				genderEnabled: true,
				genders: [GENDER_ASK_ME],
			},
		});

		expect(query).not.toHaveProperty("genders");
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

	it("leaves tribes out when only the Trans tribe is selected", () => {
		const query = buildCascadeQuery({
			geohash,
			filters: {
				...defaultFilters,
				tribesEnabled: true,
				tribes: [Tribe.Trans],
			},
		});

		expect(query).not.toHaveProperty("tribes");
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
