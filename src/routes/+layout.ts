import { redirect } from "@sveltejs/kit";

import { getPreferences } from "$lib/app-data/preferences.svelte";
import { hydrateDesktopEntryState } from "$lib/platform/desktop-entry.svelte";
import { updatesAvailableHere } from "$lib/updates";
import { hydrateUpdateCapability } from "$lib/updates/capability.svelte";
import type { LayoutLoad } from "./$types";

export const ssr = false;
export const csr = true;

export const load: LayoutLoad = async ({ url }) => {
	void hydrateUpdateCapability().catch(() => {});
	void hydrateDesktopEntryState().catch(() => {});
	const onboardingComplete =
		!updatesAvailableHere() ||
		(await Promise.race([
			getPreferences()
				.then((preferences) => preferences.onboardingComplete)
				.catch(() => true),
			new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 1500)),
		]));

	if (!onboardingComplete && url.pathname !== "/onboarding") {
		redirect(303, "/onboarding");
	}
	if (onboardingComplete && url.pathname === "/onboarding") {
		redirect(303, "/");
	}
};
