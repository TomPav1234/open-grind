// @vitest-environment jsdom

import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import { untrustedCompanionMessage } from "$lib/api/sign-in";
import {
	awaitingPermission,
	offer,
	outcomeOf,
	progressOf,
	ready,
	settled,
	toastsFake,
	updateApiFake,
} from "$lib/updates/updates-test-helpers";

const COMPANION_RELEASES =
	"https://git.opengrind.org/open-grind/open-grind-google-oauth-android-app/releases#install";
const SCREEN_URL = "http://localhost/auth/sign-in/google";

const fake = updateApiFake();
const toasts = toastsFake();
const { api, readiness, emitProgress, emitOutcome } = fake;
const {
	callMethodMock,
	gotoMock,
	pageMock,
	toastMock,
	platform,
	openExternalLink,
} = vi.hoisted(() => ({
	callMethodMock: vi.fn(),
	gotoMock: vi.fn(),
	pageMock: { url: new URL("http://localhost/") },
	toastMock: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
	platform: { isAndroidPlatform: vi.fn(() => true) },
	openExternalLink: vi.fn(),
}));

vi.mock("$app/navigation", () => ({ goto: gotoMock }));
vi.mock("$app/state", () => ({ page: pageMock }));
vi.mock("$lib/api/methods", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/methods")>()),
	callMethod: callMethodMock,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));
vi.mock("$lib/updates/index", async () => ({
	...(await import("$lib/updates/types")),
	...(await import("$lib/updates/components")),
	...fake.api,
}));
vi.mock("$lib/updates/toasts", () => toasts);
vi.mock("$lib/platform/os", () => platform);
vi.mock("$lib/platform/link-opener", () => ({ openExternalLink }));

let testing: typeof import("@testing-library/svelte");

async function opened() {
	testing = await import("@testing-library/svelte");
	const { default: GoogleSignInForm } =
		await import("./GoogleSignInForm.svelte");
	testing.render(GoogleSignInForm);
	await settled();
	return testing;
}

function button(name: string) {
	return testing.screen.getByRole("button", { name });
}

function textOf(element: HTMLElement) {
	return element.textContent.replace(/\s+/g, " ").trim();
}

