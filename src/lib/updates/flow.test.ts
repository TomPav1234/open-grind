import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ComponentKey } from "./components";
import {
	flowFor,
	offer,
	outcomeOf,
	progressOf,
	ready,
	recorder,
	resumable,
	settled,
	unpublished,
	updateApiFake,
} from "./updates-test-helpers";

const fake = updateApiFake();
const { api, readiness, emitProgress, emitOutcome } = fake;

vi.mock("./index", async () => ({
	...(await import("./types")),
	...(await import("./components")),
	...fake.api,
}));

beforeEach(() => {
	vi.resetModules();
	fake.reset();
});

describe("an add-on update flow", () => {
	it("offers a verified update at launch", async () => {
		readiness["google-oauth"] = ready("update");
		const { flow, view } = await flowFor("google-oauth");

		await flow.start();

		expect(view.events).toEqual(["show:ready"]);
		expect(api.takeInstallOutcome).not.toHaveBeenCalled();
	});

	it("does not resume a first-install download at launch", async () => {
		readiness["google-oauth"] = resumable("install");
		const { flow, view } = await flowFor("google-oauth");

		await flow.start();

		expect(api.startUpdateDownload).not.toHaveBeenCalled();
		expect(view.events).toEqual([]);
	});

	it("keeps an offer the sign-in screen borrowed and gave back", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		const inline = recorder();

		flow.present(inline.presenter);
		await settled();
		flow.present(view.presenter);
		await settled();

		expect(inline.events).toEqual(["show:available", "dismiss"]);
		expect(view.events.at(-1)).toBe("show:available");
	});

	it("still honours a swipe on the offer", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		view.swipe();
		const shows = view.events.length;
		const inline = recorder();

		flow.present(inline.presenter);
		flow.present(view.presenter);
		await settled();

		expect(inline.events).toEqual([]);
		expect(view.events.length).toBe(shows);
	});

	it("leaves a first-install download to the sign-in screen at launch", async () => {
		readiness["google-oauth"] = ready("install");
		const { flow, view } = await flowFor("google-oauth");

		await flow.start();

		expect(view.events).toEqual([]);
		expect(api.checkForUpdate).toHaveBeenCalledWith(
			"launch",
			"google-oauth",
		);
	});

	it("does not adopt a running download that belongs to the app", async () => {
		api.getUpdateProgress.mockResolvedValue(progressOf("app"));
		const { flow, view } = await flowFor("google-oauth");

		await flow.start();

		expect(api.startUpdateDownload).not.toHaveBeenCalled();
		expect(view.events).toEqual([]);
	});

	it("never offers a first install from a background check", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		const { flow, view } = await flowFor("google-oauth");

		await flow.start();

		expect(view.events).toEqual([]);
	});

	it("stops instead of reinstalling when the add-on was removed before the install", async () => {
		readiness["google-oauth"] = ready("update");
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();

		api.installUpdate.mockRejectedValue({ kind: "nothingStaged" });
		readiness["google-oauth"] = { state: "nothingStaged" };
		api.checkForUpdate.mockResolvedValue(offer("install"));
		view.activate();
		await settled();

		expect(api.startUpdateDownload).not.toHaveBeenCalled();
		expect(view.events.at(-1)).toBe("dismiss");
	});

	it("announces its own success and clears the stage", async () => {
		readiness["google-oauth"] = ready("update");
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		view.activate();
		await settled();

		emitOutcome(outcomeOf("google-oauth"));
		await settled();

		expect(view.events.slice(-2)).toEqual([
			"dismiss",
			"installed:update:v1.2.0",
		]);
		expect(api.takeInstallOutcome).not.toHaveBeenCalled();
	});

	it("ignores its own outcome when no install is in flight", async () => {
		readiness["google-oauth"] = ready("update");
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		const before = [...view.events];

		emitOutcome(outcomeOf("google-oauth"));
		await settled();

		expect(view.events).toEqual(before);
	});

	it("does not strand a download that a swiped offer cancels", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		view.swipe();

		emitProgress(progressOf("google-oauth", { received: 40 }));
		emitProgress(
			progressOf("google-oauth", { phase: "canceled", received: 40 }),
		);
		await settled();

		expect(flow.busy).toBe(false);
	});

	it("ignores an unnamed outcome, which only a self-install produces", async () => {
		readiness["google-oauth"] = ready("update");
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		view.activate();
		await settled();
		const before = [...view.events];

		emitOutcome({ succeeded: false, canceled: false, message: "boom" });
		await settled();

		expect(view.events).toEqual(before);
	});
});

