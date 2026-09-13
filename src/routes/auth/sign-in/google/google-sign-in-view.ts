import type { UpdateStage } from "$lib/updates/stage";

export type GoogleSignInView = "install" | "continue" | "paste";

export function googleSignInView({
	automated,
	pasting,
	installed,
}: {
	automated: boolean;
	pasting: boolean;
	installed: boolean;
}): GoogleSignInView {
	if (!automated || pasting) return "paste";
	return installed ? "continue" : "install";
}

export function installButton({
	stage,
	starting,
}: {
	stage: UpdateStage | null;
	starting: boolean;
}): { label: string; busy: boolean } {
	switch (stage) {
		case "downloading":
		case "verifying":
			return { label: "Downloading…", busy: true };
		case "installing":
			return { label: "Installing…", busy: true };
		default:
			return { label: "Install", busy: starting };
	}
}
