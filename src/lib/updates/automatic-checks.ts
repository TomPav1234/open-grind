import { addonUpdates } from "./addon.svelte";
import { GOOGLE_OAUTH_COMPONENT } from "./components";
import { getInstalledVersion } from "./index";
import { checkForUpdateNow } from "./updates-manager";

export type AutomaticChecksScope = {
	selfManaged: boolean;
	unsupportedReason: string | null;
	addonAvailable: boolean;
};

const privacyNote =
	"No personally identifiable information is sent, no requests are stored or analyzed.";
const companionCheck =
	"Periodically ask git.opengrind.org whether a newer companion app for Google sign-in is published.";

function describeChecks({
	selfManaged,
	unsupportedReason,
	addonAvailable,
}: AutomaticChecksScope): string {
	if (selfManaged || !addonAvailable) {
		const subject = addonAvailable
			? "Open Grind and its companion app"
			: "Open Grind";
		return (
			unsupportedReason ??
			`Periodically request updates for ${subject} from git.opengrind.org. ${privacyNote}`
		);
	}
	if (unsupportedReason !== null) {
		return `${unsupportedReason}. ${companionCheck} ${privacyNote}`;
	}
	return `${companionCheck} Open Grind itself isn't updated from here. ${privacyNote}`;
}

export function automaticChecksSetting(scope: AutomaticChecksScope): {
	title: string;
	description: string;
	blocked: boolean;
} {
	const companionOnly = scope.addonAvailable && !scope.selfManaged;
	return {
		title: companionOnly
			? "Check companion app updates automatically"
			: "Check updates automatically",
		description: describeChecks(scope),
		blocked: scope.unsupportedReason !== null && !scope.addonAvailable,
	};
}

export async function checkAfterOptIn({
	selfManaged,
	addonAvailable,
}: Pick<
	AutomaticChecksScope,
	"selfManaged" | "addonAvailable"
>): Promise<void> {
	if (selfManaged) void checkForUpdateNow();
	if (!addonAvailable) return;
	const installed = await getInstalledVersion(GOOGLE_OAUTH_COMPONENT).catch(
		() => null,
	);
	if (installed !== null) void addonUpdates.checkNow();
}
