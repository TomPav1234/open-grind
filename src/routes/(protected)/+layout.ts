import { redirect } from "@sveltejs/kit";

import { signedInProfileId } from "$lib/api/current-session";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async () => {
	let profileId: number | null = null;
	try {
		profileId = await Promise.race([
			signedInProfileId().catch(() => null),
			new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
		]);
	} catch {
		profileId = null;
	}
	if (profileId === null) {
		redirect(303, "/auth/sign-in");
	}
	return { ourProfileId: profileId };
};
