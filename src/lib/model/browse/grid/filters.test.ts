import { describe, expect, it } from "vitest";

import {
	defaultFilters,
	FilterAcceptNSFWPics,
	filterAcceptNSFWPicsSchema,
	filterAgeSchema,
	FilterBodyType,
	filterGendersSchema,
	filterHeightSchema,
	FilterLookingFor,
	FilterPosition,
	filterPositionSchema,
	filterWeightSchema,
	GENDER_ASK_ME,
	gridSearchFiltersSchema,
	isFilterableGender,
	isFilterableTagKey,
	tagCatalog,
} from "$lib/model/browse/grid/filters";

describe("grid search filter schemas", () => {
	it("accepts the default filter state", () => {
		expect(gridSearchFiltersSchema.parse(defaultFilters)).toEqual(
			defaultFilters,
		);
	});

	it("enforces filter range boundaries", () => {
		expect(filterAgeSchema.safeParse([18, 102]).success).toBe(true);
		expect(filterAgeSchema.safeParse([17, 102]).success).toBe(false);
		expect(filterHeightSchema.safeParse([120, 242]).success).toBe(true);
		expect(filterHeightSchema.safeParse([119, 242]).success).toBe(false);
		expect(filterWeightSchema.safeParse([40, 273]).success).toBe(true);
		expect(filterWeightSchema.safeParse([40, 274]).success).toBe(false);
	});

	it("accepts not-specified aliases for filters that expose them", () => {
		expect(
			filterPositionSchema.parse([FilterPosition.NotSpecified]),
		).toEqual([FilterPosition.NotSpecified]);
		expect(FilterBodyType.NotSpecified).toBe(-1);
		expect(FilterLookingFor.NotSpecified).toBe(-1);
		expect(FilterAcceptNSFWPics.NotSpecified).toBe(-1);
		expect(
			filterAcceptNSFWPicsSchema.parse([
				FilterAcceptNSFWPics.NotSpecified,
			]),
		).toEqual([FilterAcceptNSFWPics.NotSpecified]);
	});

	it("accepts not-specified (-1) alongside gender ids", () => {
		expect(filterGendersSchema.parse([-1, 42])).toEqual([-1, 42]);
		expect(filterGendersSchema.safeParse([-2]).success).toBe(false);
	});
});

describe("filterable values", () => {
	const gender = {
		genderId: 1,
		gender: "Man",
		displayGroup: 1,
		sortFilter: 1,
	};

	it("offers only genders the official filter sheet lists", () => {
		expect(isFilterableGender(gender)).toBe(true);
		expect(isFilterableGender({ ...gender, sortFilter: null })).toBe(false);
		expect(isFilterableGender({ ...gender, genderId: GENDER_ASK_ME })).toBe(
			false,
		);
	});

	it("hides the tags that moved to genders", () => {
		expect(isFilterableTagKey("ftm")).toBe(false);
		expect(isFilterableTagKey("mtf")).toBe(false);
		expect(isFilterableTagKey("coffee")).toBe(true);
	});
});

const languages = [
	{
		language: "en",
		categoryCollection: [
			{
				text: "Interests",
				possessiveText: null,
				tags: [
					{ tagId: 1, key: "hiking", text: "Hiking" },
					{ tagId: 2, key: "gaming", text: "Gaming" },
					{ tagId: 3, key: "ftm", text: "FTM" },
				],
			},
		],
	},
	{
		language: "de",
		categoryCollection: [
			{
				text: "Interessen",
				possessiveText: null,
				tags: [{ tagId: 11, key: "hiking", text: "Wandern" }],
			},
		],
	},
];

describe("tagCatalog", () => {
	it("lists each key once with the first language's text", () => {
		const catalog = tagCatalog(languages);

		expect(catalog.flat.map(({ key, text }) => [key, text])).toEqual([
			["gaming", "Gaming"],
			["hiking", "Hiking"],
		]);
		expect(catalog.textOf("hiking")).toBe("Hiking");
	});

	it("leaves the tags that moved to genders out of the lists", () => {
		const catalog = tagCatalog(languages);

		expect(catalog.categories[0]?.tags.map(({ key }) => key)).toEqual([
			"hiking",
			"gaming",
		]);
		expect(catalog.keysOf(["FTM"])).toEqual(["ftm"]);
	});

	it("finds a key by its text in any language", () => {
		const catalog = tagCatalog(languages);

		expect(
			catalog.flat.find(({ key }) => key === "hiking")?.textsLower,
		).toEqual(["hiking", "wandern"]);
		expect(
			catalog.keysOf(["Wandern", "hiking", "gaming", "unknown"]),
		).toEqual(["hiking", "gaming", "unknown"]);
	});
});
