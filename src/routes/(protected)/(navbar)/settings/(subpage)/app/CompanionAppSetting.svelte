<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Item from "$lib/components/ui/item";
	import { Progress } from "$lib/components/ui/progress";
	import { Spinner } from "$lib/components/ui/spinner";
	import { AddonInstaller, addonStageLabel } from "$lib/updates/addon.svelte";

	const installer = new AddonInstaller();

	$effect(() => {
		installer.watch();
		return () => installer.unwatch();
	});

	const versionText = $derived.by(() => {
		if (installer.installedVersion === undefined) return null;
		if (installer.installedVersion === null) return "Not installed";
		return `Version ${installer.installedVersion} installed`;
	});
	const label = $derived(
		addonStageLabel(installer.stage, { installed: installer.installed }),
	);
</script>

<Item.Root variant="outline" class="gap-3 p-4">
	<Item.Content class="gap-0">
		<Item.Title>Companion app for Google sign-in</Item.Title>
		{#if versionText !== null}
			<Item.Description class="mt-1">{versionText}</Item.Description>
		{/if}
		{#if installer.stage === "downloading" && installer.total > 0}
			<Progress
				value={Math.round(installer.fraction * 100)}
				aria-label="Downloading the companion app"
				class="mt-2 h-1"
			/>
		{/if}
		<div role="status" aria-live="polite" class="text-sm">
			{#if installer.message}
				<p class="mt-1 text-destructive">{installer.message}</p>
			{:else if installer.stage === "available"}
				<p class="mt-1 text-muted-foreground">
					An update is available.
				</p>
			{:else if installer.stage === "upToDate"}
				<p class="mt-1 text-muted-foreground">
					The companion app is up to date.
				</p>
			{:else if installer.stage === "done"}
				<p class="mt-1 text-muted-foreground">
					{installer.finishedKind === "update"
						? "Companion app updated."
						: "Companion app installed."}
				</p>
			{/if}
		</div>
	</Item.Content>
	<Item.Actions>
		<Button
			variant="secondary"
			size="sm"
			disabled={installer.busy ||
				installer.installedVersion === undefined}
			onclick={() => void installer.install()}
		>
			{#if installer.busy}
				<Spinner />
			{/if}
			{label}
		</Button>
	</Item.Actions>
</Item.Root>
