import { describe, expect, it } from "vitest";

import { stageBody, stageTitle, type UpdateStage } from "./stage";

const stages: UpdateStage[] = [
	"available",
	"downloading",
	"verifying",
	"paused",
	"ready",
	"installing",
];

type CopyArgs = Parameters<typeof stageTitle>[0];

function copyOf(
	copy: (args: CopyArgs) => string | undefined,
	component: CopyArgs["component"],
	kind: CopyArgs["kind"],
) {
	return Object.fromEntries(
		stages.map((stage) => [stage, copy({ component, kind, stage })]),
	);
}

function titles(component: CopyArgs["component"], kind: CopyArgs["kind"]) {
	return copyOf(stageTitle, component, kind);
}

function bodies(component: CopyArgs["component"], kind: CopyArgs["kind"]) {
	return copyOf(stageBody, component, kind);
}

describe("the stage toast title", () => {
	it("says update while an installed add-on updates", () => {
		expect(titles("google-oauth", "update")).toEqual({
			available: "Companion app update available",
			downloading: "Downloading the companion app update…",
			verifying: "Verifying the companion app update…",
			paused: "Companion app update is available",
			ready: "Companion app update is downloaded",
			installing: "Updating the companion app…",
		});
	});

	it("says install while an add-on installs for the first time", () => {
		expect(titles("google-oauth", "install")).toEqual({
			available: "Companion app is available",
			downloading: "Downloading the companion app…",
			verifying: "Verifying the companion app…",
			paused: "Companion app is ready to download",
			ready: "Companion app is downloaded",
			installing: "Installing the companion app…",
		});
	});

	it("keeps the app's own copy", () => {
		expect(titles("app", "update")).toEqual({
			available: "New update available",
			downloading: "Downloading update…",
			verifying: "Verifying the update…",
			paused: "Update is available",
			ready: "Update is downloaded",
			installing: "Installing…",
		});
	});
});

describe("the stage toast body", () => {
	const installBodies = {
		available: "Tap to install, swipe to dismiss",
		downloading: undefined,
		verifying: undefined,
		paused: "Tap to download",
		ready: "Tap to install",
		installing: undefined,
	};

	it("says update while an installed add-on updates", () => {
		expect(bodies("google-oauth", "update")).toEqual({
			available: "Tap to update, swipe to dismiss",
			downloading: undefined,
			verifying: undefined,
			paused: "Tap to download",
			ready: "Tap to update",
			installing: undefined,
		});
	});

	it("says install while an add-on installs for the first time", () => {
		expect(bodies("google-oauth", "install")).toEqual(installBodies);
	});

	it("keeps the app's own copy", () => {
		expect(bodies("app", "update")).toEqual(installBodies);
	});
});
