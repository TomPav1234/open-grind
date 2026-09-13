import { APP_COMPONENT, type ComponentKey } from "./components";
import {
	asUpdateError,
	type Release,
	type Unsupported,
	type UpdateError,
} from "./types";

const unsupportedCopy: Record<Unsupported["reason"], string> = {
	externallyManaged:
		"Updates are managed by the store that installed the app",
	foreignSigner: "This build was not signed by Open Grind",
	foreignTarget: "The installed app isn't signed by Open Grind",
	undetermined: "Open Grind can't tell whether it may update itself",
	noReleaseArtifacts: "No release is published for this platform",
	sandboxed: "The sandbox this app runs in manages its own updates",
	locationNotWritable: "Open Grind can't install the update in its directory",
};

const userCanFix: Record<Unsupported["reason"], boolean> = {
	externallyManaged: false,
	foreignSigner: false,
	foreignTarget: true,
	undetermined: true,
	noReleaseArtifacts: false,
	sandboxed: false,
	locationNotWritable: true,
};

export function unsupportedIsFixable(detail: Unsupported): boolean {
	return userCanFix[detail.reason];
}

type KnownKind = Exclude<UpdateError["kind"], "unsupported">;

const copy: Record<KnownKind, string> = {
	network: "Couldn't reach the release server",
	server: "The release server refused the request",
	malformedIndex: "The release server sent something unreadable",
	noArtifact: "The release has no download for this platform",
	unsigned: "Failed to verify the update",
	foreignUrl: "The release points somewhere outside the release server",
	signature: "Failed to verify the update",
	storage: "Couldn't write the update to storage",
	oversize: "The download was larger than the release said",
	assetReplaced: "The release changed, downloading it again",
	canceled: "Update canceled",
	nothingStaged: "No update is ready to install",
	needsUnknownSources: "Open Grind needs permission to install updates",
	needsManualInstall: "Quit Open Grind, then drag it onto Applications",
	install: "Couldn't install the update",
	checkTooSoon: "Already checked for updates recently",
	autoChecksDisabled: "Automatic update checks are turned off",
	unknownComponent: "Open Grind doesn't know that component",
	busy: "Another download is already running",
};

const addonUnsupportedCopy: Partial<Record<Unsupported["reason"], string>> = {
	externallyManaged:
		"The store that installed the companion app manages its updates",
	foreignTarget:
		"The installed companion app isn't signed by Open Grind. Uninstall it to install the official one.",
	noReleaseArtifacts: "The companion app isn't published for this device",
	undetermined:
		"Open Grind can't tell whether it may install the companion app",
};

const addonCopy: Partial<Record<KnownKind, string>> = {
	unsigned: "Failed to verify the companion app",
	signature: "Failed to verify the companion app",
	storage: "Couldn't save the companion app download",
	install: "Couldn't install the companion app",
	nothingStaged: "The companion app download is gone",
};

const addonUpdateCopy: Partial<Record<KnownKind, string>> = {
	install: "Couldn't update the companion app",
};

export function unsupportedText(
	{ reason }: Unsupported | Pick<Unsupported, "reason">,
	component: ComponentKey = APP_COMPONENT,
): string {
	const addonText =
		component === APP_COMPONENT ? undefined : addonUnsupportedCopy[reason];
	return addonText ?? unsupportedCopy[reason];
}

export function updateErrorText(
	error: unknown,
	{
		fallback,
		component = APP_COMPONENT,
		kind = "install",
	}: { fallback: string; component?: ComponentKey; kind?: Release["kind"] },
): string {
	const known = asUpdateError(error);
	if (!known) return fallback;
	if (known.kind === "unsupported") {
		return unsupportedText(known.detail, component);
	}
	if (component === APP_COMPONENT) return copy[known.kind];
	const updateText =
		kind === "update" ? addonUpdateCopy[known.kind] : undefined;
	return updateText ?? addonCopy[known.kind] ?? copy[known.kind];
}