describe("the app's own flow", () => {
	it("leaves a live success to the relaunch that follows it", async () => {
		readiness.app = ready("update", "v0.2.0");
		const { flow, view } = await flowFor("app");
		await flow.start();
		view.activate();
		await settled();

		emitOutcome(outcomeOf("app"));
		await settled();

		expect(view.events.at(-1)).toBe("show:installing");
	});
});

describe("a download that fails verification", () => {
	it.each<[ComponentKey, string]>([
		["google-oauth", "Failed to verify the companion app"],
		["app", "Failed to verify the update"],
	])("names what the %s flow downloaded", async (component, message) => {
		api.checkForUpdate.mockResolvedValue(offer("update", { component }));
		const { flow, view } = await flowFor(component);
		await flow.start();
		api.startUpdateDownload.mockRejectedValue({ kind: "signature" });

		view.activate();
		await settled();

		expect(view.problems()).toEqual([`problem:${message}`]);
	});
});

describe("the hourly check", () => {
	const HOUR_MS = 60 * 60 * 1000;

	beforeEach(() => {
		api.checkForUpdate.mockResolvedValue(
			offer("update", { component: "app", tag: "v0.2.0" }),
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("checks every hour and only once per start", async () => {
		const { flow } = await flowFor("app");
		vi.useFakeTimers();

		await flow.start();
		await flow.start();
		expect(api.checkForUpdate).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(HOUR_MS);

		expect(api.checkForUpdate).toHaveBeenCalledTimes(2);
		expect(api.checkForUpdate).toHaveBeenLastCalledWith("automatic", "app");
	});

	it("keeps a downloaded update on screen", async () => {
		readiness.app = ready("update", "v0.2.0");
		const { flow, view } = await flowFor("app");
		vi.useFakeTimers();
		await flow.start();

		await vi.advanceTimersByTimeAsync(HOUR_MS);

		expect(view.events).toEqual(["show:ready"]);
	});

	it("keeps an install that awaits its outcome busy", async () => {
		readiness.app = ready("update", "v0.2.0");
		const { flow, view } = await flowFor("app");
		vi.useFakeTimers();
		await flow.start();
		view.activate();
		await vi.advanceTimersByTimeAsync(0);

		await vi.advanceTimersByTimeAsync(HOUR_MS);

		expect(flow.busy).toBe(true);
		expect(view.events.at(-1)).toBe("show:installing");
	});
});

describe("installing on request", () => {
	it("runs check, download and install from one tap", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		const { flow, view } = await flowFor("google-oauth");

		await flow.installNow();
		expect(api.checkForUpdate).toHaveBeenCalledWith(
			"manual",
			"google-oauth",
		);
		expect(api.installUpdate).not.toHaveBeenCalled();

		readiness["google-oauth"] = ready("install");
		emitProgress(
			progressOf("google-oauth", { phase: "ready", received: 100 }),
		);
		await settled();

		expect(api.installUpdate).toHaveBeenCalledWith("google-oauth");
		expect(view.events.at(-1)).toBe("show:installing");
	});

	it("does not prompt again after the system dialog is cancelled", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		const { flow } = await flowFor("google-oauth");
		await flow.installNow();
		readiness["google-oauth"] = ready("install");
		const downloaded = progressOf("google-oauth", {
			phase: "ready",
			received: 100,
		});
		emitProgress(downloaded);
		await settled();

		emitOutcome(
			outcomeOf("google-oauth", { succeeded: false, canceled: true }),
		);
		await settled();
		emitProgress(downloaded);
		await settled();

		expect(api.installUpdate).toHaveBeenCalledTimes(1);
	});

	it("keeps the tap as consent when the asset is replaced mid-download", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		const { flow } = await flowFor("google-oauth");
		await flow.installNow();

		emitProgress(
			progressOf("google-oauth", {
				phase: "failed",
				detail: { kind: "assetReplaced" },
			}),
		);
		await settled();
		expect(api.startUpdateDownload).toHaveBeenCalledTimes(2);

		readiness["google-oauth"] = ready("install");
		emitProgress(
			progressOf("google-oauth", { phase: "ready", received: 100 }),
		);
		await settled();

		expect(api.installUpdate).toHaveBeenCalledWith("google-oauth");
	});

	it("keeps the tap as consent when the download is refused because the asset was replaced", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		api.startUpdateDownload.mockRejectedValueOnce({
			kind: "assetReplaced",
		});
		const { flow } = await flowFor("google-oauth");
		await flow.installNow();
		await settled();
		expect(api.startUpdateDownload).toHaveBeenCalledTimes(2);

		readiness["google-oauth"] = ready("install");
		emitProgress(
			progressOf("google-oauth", { phase: "ready", received: 100 }),
		);
		await settled();

		expect(api.installUpdate).toHaveBeenCalledWith("google-oauth");
	});

	it("does not install a download the user cancelled and resumed from the toast", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.installNow();

		emitProgress(
			progressOf("google-oauth", { phase: "canceled", received: 40 }),
		);
		view.activate();
		await settled();
		expect(api.startUpdateDownload).toHaveBeenCalledTimes(2);

		readiness["google-oauth"] = ready("install");
		emitProgress(
			progressOf("google-oauth", { phase: "ready", received: 100 }),
		);
		await settled();

		expect(api.installUpdate).not.toHaveBeenCalled();
	});

	it("takes a retry tap after a download failed", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		const { flow } = await flowFor("google-oauth");
		await flow.installNow();
		emitProgress(
			progressOf("google-oauth", {
				phase: "failed",
				detail: { kind: "network" },
			}),
		);
		await settled();

		readiness["google-oauth"] = resumable("install");
		await flow.installNow();

		expect(api.startUpdateDownload).toHaveBeenCalledTimes(2);
	});

	it("ignores a second tap while its download is on screen", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		const { flow } = await flowFor("google-oauth");
		await flow.installNow();
		emitProgress(progressOf("google-oauth", { received: 40 }));

		readiness["google-oauth"] = resumable("install");
		await flow.installNow();

		expect(api.startUpdateDownload).toHaveBeenCalledTimes(1);
	});

	it("stays installing when a ready progress arrives mid-install", async () => {
		api.installUpdate.mockReturnValue(new Promise(() => {}));
		readiness["google-oauth"] = ready("install");
		const { flow, view } = await flowFor("google-oauth");
		void flow.installNow();
		await settled();

		emitProgress(
			progressOf("google-oauth", { phase: "ready", received: 100 }),
		);
		await settled();

		expect(view.events.at(-1)).toBe("show:installing");
	});

	it("installs the release the backend actually started, not the stale stage", async () => {
		readiness["google-oauth"] = resumable("install", "v1.1.0");
		api.startUpdateDownload.mockResolvedValue(
			progressOf("google-oauth", { tag: "v1.3.0", version: "1.3.0" }),
		);
		const { flow } = await flowFor("google-oauth");

		await flow.installNow();
		readiness["google-oauth"] = ready("install", "v1.3.0");
		emitProgress(
			progressOf("google-oauth", { phase: "ready", tag: "v1.3.0" }),
		);
		await settled();

		expect(api.installUpdate).toHaveBeenCalledWith("google-oauth");
	});

	it("says installed, not updated, when a first install finishes", async () => {
		readiness["google-oauth"] = ready("install");
		const { flow, view } = await flowFor("google-oauth");
		await flow.installNow();

		emitOutcome(outcomeOf("google-oauth"));
		await settled();

		expect(view.events.at(-1)).toBe("installed:install:v1.2.0");
	});

	it("ignores a ready download it did not ask for", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		const { flow } = await flowFor("google-oauth");
		await flow.installNow();

		readiness["google-oauth"] = ready("install", "v9.9.9");
		emitProgress(
			progressOf("google-oauth", { phase: "ready", tag: "v9.9.9" }),
		);
		await settled();

		expect(api.installUpdate).not.toHaveBeenCalled();
	});

	it("installs a download that is already verified without fetching again", async () => {
		readiness["google-oauth"] = ready("install");
		const { flow } = await flowFor("google-oauth");

		await flow.installNow();

		expect(api.checkForUpdate).not.toHaveBeenCalled();
		expect(api.installUpdate).toHaveBeenCalledWith("google-oauth");
	});

	it("checks instead of stopping when the partial download is refused", async () => {
		readiness["google-oauth"] = resumable("install", "v1.1.0");
		api.startUpdateDownload.mockRejectedValueOnce({
			kind: "nothingStaged",
		});
		api.checkForUpdate.mockResolvedValue(unpublished);
		const { flow, view } = await flowFor("google-oauth");

		await flow.installNow();

		expect(api.checkForUpdate).toHaveBeenCalledWith(
			"manual",
			"google-oauth",
		);
		expect(view.events.at(-1)).toBe(
			"problem:The companion app isn't published for this device",
		);
	});

	it("shows the offer again when a tap follows a swipe and the download is canceled", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		view.swipe();
		readiness["google-oauth"] = resumable("update");

		await flow.installNow();
		emitProgress(
			progressOf("google-oauth", { phase: "canceled", received: 10 }),
		);
		await settled();

		expect(flow.busy).toBe(false);
		expect(view.events.at(-1)).toBe("show:paused");

		await flow.installNow();

		expect(api.startUpdateDownload).toHaveBeenCalledTimes(2);
	});

	it("shows the offer again when a tap follows a swipe and the queue is busy", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		view.swipe();
		readiness["google-oauth"] = resumable("update");
		api.startUpdateDownload.mockRejectedValue({ kind: "busy" });

		await flow.installNow();

		expect(flow.busy).toBe(false);
		expect(view.events.slice(-3)).toEqual([
			"show:downloading",
			"show:paused",
			"problem:Another download is already running",
		]);
	});

	it("tells an installed, current add-on apart from an unpublished one", async () => {
		const { flow, view } = await flowFor("google-oauth");

		await flow.installNow();
		api.checkForUpdate.mockResolvedValue(unpublished);
		await flow.installNow();

		expect(view.events).toEqual([
			"upToDate",
			"problem:The companion app isn't published for this device",
		]);
	});

	it("names the companion app when its store owns its updates", async () => {
		readiness["google-oauth"] = {
			state: "unsupported",
			detail: {
				reason: "externallyManaged",
				detail: { installer: "org.fdroid.fdroid" },
			},
		};
		const { flow, view } = await flowFor("google-oauth");

		await flow.installNow();

		expect(view.problems()).toEqual([
			"problem:The store that installed the companion app manages its updates",
		]);
	});
});

describe("switching presenters", () => {
	it("moves a visible download to the new presenter", async () => {
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		emitProgress(progressOf("google-oauth", { received: 40 }));
		const inline = recorder();

		flow.present(inline.presenter);

		expect(view.events.at(-1)).toBe("dismiss");
		expect(inline.events).toEqual(["show:downloading"]);
	});
});
