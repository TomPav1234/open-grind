import {
	APP_COMPONENT,
	COMPONENT_PACKAGE,
	type ComponentKey,
} from "./components";
import { unsupportedText, updateErrorText } from "./error-copy";
import {
	asUpdateError,
	cancelUpdateDownload,
	checkForUpdate,
	discardStagedUpdate,
	getUpdateProgress,
	getUpdateReadiness,
	installPending,
	installUpdate,
	onInstallFinished,
	onUpdateProgress,
	openInstallPermissionSettings,
	startUpdateDownload,
	takeInstallOutcome,
} from "./index";
import { stageOf, type StageView } from "./stage";
import type { CheckResult, InstallOutcome, Release } from "./types";

export type Trigger = "launch" | "manual" | "automatic";
export type InstallKind = Release["kind"];

export type StagePresenter = {
	show(args: {
		view: StageView;
		kind: InstallKind;
		onActivate: () => void;
		onCancel: () => void;
		onDismiss: () => void;
	}): void;
	dismiss(): void;
	problem(title: string): void;
	manualInstall(body: string): void;
	installed(args: { tag: string | null; kind: InstallKind }): void;
	upToDate(): void;
};

const fromScratch = { received: 0, total: 0 };
const AUTOMATIC_CHECK_TICK_MS = 60 * 60 * 1000;

type InstallClaim = { flow: UpdateFlow; committing: boolean };

let installOwner: InstallClaim | null = null;
let permissionOwner: ComponentKey | null = null;

export class UpdateFlow {
	readonly component: ComponentKey;
	#presenter: StagePresenter;
	#shown: StageView = { stage: "available", ...fromScratch };
	#visible = false;
	#installedFrom: StageView | null = null;
	#readyTag: string | null = null;
	#readyKind: InstallKind = "update";
	#showing = 0;
	#armedTag: string | null = null;
	#canInstallNow = false;
	#installing = false;
	#settling: Promise<boolean> | null = null;
	#dismissed = false;
	#autoRefetched = false;
	#following = false;
	#started = false;

	constructor({
		component,
		presenter,
	}: {
		component: ComponentKey;
		presenter: StagePresenter;
	}) {
		this.component = component;
		this.#presenter = presenter;
	}

