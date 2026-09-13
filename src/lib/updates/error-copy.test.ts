import { describe, expect, it } from "vitest";

import { APP_COMPONENT, GOOGLE_OAUTH_COMPONENT } from "./components";
import {
	noReleaseText,
	unsupportedIsFixable,
	unsupportedText,
	updateErrorText,
} from "./error-copy";

const foreignTarget = {
	kind: "unsupported",
	detail: { reason: "foreignTarget" },
};

describe("copy for an installed package signed by someone else", () => {
	it("names the app generically for the app itself", () => {
		expect(unsupportedText({ reason: "foreignTarget" })).toBe(
			"The installed app isn't signed by Open Grind",
		);
		expect(
			updateErrorText(foreignTarget, {
				fallback: "fallback",
				component: APP_COMPONENT,
			}),
		).toBe("The installed app isn't signed by Open Grind");
	});

	it("tells the user to uninstall the impostor companion app", () => {
		const text =
			"The installed companion app isn't signed by Open Grind. Uninstall it to install the official one.";

		expect(
			unsupportedText(
				{ reason: "foreignTarget" },
				{ component: GOOGLE_OAUTH_COMPONENT },
			),
		).toBe(text);
		for (const kind of ["install", "update"] as const) {
			expect(
				updateErrorText(foreignTarget, {
					fallback: "fallback",
					component: GOOGLE_OAUTH_COMPONENT,
					kind,
				}),
			).toBe(text);
		}
	});

	it("counts as something the user can fix", () => {
		expect(unsupportedIsFixable({ reason: "foreignTarget" })).toBe(true);
	});
});

describe("copy for an Open Grind build signed by someone else", () => {
	it("blames this build, not the companion app, when the companion app cannot be installed", () => {
		const text =
			"This copy of Open Grind isn't signed by Open Grind, so it can't install the companion app";

		expect(
			unsupportedText(
				{ reason: "foreignSigner" },
				{ component: GOOGLE_OAUTH_COMPONENT },
			),
		).toBe(text);
		expect(
			updateErrorText(
				{ kind: "unsupported", detail: { reason: "foreignSigner" } },
				{ fallback: "fallback", component: GOOGLE_OAUTH_COMPONENT },
			),
		).toBe(text);
	});

	it("keeps the app's own wording", () => {
		expect(unsupportedText({ reason: "foreignSigner" })).toBe(
			"This build was not signed by Open Grind",
		);
	});
});

describe("copy for a release index with nothing to install", () => {
	it("says no release is published yet instead of blaming the device", () => {
		expect(noReleaseText({ component: GOOGLE_OAUTH_COMPONENT })).toBe(
			"No companion app release is published yet",
		);
		expect(noReleaseText({ component: APP_COMPONENT })).toBe(
			"No Open Grind release is published yet",
		);
	});

	it("stays distinct from a device the release does not cover", () => {
		for (const component of [
			APP_COMPONENT,
			GOOGLE_OAUTH_COMPONENT,
		] as const) {
			expect(noReleaseText({ component })).not.toBe(
				unsupportedText(
					{ reason: "noReleaseArtifacts" },
					{ component },
				),
			);
		}
	});
});
