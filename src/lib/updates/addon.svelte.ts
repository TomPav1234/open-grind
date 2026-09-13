import { isAndroidPlatform } from "$lib/platform/os";
import { type ComponentKey, GOOGLE_OAUTH_COMPONENT } from "./components";
import { type InstallKind, type StagePresenter, UpdateFlow } from "./flow";
import { getInstalledVersion, updatesAvailableHere } from "./index";
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
	{
		installed,
		installLabel = "Install",
	}: { installed: boolean; installLabel?: string },
): string {
	switch (stage) {
		case "available":
			return installed ? "Update" : installLabel;
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
			return installed ? "Check for update" : installLabel;
	}
}

export const addonUpdates = new UpdateFlow({
	component: GOOGLE_OAUTH_COMPONENT,
	presenter: toastPresenter(GOOGLE_OAUTH_COMPONENT),
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

	readonly component: ComponentKey;
	readonly #flow: UpdateFlow;
	readonly #inline: StagePresenter;
	#watching = false;
	#versionReads = 0;

	constructor(flow: UpdateFlow = addonUpdates) {
		this.component = flow.component;
		this.#flow = flow;
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
		this.#flow.present(this.#inline);
		void this.#readInstalledVersion();
	}

	unwatch(): void {
		if (!this.#watching) return;
		this.#watching = false;
		this.#flow.present(toastPresenter(this.component));
	}

	async install(): Promise<void> {
		if (this.busy || !addonInstallerAvailable()) return;
		this.stage = "checking";
		this.message = null;
		this.received = 0;
		this.total = 0;
		await this.#flow.installNow();
		if (this.stage === "checking") this.stage = "idle";
	}

	async #readInstalledVersion(): Promise<void> {
		const read = ++this.#versionReads;
		const version = await getInstalledVersion(this.component).catch(
			() => null,
		);
		if (read === this.#versionReads) this.installedVersion = version;
	}

	#report(message: string): void {
		this.message = message;
		if (this.stage !== "ready") this.stage = "failed";
	}
}
