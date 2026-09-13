import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	awaitingPermission,
	offer,
	outcomeOf,
	progressOf,
	ready,
	settled,
	toastsFake,
	unpublished,
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

async function watched() {
	const { AddonInstaller } = await import("./addon.svelte");
	const installer = new AddonInstaller();
	installer.watch();
	return installer;
}

async function downloaded(installer: { install: () => Promise<void> }) {
	await installer.install();
	readiness["google-oauth"] = ready("install");
	emitProgress(progressOf("google-oauth", { phase: "ready", received: 100 }));
	await settled();
}

describe("the add-on installer on the sign-in screen", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		fake.reset();
		platform.isAndroidPlatform.mockReturnValue(true);
		api.checkForUpdate.mockResolvedValue(offer("install"));
	});

	it("addresses the add-on, never the app", async () => {
		const installer = await watched();

		await installer.install();

		expect(api.checkForUpdate).toHaveBeenCalledWith(
			"manual",
			"google-oauth",
		);
		expect(api.startUpdateDownload).toHaveBeenCalledWith("google-oauth");
		expect(installer.stage).toBe("downloading");
	});

	it("follows the download into the install and reports success", async () => {
		const installer = await watched();
		await installer.install();

		emitProgress(progressOf("google-oauth", { received: 40 }));
		expect(installer.fraction).toBe(0.4);

		await downloaded(installer);
		expect(installer.stage).toBe("installing");

		emitOutcome(outcomeOf("google-oauth"));
		await settled();

		expect(installer.stage).toBe("done");
		expect(toasts.showStage).not.toHaveBeenCalled();
	});

	it("returns to a tappable state when the system dialog is cancelled", async () => {
		const installer = await watched();
		await downloaded(installer);
		expect(installer.stage).toBe("installing");

		emitOutcome(
			outcomeOf("google-oauth", { succeeded: false, canceled: true }),
		);
		await settled();

		expect(installer.stage).toBe("ready");
		expect(installer.busy).toBe(false);
	});

	it("keeps the download tappable and shows why the install was refused", async () => {
		const installer = await watched();
		await downloaded(installer);

		emitOutcome(
			outcomeOf("google-oauth", {
				succeeded: false,
				message: "conflicts with an installed package",
			}),
		);
		await settled();

		expect(installer.stage).toBe("ready");
		expect(installer.message).toBe("conflicts with an installed package");
	});

	it("keeps the download tappable when the permission screen will not open", async () => {
		readiness["google-oauth"] = awaitingPermission("install");
		api.openInstallPermissionSettings.mockRejectedValue(
			new Error("no activity"),
		);
		const installer = await watched();

		await installer.install();

		expect(installer.stage).toBe("ready");
		expect(installer.message).toBe(
			"Couldn't open the install permission screen",
		);
	});

	it("reads the installed version when the screen opens and again after an install", async () => {
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		const installer = await watched();
		expect(installer.installed).toBe(false);
		await settled();

		expect(api.getInstalledVersion).toHaveBeenCalledWith("google-oauth");
		expect(installer.installedVersion).toBe("1.1.0");
		expect(installer.installed).toBe(true);

		api.getInstalledVersion.mockResolvedValue("1.2.0");
		await downloaded(installer);
		emitOutcome(outcomeOf("google-oauth"));
		await settled();

		expect(installer.installedVersion).toBe("1.2.0");
	});

	it("keeps the newest version read when an earlier read answers last", async () => {
		let answerFirstRead: (version: string | null) => void = () => {};
		api.getInstalledVersion.mockReturnValueOnce(
			new Promise((resolve) => {
				answerFirstRead = resolve;
			}),
		);
		api.getInstalledVersion.mockResolvedValue("1.2.0");
		const installer = await watched();
		await downloaded(installer);
		emitOutcome(outcomeOf("google-oauth"));
		await settled();

		answerFirstRead(null);
		await settled();

		expect(installer.installedVersion).toBe("1.2.0");
	});

	it("treats an unreadable installed version as not installed", async () => {
		api.getInstalledVersion.mockRejectedValue(new Error("no plugin"));
		const installer = await watched();
		await settled();

		expect(installer.installedVersion).toBeNull();
		expect(installer.installed).toBe(false);
	});

	it("tells an up-to-date companion apart from a finished install", async () => {
		api.checkForUpdate.mockResolvedValue(upToDate);
		const installer = await watched();

		await installer.install();

		expect(installer.stage).toBe("upToDate");
		expect(installer.message).toBeNull();
		expect(installer.busy).toBe(false);
	});

	it("says so when this device has no published asset", async () => {
		api.checkForUpdate.mockResolvedValue(unpublished);
		const installer = await watched();

		await installer.install();

		expect(installer.stage).toBe("failed");
		expect(installer.message).toBe(
			"The companion app isn't published for this device",
		);
	});

	it("maps a refusal from the backend to its copy", async () => {
		api.checkForUpdate.mockRejectedValue({ kind: "network" });
		const installer = await watched();

		await installer.install();

		expect(installer.stage).toBe("failed");
		expect(installer.message).toBe("Couldn't reach the release server");
	});

	it("refuses to start a second run while one is in flight", async () => {
		const installer = await watched();

		await Promise.all([installer.install(), installer.install()]);

		expect(api.checkForUpdate).toHaveBeenCalledTimes(1);
	});

	it("hands a running download back to the toast when the screen closes", async () => {
		const installer = await watched();
		await installer.install();

		installer.unwatch();

		expect(toasts.showStage).toHaveBeenCalledWith(
			expect.objectContaining({
				component: "google-oauth",
				kind: "install",
				view: expect.objectContaining({ stage: "downloading" }),
			}),
		);
	});

	it("hands an install in progress to the toast and lets the toast announce it", async () => {
		const installer = await watched();
		await downloaded(installer);
		expect(installer.stage).toBe("installing");

		installer.unwatch();
		expect(toasts.showStage).toHaveBeenLastCalledWith(
			expect.objectContaining({
				view: expect.objectContaining({ stage: "installing" }),
			}),
		);

		emitOutcome(outcomeOf("google-oauth"));
		await settled();

		expect(toasts.showAddonInstalled).toHaveBeenCalledWith({
			component: "google-oauth",
			tag: "v1.2.0",
			kind: "install",
		});
		expect(installer.stage).toBe("idle");
	});

	it("shows an update the flow found while the screen is open", async () => {
		const installer = await watched();
		const { addonUpdates } = await import("./addon.svelte");
		api.checkForUpdate.mockResolvedValue(offer("update"));

		await addonUpdates.checkNow();

		expect(installer.stage).toBe("available");
	});

	it("remembers whether the finished run installed or updated", async () => {
		const installer = await watched();
		await downloaded(installer);

		emitOutcome(outcomeOf("google-oauth"));
		await settled();

		expect(installer.stage).toBe("done");
		expect(installer.finishedKind).toBe("install");
	});

	it("leaves the toast in charge when it cannot install here", async () => {
		platform.isAndroidPlatform.mockReturnValue(false);
		const installer = await watched();
		const { addonUpdates } = await import("./addon.svelte");

		await addonUpdates.installNow();

		expect(toasts.showStage).toHaveBeenCalled();
		expect(installer.stage).toBe("idle");
	});

	it("does nothing at all off Android", async () => {
		platform.isAndroidPlatform.mockReturnValue(false);
		const installer = await watched();

		await installer.install();

		expect(api.checkForUpdate).not.toHaveBeenCalled();
		expect(installer.stage).toBe("idle");
	});
});

