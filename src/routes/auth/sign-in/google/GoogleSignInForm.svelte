<script lang="ts">
	import { toast } from "svelte-sonner";

	import { googleHandbackState } from "$lib/api/google-handback-state.svelte";
	import { callMethod } from "$lib/api/methods";
	import {
		companionUnavailable,
		companionUntrusted,
		finishSignIn,
		reportSignInFailure,
		untrustedCompanionMessage,
	} from "$lib/api/sign-in";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Label } from "$lib/components/ui/label";
	import Link from "$lib/components/ui/link/Link.svelte";
	import { Progress } from "$lib/components/ui/progress";
	import { Spinner } from "$lib/components/ui/spinner";
	import { Textarea } from "$lib/components/ui/textarea";
	import {
		AddonInstaller,
		addonInstallerAvailable,
		addonStageLabel,
	} from "$lib/updates/addon.svelte";

	const installer = new AddonInstaller();
	const canInstallHere = addonInstallerAvailable();

	$effect(() => {
		installer.watch();
		return () => installer.unwatch();
	});

	let token = $state("");
	let submitting = $state(false);
	let retrying = $state(false);

	let manualInput = $state(false);

	const installerLabel = $derived(
		addonStageLabel(installer.stage, {
			installed: installer.installed,
			installLabel: "Install here",
		}),
	);

	async function retry() {
		if (retrying) return;
		retrying = true;
		try {
			finishSignIn(await callMethod("login_with_google"));
		} catch (error) {
			reportSignInFailure({
				error,
				onAuthFailure: (message) => {
					if (message === companionUnavailable) {
						toast.error(
							'Couldn\'t find the Open Grind Google OAuth app on your device. Install it first, then tap "Retry". Alternatively, try pasting the OAuth token manually.',
						);
						return true;
					}
					if (message === companionUntrusted) {
						toast.error(untrustedCompanionMessage);
						manualInput = true;
						return true;
					}
					return false;
				},
			});
		} finally {
			retrying = false;
		}
	}
</script>

{#if googleHandbackState.phase === "signingIn"}
	<Card.Root class="m-auto w-full max-w-sm gap-2">
		<Card.Header>
			<Card.Title>Signing you in</Card.Title>
			<Card.Description>
				Finishing the Google sign-in from the companion app.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex justify-center py-4">
			<Spinner class="size-6" />
		</Card.Content>
	</Card.Root>
{:else}
	<form
		onsubmit={async (event) => {
			event.preventDefault();
			try {
				submitting = true;
				finishSignIn(
					await callMethod("google_sign_in", { token: token.trim() }),
				);
			} catch (error) {
				reportSignInFailure({ error });
			} finally {
				submitting = false;
			}
		}}
		class="contents"
	>
		<Card.Root class="m-auto w-full max-w-sm gap-2">
			<Card.Header>
				<Card.Title>Sign in with Google</Card.Title>
				<Card.Description>
					<ol class="ms-5 list-decimal">
						<li>
							Install <Link
								href="https://git.opengrind.org/open-grind/open-grind-google-oauth-android-app/releases#install"
								class="font-medium text-primary underline underline-offset-2"
							>
								Open Grind companion app
							</Link>
							{#if canInstallHere && installer.stage !== "done"}
								<Button
									variant="secondary"
									size="xs"
									class="ms-1 align-baseline"
									disabled={installer.busy || retrying}
									onclick={() => void installer.install()}
								>
									{#if installer.busy}
										<Spinner />
									{/if}
									{installerLabel}
								</Button>
							{/if}
						</li>
						{#if !manualInput}
							<li>On this screen, tap the "Retry" button</li>
						{:else}
							<li>
								Sign in with Google in the companion app and
								copy the token
							</li>
							<li>
								Return to this screen, paste it and tap "Sign
								in"
							</li>
						{/if}
					</ol>
					{#if installer.stage === "downloading" && installer.total > 0}
						<Progress
							value={Math.round(installer.fraction * 100)}
							aria-label="Downloading the companion app"
							class="my-2 h-1"
						/>
					{/if}
					<div role="status" aria-live="polite">
						{#if installer.message}
							<p class="my-2 text-destructive">
								{installer.message}
							</p>
						{/if}
						{#if installer.stage === "done"}
							<p class="my-2">
								{installer.finishedKind === "update"
									? "Companion app updated."
									: "Companion app installed."} Tap "Retry" to continue.
							</p>
						{:else if installer.stage === "upToDate"}
							<p class="my-2">
								The companion app is up to date. Tap "Retry" to
								continue.
							</p>
						{/if}
					</div>
					{#if !manualInput}
						<div class="my-2 block text-center">
							or <Button
								variant="secondary"
								size="xs"
								disabled={retrying}
								onclick={() => (manualInput = true)}
							>
								paste the OAuth token manually
							</Button>
						</div>
					{/if}
				</Card.Description>
			</Card.Header>
			{#if manualInput}
				<Card.Content>
					<div class="mt-2 grid gap-2">
						<Label for="token">Token</Label>
						<Textarea
							id="token"
							placeholder="Paste your token here"
							required
							rows={5}
							bind:value={token}
							disabled={submitting}
							class="rounded-lg font-mono text-sm"
						/>
					</div>
				</Card.Content>
			{/if}
			<Card.Footer class="flex-col gap-2">
				{#if manualInput}
					<Button
						type="submit"
						class="w-full"
						disabled={submitting || token.trim().length === 0}
					>
						Sign in
					</Button>
				{:else}
					<Button
						type="button"
						class="w-full"
						disabled={retrying}
						onclick={retry}
					>
						{#if retrying}
							<Spinner />
						{/if}
						Retry
					</Button>
				{/if}
				<Button
					variant="outline"
					class="w-full"
					href="/auth/sign-in"
					disabled={submitting || retrying}
				>
					Go back
				</Button>
			</Card.Footer>
		</Card.Root>
	</form>
{/if}
