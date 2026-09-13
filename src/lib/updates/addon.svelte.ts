import { isAndroidPlatform } from "$lib/platform/os";
import { GOOGLE_OAUTH_COMPONENT } from "./components";
import { type InstallKind, type StagePresenter, UpdateFlow } from "./flow";
import { getInstalledVersion, updatesAvailableHere } from "./index";
import type { UpdateStage } from "./stage";
import { toastPresenter } from "./toast-presenter";

export type AddonStage =
	| "idle"
	| "checking"
	| "downloading"
	| "verifying"
	| "available"
	| "ready"
	| "installing"
	| "done"
	| "upToDate"
	| "failed";

export function addonInstallerAvailable(): boolean {
	return updatesAvailableHere() && isAndroidPlatform();
}

export function addonStageLabel(
	stage: AddonStage,
	{ installed }: { installed: boolean },
): string {
	switch (stage) {
		case "available":
			return installed ? "Update" : "Install";
		case "checking":
			return "Checking";
		case "downloading":
			return "Downloading";
		case "verifying":
			return "Verifying";
		case "ready":
			return "Install";
		case "installing":
			return "Installing";
		case "failed":
			return "Try again";
		case "idle":
		case "done":
		case "upToDate":
			return installed ? "Check for update" : "Install";
	}
}

const activity = $state<{ stage: UpdateStage | null; installs: number }>({
	stage: null,
	installs: 0,
});

export const addonActivity = {
	get stage(): UpdateStage | null {
		return activity.stage;
	},
	get installs(): number {
		return activity.installs;
	},
};

function observed(presenter: StagePresenter): StagePresenter {
	let showing = 0;
	return {
		show: (args) => {
			const shown = ++showing;
			activity.stage = args.view.stage;
			presenter.show({
				...args,
				onDismiss: () => {
					if (shown === showing) activity.stage = null;
					args.onDismiss();
				},
			});
		},
		dismiss: () => {
			showing++;
			activity.stage = null;
			presenter.dismiss();
		},
		problem: (title) => presenter.problem(title),
		manualInstall: (body) => presenter.manualInstall(body),
		installed: (args) => {
			activity.installs++;
			presenter.installed(args);
		},
		upToDate: () => presenter.upToDate(),
	};
}

const addonToasts = observed(toastPresenter(GOOGLE_OAUTH_COMPONENT));

export const addonUpdates = new UpdateFlow({
	component: GOOGLE_OAUTH_COMPONENT,
	presenter: addonToasts,
});

export async function startAddonUpdateWatch(): Promise<void> {
	if (!addonInstallerAvailable()) return;
	await addonUpdates.start();
}

export class AddonInstaller {
	stage = $state<AddonStage>("idle");
	received = $state(0);
	total = $state(0);
	message = $state<string | null>(null);
	installedVersion = $state<string | null | undefined>(undefined);
	finishedKind = $state<InstallKind | null>(null);

	readonly #inline: StagePresenter;
	#watching = false;
	#versionReads = 0;

	constructor() {
		this.#inline = {
			show: ({ view }) => {
				this.received = view.received;
				this.total = view.total;
				this.stage = view.stage === "paused" ? "available" : view.stage;
			},
			dismiss: () => {
				if (
					this.busy ||
					this.stage === "ready" ||
					this.stage === "available"
				) {
					this.stage = "idle";
				}
			},
			problem: (title) => this.#report(title),
			manualInstall: (body) => this.#report(body),
			installed: ({ kind }) => {
				this.stage = "done";
				this.finishedKind = kind;
				this.message = null;
				void this.#readInstalledVersion();
			},
			upToDate: () => {
				this.stage = "upToDate";
				this.message = null;
			},
		};
	}

	get busy(): boolean {
		return (
			this.stage === "checking" ||
			this.stage === "downloading" ||
			this.stage === "verifying" ||
			this.stage === "installing"
		);
	}

	get installed(): boolean {
		return typeof this.installedVersion === "string";
	}

	get fraction(): number {
		return this.total > 0 ? Math.min(1, this.received / this.total) : 0;
	}

	watch(): void {
		if (!addonInstallerAvailable() || this.#watching) return;
		this.#watching = true;
		addonUpdates.present(this.#inline);
		void this.#readInstalledVersion();
	}

	unwatch(): void {
		if (!this.#watching) return;
		this.#watching = false;
		addonUpdates.present(addonToasts);
	}

	async install(): Promise<void> {
		if (this.busy || !addonInstallerAvailable()) return;
		this.stage = "checking";
		this.message = null;
		this.received = 0;
		this.total = 0;
		await addonUpdates.installNow();
		if (this.stage === "checking") this.stage = "idle";
	}

	async #readInstalledVersion(): Promise<void> {
		const read = ++this.#versionReads;
		const version = await getInstalledVersion(GOOGLE_OAUTH_COMPONENT).catch(
			() => null,
		);
		if (read === this.#versionReads) this.installedVersion = version;
	}

	#report(message: string): void {
		this.message = message;
		if (this.stage !== "ready") this.stage = "failed";
	}
}
