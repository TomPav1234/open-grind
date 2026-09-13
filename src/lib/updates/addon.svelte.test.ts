import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Capability } from "./types";
import {
	offer,
	outcomeOf,
	progressOf,
	ready,
	settled,
	toastsFake,
	updateApiFake,
	upToDate,
} from "./updates-test-helpers";

const fake = updateApiFake();
const toasts = toastsFake();
const platform = vi.hoisted(() => ({ isAndroidPlatform: vi.fn(() => true) }));
const getUpdateCapability = vi.hoisted(() =>
	vi.fn<() => Promise<Capability>>(),
);
const { api, readiness, emitProgress, emitOutcome } = fake;

vi.mock("./index", async () => ({
	...(await import("./types")),
	...(await import("./components")),
	...fake.api,
	getUpdateCapability,
}));
vi.mock("./toasts", () => toasts);
vi.mock("$lib/platform/os", () => platform);

const releaseSigned: Capability = {
	state: "supported",
	detail: { payloadSuffix: "-android.apk", canInstallNow: true },
};

async function probedCapability(capability: Capability) {
	getUpdateCapability.mockResolvedValue(capability);
	const { hydrateUpdateCapability } = await import("./capability.svelte");
	await hydrateUpdateCapability();
}

function lastShownToast() {
	const shown = toasts.showStage.mock.lastCall?.[0];
	if (!shown) throw new Error("no stage toast was shown");
	return shown;
}

describe("the add-on activity the sign-in screen observes", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		fake.reset();
		platform.isAndroidPlatform.mockReturnValue(true);
		api.checkForUpdate.mockResolvedValue(offer("install"));
	});

	it("follows a toast-driven install from download to a counted install", async () => {
		const { addonActivity, addonUpdates } = await import("./addon.svelte");
		expect(addonActivity).toEqual({ stage: null, installs: 0 });

		await addonUpdates.installNow();
		expect(addonActivity.stage).toBe("downloading");
		expect(toasts.showStage).toHaveBeenLastCalledWith(
			expect.objectContaining({
				view: expect.objectContaining({ stage: "downloading" }),
			}),
		);

		readiness["google-oauth"] = ready("install");
		emitProgress(
			progressOf("google-oauth", { phase: "ready", received: 100 }),
		);
		await settled();
		expect(addonActivity.stage).toBe("installing");

		emitOutcome(outcomeOf("google-oauth"));
		await settled();

		expect(addonActivity).toEqual({ stage: null, installs: 1 });
		expect(toasts.dismissStage).toHaveBeenCalledWith("google-oauth");
		expect(toasts.showAddonInstalled).toHaveBeenCalledOnce();
	});

	it("does not count an install the user cancelled", async () => {
		const { addonActivity, addonUpdates } = await import("./addon.svelte");
		readiness["google-oauth"] = ready("install");

		await addonUpdates.installNow();
		expect(addonActivity.stage).toBe("installing");
		emitOutcome(
			outcomeOf("google-oauth", { succeeded: false, canceled: true }),
		);
		await settled();

		expect(addonActivity).toEqual({ stage: "ready", installs: 0 });
	});

	it("clears the stage when the offer is swiped away, ignoring a stale swipe", async () => {
		const { addonActivity, addonUpdates } = await import("./addon.svelte");
		api.checkForUpdate.mockResolvedValue(offer("update"));
		await addonUpdates.checkNow();
		expect(addonActivity.stage).toBe("available");
		const offered = lastShownToast();

		api.checkForUpdate.mockResolvedValue(offer("install"));
		await addonUpdates.installNow();
		offered.onDismiss();
		expect(addonActivity.stage).toBe("downloading");

		lastShownToast().onDismiss();
		expect(addonActivity.stage).toBeNull();
	});

	it("says the companion app is up to date when a tap finds nothing newer", async () => {
		const { addonUpdates } = await import("./addon.svelte");
		api.checkForUpdate.mockResolvedValue(upToDate);

		await addonUpdates.installNow();

		expect(toasts.showUpToDate).toHaveBeenCalledExactlyOnceWith(
			"The companion app is up to date",
		);
	});
});

describe("where the companion app can be installed from here", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		fake.reset();
		platform.isAndroidPlatform.mockReturnValue(true);
	});

	it("is on Android builds signed by Open Grind", async () => {
		await probedCapability(releaseSigned);
		const { addonInstallerAvailable } = await import("./addon.svelte");

		expect(addonInstallerAvailable()).toBe(true);
	});

	it("includes store builds signed by Open Grind", async () => {
		await probedCapability({
			state: "unsupported",
			detail: {
				reason: "externallyManaged",
				detail: { installer: "org.fdroid.fdroid" },
			},
		});
		const { addonInstallerAvailable } = await import("./addon.svelte");

		expect(addonInstallerAvailable()).toBe(true);
	});

	it("is not on a build someone else signed, which the companion app refuses", async () => {
		await probedCapability({
			state: "unsupported",
			detail: { reason: "foreignSigner" },
		});
		const { addonInstallerAvailable, startAddonUpdateWatch } =
			await import("./addon.svelte");

		expect(addonInstallerAvailable()).toBe(false);
		await startAddonUpdateWatch();
		expect(api.getUpdateProgress).not.toHaveBeenCalled();
		expect(api.checkForUpdate).not.toHaveBeenCalled();
	});

	it("waits for the capability probe before offering anything", async () => {
		const { addonInstallerAvailable } = await import("./addon.svelte");

		expect(addonInstallerAvailable()).toBe(false);
	});

	it("is not off Android", async () => {
		platform.isAndroidPlatform.mockReturnValue(false);
		await probedCapability(releaseSigned);
		const { addonInstallerAvailable } = await import("./addon.svelte");

		expect(addonInstallerAvailable()).toBe(false);
	});
});