	get #ownsInstallLedger(): boolean {
		return this.component === APP_COMPONENT;
	}

	get busy(): boolean {
		const { stage } = this.#shown;
		return (
			this.#visible &&
			(stage === "downloading" ||
				stage === "verifying" ||
				stage === "installing")
		);
	}

	present(presenter: StagePresenter): void {
		if (presenter === this.#presenter) return;
		if (this.#visible) {
			this.#showing++;
			this.#presenter.dismiss();
		}
		this.#presenter = presenter;
		if (this.#visible) this.#show(this.#shown);
	}

	async start(): Promise<void> {
		if (this.#started) return;
		this.#started = true;
		this.#follow();
		setInterval(() => {
			void this.#backgroundCheck("automatic");
		}, AUTOMATIC_CHECK_TICK_MS);
		if (this.#ownsInstallLedger) await this.#announceLastInstall();

		const running = await getUpdateProgress().catch(() => null);
		const resumed =
			running?.component === this.component && stageOf(running);
		if (
			resumed &&
			"view" in resumed &&
			resumed.view.stage === "downloading" &&
			(await this.#download(resumed.view))
		) {
			return;
		}
		if (await this.#settle({ atLaunch: true })) return;
		await this.#offerCheck("launch");
	}

	async checkNow(): Promise<void> {
		this.#follow();
		await this.#backgroundCheck("manual");
	}

	async installNow(): Promise<void> {
		this.#follow();
		this.#dismissed = false;
		if (this.busy || this.#installing) return;
		const readiness = await getUpdateReadiness(this.component).catch(
			() => null,
		);
		switch (readiness?.state) {
			case "ready":
				this.#canInstallNow = readiness.detail.canInstallNow;
				this.#readyTag = readiness.detail.tag;
				this.#readyKind = readiness.detail.kind;
				this.#show({ stage: "ready", received: 1, total: 1 });
				await this.#install();
				return;
			case "resumable": {
				this.#readyKind = readiness.detail.kind;
				this.#armedTag = readiness.detail.tag;
				const handled = await this.#download(fromScratch, {
					byUser: true,
					arm: true,
				});
				if (handled) return;
				break;
			}
			case "unsupported":
				this.#presenter.problem(
					unsupportedText(readiness.detail, this.component),
				);
				return;
		}

		const result = await this.#check("manual", { byUser: true });
		if (!result) return;
		if (!result.available || !result.release) {
			if (result.currentVersion === null) {
				this.#presenter.problem(
					unsupportedText(
						{ reason: "noReleaseArtifacts" },
						this.component,
					),
				);
			} else {
				this.#presenter.upToDate();
			}
			return;
		}
		this.#readyKind = result.release.kind;
		this.#armedTag = result.release.tag;
		await this.#download(fromScratch, { byUser: true, arm: true });
	}

	async #activate(): Promise<void> {
		if (
			this.#shown.stage === "available" ||
			this.#shown.stage === "paused"
		) {
			await this.#download(this.#shown, { byUser: true });
			return;
		}
		await this.#install();
	}

	async #download(
		{ received, total }: { received: number; total: number },
		{
			byUser = false,
			arm = false,
		}: { byUser?: boolean; arm?: boolean } = {},
	): Promise<boolean> {
		const before = this.#visible ? this.#shown : null;
		this.#show({ stage: "downloading", received, total });
		try {
			const started = await startUpdateDownload(this.component);
			if (arm) this.#armedTag = started.tag;
			return true;
		} catch (error) {
			const kind = asUpdateError(error)?.kind;
			if (kind === "busy") {
				this.#armedTag = null;
				this.#show(before ?? { stage: "paused", received, total });
				if (byUser) this.#presenter.problem(this.#text(error, ""));
				return true;
			}
			if (kind !== "nothingStaged") {
				if (kind !== "assetReplaced") this.#armedTag = null;
				this.#reportFailure(error);
				return true;
			}
			this.#armedTag = null;
			await discardStagedUpdate(this.component).catch(() => undefined);
			this.#hide();
			return false;
		}
	}

	async #install(): Promise<void> {
		if (this.#installing) return;
		this.#installing = true;
		const ready: StageView = { ...this.#shown, stage: "ready" };
		try {
			const claim = await this.#claimInstall();
			if (!claim) {
				this.#presenter.problem("Finish the other install first");
				return;
			}
			if (!this.#canInstallNow) {
				this.#canInstallNow = await this.#permittedToInstall();
			}
			if (!this.#canInstallNow) {
				this.#releaseInstall();
				await this.#requestInstallPermission();
				return;
			}
			this.#show({ ...ready, stage: "installing" });
			this.#installedFrom = ready;
			await installUpdate(this.component);
			claim.committing = false;
		} catch (error) {
			this.#releaseInstall();
			this.#show(ready);
			switch (asUpdateError(error)?.kind) {
				case "needsUnknownSources":
					this.#canInstallNow = false;
					await this.#requestInstallPermission();
					return;
				case "needsManualInstall":
					this.#hide();
					this.#presenter.manualInstall(
						updateErrorText(error, "Drag it onto Applications"),
					);
					return;
				case "nothingStaged":
					await this.#downloadAgain();
					return;
				default:
					this.#presenter.problem(
						this.#text(error, "Couldn't install the update"),
					);
			}
		} finally {
			this.#installing = false;
		}
	}

	async #claimInstall(): Promise<InstallClaim | null> {
		const owner = installOwner;
		if (owner && owner.flow !== this) {
			if (owner.committing) return null;
			if (await installPending().catch(() => true)) return null;
			if (installOwner !== owner) return this.#claimInstall();
			owner.flow.#yieldInstall();
		}
		const claim = { flow: this, committing: true };
		installOwner = claim;
		return claim;
	}

	#yieldInstall(): void {
		this.#releaseInstall();
		this.#hide();
		void this.#settle();
	}

	async #permittedToInstall(): Promise<boolean> {
		const readiness = await getUpdateReadiness(this.component).catch(
			() => null,
		);
		return readiness?.state === "ready" && readiness.detail.canInstallNow;
	}

	#releaseInstall(): void {
		this.#installedFrom = null;
		if (installOwner?.flow === this) installOwner = null;
	}

	async #requestInstallPermission(): Promise<void> {
		try {
			await openInstallPermissionSettings();
		} catch (error) {
			this.#presenter.problem(
				this.#text(
					error,
					"Couldn't open the install permission screen",
				),
			);
			return;
		}
		permissionOwner = this.component;
		const resume = (): void => {
			if (document.visibilityState !== "visible") return;
			document.removeEventListener("visibilitychange", resume);
			if (permissionOwner !== this.component) return;
			permissionOwner = null;
			void this.#settle().then(() => {
				if (this.#canInstallNow) void this.#install();
			});
		};
		document.addEventListener("visibilitychange", resume);
	}

	async #downloadAgain(): Promise<void> {
		if (await this.#settle()) return;
		await this.#offerCheck("manual", {
			acceptInstall:
				this.#armedTag !== null || this.#readyKind === "install",
		});
		if (this.#shown.stage === "available") {
			await this.#download(fromScratch);
			return;
		}
		this.#hide();
	}

	async #settle({ atLaunch = false }: { atLaunch?: boolean } = {}) {
		this.#settling ??= (async () => {
			const readiness = await getUpdateReadiness(this.component).catch(
				() => null,
			);
			this.#canInstallNow =
				readiness?.state === "ready" && readiness.detail.canInstallNow;
			const offersInstall =
				(readiness?.state === "ready" ||
					readiness?.state === "resumable") &&
				readiness.detail.kind !== "update";
			if (atLaunch && offersInstall) return false;

			switch (readiness?.state) {
				case "resumable":
					this.#readyKind = readiness.detail.kind;
					return await this.#download(fromScratch);
				case "ready":
					this.#readyTag = readiness.detail.tag;
					this.#readyKind = readiness.detail.kind;
					this.#show({ stage: "ready", received: 1, total: 1 });
					return true;
				default:
					return false;
			}
		})().finally(() => {
			this.#settling = null;
		});
		return this.#settling;
	}

	async #backgroundCheck(trigger: Trigger): Promise<void> {
		const { stage } = this.#shown;
		const offerOnScreen = stage === "available" || stage === "paused";
		if (this.#installedFrom || (this.#visible && !offerOnScreen)) return;
		await this.#offerCheck(trigger);
	}

	async #check(
		trigger: Trigger,
		{ byUser = false }: { byUser?: boolean } = {},
	): Promise<CheckResult | null> {
		return checkForUpdate(trigger, this.component).catch(
			(error: unknown) => {
				if (byUser) {
					this.#presenter.problem(
						this.#text(error, "Couldn't check for updates"),
					);
				} else if (asUpdateError(error)?.kind === "unsigned") {
					this.#reportFailure(error);
				}
				return null;
			},
		);
	}

	async #offerCheck(
		trigger: Trigger,
		{ acceptInstall = false }: { acceptInstall?: boolean } = {},
	): Promise<void> {
		const result = await this.#check(trigger);
		if (!result?.available || !result.release) return;
		if (result.release.kind !== "update" && !acceptInstall) return;
		this.#readyKind = result.release.kind;
		this.#dismissed = false;
		this.#show({ stage: "available", ...fromScratch });
	}

	#ownsOutcome({ packageName }: InstallOutcome): boolean {
		if (this.#ownsInstallLedger && !packageName) return true;
		return packageName === COMPONENT_PACKAGE[this.component];
	}

	#follow(): void {
		if (this.#following) return;
		this.#following = true;
		void onInstallFinished((outcome) => {
			if (!this.#ownsOutcome(outcome)) return;
			if (this.#ownsInstallLedger) {
				void takeInstallOutcome().catch(() => null);
			}
			const ready = this.#installedFrom;
			if (!ready) return;
			this.#releaseInstall();
			if (outcome.succeeded) {
				if (this.#ownsInstallLedger) return;
				this.#hide();
				this.#presenter.installed({
					tag: this.#readyTag,
					kind: this.#readyKind,
				});
				return;
			}
			if (!outcome.canceled) {
				this.#presenter.problem(
					outcome.message ?? "The update did not install",
				);
			}
			this.#show(ready);
			void this.#settle();
		});
		void onUpdateProgress((progress) => {
			if (progress.component !== this.component) return;
			const change = stageOf(progress);
			if ("failed" in change) {
				if (change.failed?.kind !== "assetReplaced")
					this.#armedTag = null;
				this.#reportFailure(change.failed);
				return;
			}
			if (change.view.stage !== "ready") {
				if (
					change.view.stage === "paused" &&
					progress.tag === this.#armedTag
				) {
					this.#armedTag = null;
				}
				this.#show(change.view);
				return;
			}
			this.#autoRefetched = false;
			this.#readyTag = progress.tag;
			const armed = this.#armedTag === progress.tag;
			if (armed) this.#armedTag = null;
			if (this.#installing) return;
			void this.#settle().then(() => {
				if (armed) void this.#install();
			});
		});
	}

	async #announceLastInstall(): Promise<void> {
		const outcome = await takeInstallOutcome().catch(() => null);
		if (!outcome) return;
		if (outcome.succeeded) {
			this.#presenter.installed({ tag: null, kind: "update" });
			return;
		}
		if (outcome.canceled) return;
		this.#presenter.problem(
			outcome.message ?? "The update did not install",
		);
	}

	#show(next: StageView): void {
		const offerable = next.stage === "available" || next.stage === "paused";
		if (this.#dismissed && offerable) {
			this.#shown = next;
			if (this.#visible) this.#hide();
			return;
		}
		this.#shown = next;
		this.#visible = true;
		const showing = ++this.#showing;
		this.#presenter.show({
			view: next,
			kind: this.#readyKind,
			onActivate: () => void this.#activate(),
			onCancel: () =>
				void cancelUpdateDownload(this.component).catch(
					(error: unknown) => {
						this.#presenter.problem(
							this.#text(error, "Couldn't stop the download"),
						);
					},
				),
			onDismiss: () => {
				if (showing !== this.#showing) return;
				if (offerable) this.#dismissed = true;
				this.#visible = false;
			},
		});
	}

	#hide(): void {
		this.#showing++;
		this.#visible = false;
		this.#presenter.dismiss();
	}

	#text(error: unknown, fallback: string): string {
		return updateErrorText(error, fallback, this.component);
	}

	#reportFailure(error: unknown): void {
		const known = asUpdateError(error);
		if (known?.kind === "assetReplaced" && !this.#autoRefetched) {
			this.#autoRefetched = true;
			void this.#downloadAgain();
			return;
		}

		this.#hide();
		this.#presenter.problem(this.#text(error, "The update failed"));

		if (known?.kind !== "server") return;

		const { status } = known.detail;
		const refusedForGood = status >= 400 && status < 500 && status !== 429;
		if (refusedForGood) {
			void discardStagedUpdate(this.component).catch(() => undefined);
		}
	}
}
