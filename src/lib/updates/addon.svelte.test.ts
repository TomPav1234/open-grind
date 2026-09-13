import { beforeEach, describe, expect, it, vi } from "vitest";

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
const { api, readiness, emitProgress, emitOutcome } = fake;

vi.mock("./index", async () => ({
	...(await import("./types")),
	...(await import("./components")),
	...fake.api,
}));
vi.mock("./toasts", () => toasts);
vi.mock("$lib/platform/os", () => platform);

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
