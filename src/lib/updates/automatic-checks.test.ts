import { beforeEach, describe, expect, it, vi } from "vitest";

const { addonUpdates, updatesManager, updatesApi } = vi.hoisted(() => ({
	addonUpdates: { checkNow: vi.fn(() => Promise.resolve()) },
	updatesManager: { checkForUpdateNow: vi.fn(() => Promise.resolve()) },
	updatesApi: { getInstalledVersion: vi.fn<() => Promise<string | null>>() },
}));

vi.mock("./addon.svelte", () => ({ addonUpdates }));
vi.mock("./updates-manager", () => updatesManager);
vi.mock("./index", () => updatesApi);

import { automaticChecksSetting, checkAfterOptIn } from "./automatic-checks";

const storeBuild = {
	selfManaged: false,
	unsupportedReason: null,
	addonAvailable: true,
};

beforeEach(() => {
	vi.clearAllMocks();
	updatesApi.getInstalledVersion.mockResolvedValue("1.1.0");
});

describe("the automatic update checks switch", () => {
	it("speaks for the app and its companion on a self-managed build", () => {
		expect(
			automaticChecksSetting({ ...storeBuild, selfManaged: true }),
		).toEqual({
			title: "Check updates automatically",
			description:
				"Periodically request updates for Open Grind and its companion app from git.opengrind.org. No personally identifiable information is sent, no requests are stored or analyzed.",
			blocked: false,
		});
	});

	it("names only Open Grind where no add-on installs", () => {
		expect(
			automaticChecksSetting({
				selfManaged: true,
				unsupportedReason: null,
				addonAvailable: false,
			}).description,
		).toBe(
			"Periodically request updates for Open Grind from git.opengrind.org. No personally identifiable information is sent, no requests are stored or analyzed.",
		);
	});

	it("speaks only for the companion on a store build", () => {
		expect(automaticChecksSetting(storeBuild)).toEqual({
			title: "Check companion app updates automatically",
			description:
				"Periodically ask git.opengrind.org whether a newer companion app for Google sign-in is published. Open Grind itself isn't updated from here. No personally identifiable information is sent, no requests are stored or analyzed.",
			blocked: false,
		});
	});

	it("stays usable for the companion when the app cannot update itself", () => {
		const setting = automaticChecksSetting({
			...storeBuild,
			unsupportedReason:
				"Open Grind can't tell whether it may update itself",
		});

		expect(setting.blocked).toBe(false);
		expect(setting.title).toBe("Check companion app updates automatically");
		expect(setting.description).toMatch(
			/^Open Grind can't tell whether it may update itself\. Periodically ask git\.opengrind\.org whether a newer companion app/,
		);
	});

	it("blocks the switch and says why when nothing here can be checked", () => {
		expect(
			automaticChecksSetting({
				selfManaged: false,
				unsupportedReason:
					"Open Grind can't install the update in its directory",
				addonAvailable: false,
			}),
		).toEqual({
			title: "Check updates automatically",
			description: "Open Grind can't install the update in its directory",
			blocked: true,
		});
	});
});

describe("checking right after opting in", () => {
	it("leaves the app to its store and checks only the companion", async () => {
		await checkAfterOptIn(storeBuild);

		expect(updatesManager.checkForUpdateNow).not.toHaveBeenCalled();
		expect(addonUpdates.checkNow).toHaveBeenCalledOnce();
	});

	it("checks the app and the companion on a self-managed build", async () => {
		await checkAfterOptIn({ selfManaged: true, addonAvailable: true });

		expect(updatesManager.checkForUpdateNow).toHaveBeenCalledOnce();
		expect(addonUpdates.checkNow).toHaveBeenCalledOnce();
	});

	it("checks only the app where no add-on installs", async () => {
		await checkAfterOptIn({ selfManaged: true, addonAvailable: false });

		expect(updatesManager.checkForUpdateNow).toHaveBeenCalledOnce();
		expect(addonUpdates.checkNow).not.toHaveBeenCalled();
	});

	it("does not ask about a companion that is not installed", async () => {
		updatesApi.getInstalledVersion.mockResolvedValue(null);

		await checkAfterOptIn(storeBuild);

		expect(addonUpdates.checkNow).not.toHaveBeenCalled();
	});
});
