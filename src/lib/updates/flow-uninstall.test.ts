import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	awaitingPermission,
	flowFor,
	offer,
	progressOf,
	ready,
	settled,
	updateApiFake,
	upToDate,
} from "./updates-test-helpers";

const fake = updateApiFake();
const { api, readiness, emitProgress } = fake;

vi.mock("./index", async () => ({
	...(await import("./types")),
	...(await import("./components")),
	...fake.api,
}));

beforeEach(() => {
	vi.resetModules();
	fake.reset();
});

describe("an add-on uninstalled while its update is on screen", () => {
	it("stops instead of reinstalling when the add-on is removed as its install starts", async () => {
		readiness["google-oauth"] = ready("update");
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		api.getUpdateReadiness.mockResolvedValueOnce(ready("update"));
		readiness["google-oauth"] = { state: "nothingStaged" };
		api.installUpdate.mockRejectedValue({ kind: "nothingStaged" });

		view.activate();
		await settled();

		expect(api.installUpdate).toHaveBeenCalledOnce();
		expect(api.startUpdateDownload).not.toHaveBeenCalled();
		expect(api.discardStagedUpdate).toHaveBeenCalledWith("google-oauth");
		expect(view.events).toEqual([
			"show:ready",
			"show:installing",
			"show:ready",
			"dismiss",
		]);
		expect(view.problems()).toEqual([]);
	});

	it("clears an offer tapped after the add-on was uninstalled", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		api.startUpdateDownload.mockRejectedValue({ kind: "nothingStaged" });

		view.activate();
		await settled();

		expect(view.events).toEqual([
			"show:available",
			"show:downloading",
			"dismiss",
		]);
		expect(api.discardStagedUpdate).toHaveBeenCalledWith("google-oauth");
		expect(view.problems()).toEqual([]);
	});

	it.each([
		["awaits install permission", awaitingPermission("update")],
		["may install at once", ready("update")],
	])(
		"clears a downloaded update tapped after the add-on was uninstalled while Open Grind %s",
		async (_, downloaded) => {
			readiness["google-oauth"] = downloaded;
			const { flow, view } = await flowFor("google-oauth");
			await flow.start();
			readiness["google-oauth"] = { state: "nothingStaged" };
			api.getInstalledVersion.mockResolvedValue(null);

			view.activate();
			await settled();

			expect(api.openInstallPermissionSettings).not.toHaveBeenCalled();
			expect(api.checkForUpdate).not.toHaveBeenCalled();
			expect(api.installUpdate).not.toHaveBeenCalled();
			expect(api.discardStagedUpdate).toHaveBeenCalledWith(
				"google-oauth",
			);
			expect(view.events).toEqual(["show:ready", "dismiss"]);
		},
	);

	it("downloads a vanished update again while the add-on stays installed", async () => {
		readiness["google-oauth"] = awaitingPermission("update");
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		readiness["google-oauth"] = { state: "nothingStaged" };
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		api.checkForUpdate.mockResolvedValue(offer("update"));

		view.activate();
		await settled();

		expect(api.openInstallPermissionSettings).not.toHaveBeenCalled();
		expect(api.checkForUpdate).toHaveBeenCalledWith(
			"manual",
			"google-oauth",
		);
		expect(api.startUpdateDownload).toHaveBeenCalledWith("google-oauth");
	});

	it("clears a downloaded update when the add-on is uninstalled behind the permission screen", async () => {
		readiness["google-oauth"] = awaitingPermission("update");
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		view.activate();
		await settled();
		expect(api.openInstallPermissionSettings).toHaveBeenCalledOnce();

		readiness["google-oauth"] = { state: "nothingStaged" };
		document.dispatchEvent(new Event("visibilitychange"));
		await settled();

		expect(view.events).toEqual(["show:ready", "dismiss"]);
		expect(api.installUpdate).not.toHaveBeenCalled();
	});

	it("says why a downloaded update can no longer install", async () => {
		readiness["google-oauth"] = awaitingPermission("update");
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		readiness["google-oauth"] = {
			state: "unsupported",
			detail: {
				reason: "externallyManaged",
				detail: { installer: "org.fdroid.fdroid" },
			},
		};

		view.activate();
		await settled();

		expect(api.openInstallPermissionSettings).not.toHaveBeenCalled();
		expect(api.installUpdate).not.toHaveBeenCalled();
		expect(view.events).toEqual([
			"show:ready",
			"dismiss",
			"problem:The store that installed the companion app manages its updates",
		]);
	});
});

describe("an update offer withdrawn after the add-on was uninstalled", () => {
	it("leaves the screen and discards its download", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();

		await flow.withdrawUpdate();

		expect(view.events).toEqual(["show:available", "dismiss"]);
		expect(api.discardStagedUpdate).toHaveBeenCalledWith("google-oauth");
	});

	it("stays gone when the cancelled download reports back late", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		view.activate();
		await settled();
		emitProgress(progressOf("google-oauth", { received: 40 }));

		await flow.withdrawUpdate();
		emitProgress(
			progressOf("google-oauth", { phase: "canceled", received: 40 }),
		);
		await settled();

		expect(view.events.at(-1)).toBe("dismiss");
	});

	it("leaves a first install on screen", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.installNow();

		await flow.withdrawUpdate();

		expect(view.events).toEqual(["show:downloading"]);
		expect(api.discardStagedUpdate).not.toHaveBeenCalled();
	});

	it("leaves an install that awaits its outcome on screen", async () => {
		readiness["google-oauth"] = ready("update");
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		view.activate();
		await settled();

		await flow.withdrawUpdate();

		expect(view.events).toEqual(["show:ready", "show:installing"]);
		expect(api.discardStagedUpdate).not.toHaveBeenCalled();
	});

	it("has nothing to withdraw when no offer is on screen", async () => {
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();

		await flow.withdrawUpdate();

		expect(view.events).toEqual([]);
		expect(api.discardStagedUpdate).not.toHaveBeenCalled();
	});
});

describe("an offer the hourly check no longer finds", () => {
	const HOUR_MS = 60 * 60 * 1000;

	afterEach(() => {
		vi.useRealTimers();
	});

	it("is withdrawn", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		vi.useFakeTimers();
		await flow.start();
		api.checkForUpdate.mockResolvedValue(upToDate);

		await vi.advanceTimersByTimeAsync(HOUR_MS);

		expect(view.events).toEqual(["show:available", "dismiss"]);
	});

	it("stays on screen when the next check fails", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		vi.useFakeTimers();
		await flow.start();
		api.checkForUpdate.mockRejectedValue({ kind: "network" });

		await vi.advanceTimersByTimeAsync(HOUR_MS);

		expect(view.events).toEqual(["show:available"]);
	});
});