describe("the add-on button label", () => {
	it("names each stage of a run", async () => {
		const { addonStageLabel } = await import("./addon.svelte");
		const label = (stage: Parameters<typeof addonStageLabel>[0]) =>
			addonStageLabel(stage, { installed: false });

		expect(label("checking")).toBe("Checking");
		expect(label("downloading")).toBe("Downloading");
		expect(label("verifying")).toBe("Verifying");
		expect(label("ready")).toBe("Install");
		expect(label("installing")).toBe("Installing");
		expect(label("failed")).toBe("Try again");
		expect(label("available")).toBe("Install");
		expect(addonStageLabel("available", { installed: true })).toBe(
			"Update",
		);
	});

	it("offers an update check once the add-on is installed", async () => {
		const { addonStageLabel } = await import("./addon.svelte");

		for (const stage of ["idle", "done", "upToDate"] as const) {
			expect(addonStageLabel(stage, { installed: true })).toBe(
				"Check for update",
			);
			expect(addonStageLabel(stage, { installed: false })).toBe(
				"Install",
			);
		}
		expect(
			addonStageLabel("idle", {
				installed: false,
				installLabel: "Install here",
			}),
		).toBe("Install here");
		expect(
			addonStageLabel("idle", {
				installed: true,
				installLabel: "Install here",
			}),
		).toBe("Check for update");
	});
});
