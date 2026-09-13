import { describe, expect, it } from "vitest";

import { APP_COMPONENT, GOOGLE_OAUTH_COMPONENT } from "./components";
import {
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
				GOOGLE_OAUTH_COMPONENT,
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