describe("GoogleSignInForm", () => {
	beforeAll(async () => {
		await import("@testing-library/svelte");
		await import("./GoogleSignInForm.svelte");
	}, 30_000);

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		fake.reset();
		pageMock.url = new URL(SCREEN_URL);
		platform.isAndroidPlatform.mockReturnValue(true);
		api.checkForUpdate.mockResolvedValue(offer("install"));
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		testing.cleanup();
		vi.restoreAllMocks();
	});

	it("offers to install the missing companion app", async () => {
		const { screen } = await opened();

		expect(api.getInstalledVersion).toHaveBeenCalledWith("google-oauth");
		expect(textOf(screen.getByText(/Download and install the/))).toBe(
			"Download and install the Open Grind Google OAuth app to sign in with Google",
		);
		const releasePage = screen.getByRole("link", {
			name: "Open Grind Google OAuth app",
		});
		expect(releasePage.textContent).toBe("Open Grind Google OAuth app");
		expect(releasePage).toHaveProperty("href", COMPANION_RELEASES);
		expect(button("Install")).toHaveProperty("disabled", false);
		expect(screen.getByRole("link", { name: "Go back" })).toBeTruthy();
		expect(button("paste the OAuth token manually")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
		expect(screen.queryByLabelText("Token")).toBeNull();
	});

	it("installs through the toast and then offers to continue", async () => {
		const { screen, fireEvent } = await opened();

		await fireEvent.click(button("Install"));
		await settled();

		expect(api.startUpdateDownload).toHaveBeenCalledWith("google-oauth");
		expect(toasts.showStage).toHaveBeenLastCalledWith(
			expect.objectContaining({
				view: expect.objectContaining({ stage: "downloading" }),
			}),
		);
		expect(button("Loading Downloading…")).toHaveProperty("disabled", true);
		expect(screen.queryByRole("progressbar")).toBeNull();

		readiness["google-oauth"] = ready("install");
		emitProgress(
			progressOf("google-oauth", { phase: "ready", received: 100 }),
		);
		await settled();
		expect(button("Loading Installing…")).toHaveProperty("disabled", true);

		api.getInstalledVersion.mockResolvedValue("1.2.0");
		emitOutcome(outcomeOf("google-oauth"));
		await settled();

		expect(textOf(screen.getByText(/Continue in the/))).toBe(
			"Continue in the Open Grind Google OAuth app to sign in with Google",
		);
		expect(button("Continue")).toHaveProperty("disabled", false);
		expect(callMethodMock).not.toHaveBeenCalled();
	});

	it("still shows the download after leaving the screen and coming back", async () => {
		const { fireEvent } = await opened();

		await fireEvent.click(button("Install"));
		await settled();
		expect(button("Loading Downloading…")).toHaveProperty("disabled", true);

		testing.cleanup();
		await opened();

		expect(button("Loading Downloading…")).toHaveProperty("disabled", true);
	});

	it("offers the install again after a failed download", async () => {
		const { fireEvent } = await opened();

		await fireEvent.click(button("Install"));
		await settled();
		emitProgress(progressOf("google-oauth", { phase: "failed" }));
		await settled();

		expect(toasts.showProblem).toHaveBeenCalledOnce();
		expect(button("Install")).toHaveProperty("disabled", false);
	});

	it("lets a cancelled install be tapped again", async () => {
		readiness["google-oauth"] = ready("install");
		const { fireEvent } = await opened();

		await fireEvent.click(button("Install"));
		await settled();
		expect(button("Loading Installing…")).toHaveProperty("disabled", true);

		emitOutcome(
			outcomeOf("google-oauth", { succeeded: false, canceled: true }),
		);
		await settled();
		expect(button("Install")).toHaveProperty("disabled", false);

		await fireEvent.click(button("Install"));
		await settled();
		expect(api.installUpdate).toHaveBeenCalledTimes(2);
	});

	it("continues in the companion app when it was installed meanwhile", async () => {
		callMethodMock.mockReturnValue(new Promise(() => {}));
		const { fireEvent } = await opened();
		api.getInstalledVersion.mockResolvedValue("1.1.0");

		await fireEvent.click(button("Install"));
		await settled();

		expect(callMethodMock).toHaveBeenCalledWith("login_with_google");
		expect(api.checkForUpdate).not.toHaveBeenCalled();
		expect(button("Loading Continue")).toHaveProperty("disabled", true);
	});

	it("follows a newer probe that answers before the one Install started", async () => {
		callMethodMock.mockReturnValue(new Promise(() => {}));
		const { fireEvent } = await opened();
		let answerInstallProbe: (version: string | null) => void = () => {};
		api.getInstalledVersion.mockReturnValueOnce(
			new Promise((resolve) => {
				answerInstallProbe = resolve;
			}),
		);
		api.getInstalledVersion.mockResolvedValue("1.1.0");

		await fireEvent.click(button("Install"));
		document.dispatchEvent(new Event("visibilitychange"));
		await settled();
		expect(button("Continue")).toBeTruthy();

		answerInstallProbe(null);
		await settled();

		expect(callMethodMock).toHaveBeenCalledWith("login_with_google");
		expect(api.checkForUpdate).not.toHaveBeenCalled();
		expect(button("Loading Continue")).toHaveProperty("disabled", true);
	});

	it("opens the release page where the app cannot install it", async () => {
		api.updatesAvailableHere.mockReturnValue(false);
		const { fireEvent } = await opened();

		await fireEvent.click(button("Install"));
		await settled();

		expect(openExternalLink).toHaveBeenCalledWith(COMPANION_RELEASES);
		expect(api.checkForUpdate).not.toHaveBeenCalled();
	});

	it("returns to the install when the companion app cannot be opened", async () => {
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		const { fireEvent } = await opened();
		callMethodMock.mockRejectedValue({
			kind: "Auth",
			message: "companion-unavailable",
		});

		await fireEvent.click(button("Continue"));
		await settled();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Couldn't find the Open Grind Google OAuth app on your device. Install it first, or paste the OAuth token manually.",
		);
		expect(button("Install")).toBeTruthy();

		await fireEvent.click(button("Install"));
		await settled();

		expect(callMethodMock).toHaveBeenCalledOnce();
		expect(api.checkForUpdate).toHaveBeenCalledWith(
			"manual",
			"google-oauth",
		);
	});

	it("tries the companion app again once the screen is shown again", async () => {
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		const { fireEvent } = await opened();
		callMethodMock.mockRejectedValue({
			kind: "Auth",
			message: "companion-unavailable",
		});
		await fireEvent.click(button("Continue"));
		await settled();
		expect(button("Install")).toBeTruthy();

		document.dispatchEvent(new Event("visibilitychange"));
		await settled();

		expect(button("Continue")).toBeTruthy();
	});

	it("keeps both switches to the other flow outside the card", async () => {
		const { screen, fireEvent } = await opened();
		const toPaste = button("paste the OAuth token manually");
		expect(toPaste.closest('[data-slot="card"]')).toBeNull();

		await fireEvent.click(toPaste);

		const toCompanion = screen.getByRole("button", {
			name: "use the Open Grind Google OAuth app",
		});
		expect(toCompanion.closest('[data-slot="card"]')).toBeNull();
	});

	it("keeps the signing-in card while a handback is being exchanged", async () => {
		const { googleHandbackState } =
			await import("$lib/api/google-handback-state.svelte");
		googleHandbackState.phase = "signingIn";
		try {
			const { screen } = await opened();

			expect(screen.getByText("Signing you in")).toBeTruthy();
			expect(
				screen.queryByRole("button", { name: "Install" }),
			).toBeNull();
		} finally {
			googleHandbackState.phase = "idle";
		}
	});

	it("signs in with the pasted token, trimmed", async () => {
		callMethodMock.mockRejectedValue(new Error("refused"));
		const { screen, fireEvent } = await opened();
		await fireEvent.click(button("paste the OAuth token manually"));

		await fireEvent.input(screen.getByLabelText("Token"), {
			target: { value: "  pasted-token \n" },
		});
		await fireEvent.click(button("Sign in"));
		await settled();

		expect(callMethodMock).toHaveBeenCalledWith("google_sign_in", {
			token: "pasted-token",
		});
	});

	it("leaves Install tappable while the install permission is pending", async () => {
		readiness["google-oauth"] = awaitingPermission("install");
		const { fireEvent } = await opened();

		await fireEvent.click(button("Install"));
		await settled();

		expect(api.openInstallPermissionSettings).toHaveBeenCalledOnce();
		expect(button("Install")).toHaveProperty("disabled", false);
	});

	it("falls back to the pasted token when the companion app is untrusted", async () => {
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		const { screen, fireEvent } = await opened();
		callMethodMock.mockRejectedValue({
			kind: "Auth",
			message: "companion-untrusted",
		});

		await fireEvent.click(button("Continue"));
		await settled();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			untrustedCompanionMessage,
		);
		expect(screen.getByLabelText("Token")).toBeTruthy();
	});

	it("opens on the pasted token when the sign-in screen asks for it", async () => {
		pageMock.url = new URL(`${SCREEN_URL}?paste`);
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		const { screen, fireEvent } = await opened();

		expect(screen.getByLabelText("Token")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();

		await fireEvent.click(button("use the Open Grind Google OAuth app"));

		expect(button("Continue")).toBeTruthy();
	});

	it("notices an install made outside the app when the screen is shown again", async () => {
		await opened();
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		const visibility = vi
			.spyOn(document, "visibilityState", "get")
			.mockReturnValue("hidden");

		document.dispatchEvent(new Event("visibilitychange"));
		await settled();
		expect(button("Install")).toBeTruthy();

		visibility.mockReturnValue("visible");
		document.dispatchEvent(new Event("visibilitychange"));
		await settled();

		expect(button("Continue")).toBeTruthy();
	});

	it("keeps the newest probe when an earlier one answers last", async () => {
		let answerFirstProbe: (version: string | null) => void = () => {};
		api.getInstalledVersion.mockReturnValueOnce(
			new Promise((resolve) => {
				answerFirstProbe = resolve;
			}),
		);
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		await opened();

		document.dispatchEvent(new Event("visibilitychange"));
		await settled();
		expect(button("Continue")).toBeTruthy();

		answerFirstProbe(null);
		await settled();
		expect(button("Continue")).toBeTruthy();
	});

	it("switches between the companion app and the pasted token", async () => {
		const { screen, fireEvent } = await opened();

		await fireEvent.click(button("paste the OAuth token manually"));

		expect(screen.getByLabelText("Token")).toBeTruthy();
		expect(screen.getAllByRole("listitem").map(textOf)).toEqual([
			"Install the Open Grind Google OAuth app",
			"Sign in with Google in the Open Grind Google OAuth app and copy the token",
			'Return to this screen, paste it and tap "Sign in"',
		]);
		expect(screen.queryByRole("button", { name: /^Install/ })).toBeNull();

		await fireEvent.click(button("use the Open Grind Google OAuth app"));

		expect(screen.queryByLabelText("Token")).toBeNull();
		expect(button("Install")).toBeTruthy();
	});

	it("only offers the pasted token off Android", async () => {
		platform.isAndroidPlatform.mockReturnValue(false);
		const { screen } = await opened();

		expect(screen.getByLabelText("Token")).toBeTruthy();
		expect(
			screen.queryByRole("button", {
				name: "use the Open Grind Google OAuth app",
			}),
		).toBeNull();
		expect(api.getInstalledVersion).not.toHaveBeenCalled();
	});
});
