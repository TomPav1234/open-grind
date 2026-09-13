<script lang="ts">
	import { onMount } from "svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";
	import { getUpdateSettings, setAutomaticUpdateChecks } from "$lib/updates";
	import { addonInstallerAvailable } from "$lib/updates/addon.svelte";
	import {
		updatesSelfManaged,
		updatesUnsupportedReason,
	} from "$lib/updates/capability.svelte";
	import {
		automaticChecksSetting,
		checkAfterOptIn,
		manualCheckOffered,
	} from "$lib/updates/update-checks";
	import CheckForUpdatesButton from "./CheckForUpdatesButton.svelte";

	let stored = $state<boolean | null>(null);
	let pending = $state<boolean | null>(null);
	const value = $derived(pending ?? stored ?? false);
	const addonAvailable = addonInstallerAvailable();
	const selfManaged = $derived(updatesSelfManaged());
	const setting = $derived(
		automaticChecksSetting({
			selfManaged,
			unsupportedReason: updatesUnsupportedReason(),
			addonAvailable,
		}),
	);

	onMount(() => {
		if (setting.blocked) return;
		getUpdateSettings()
			.then((settings) => {
				stored = settings.autoCheck;
			})
			.catch((error: unknown) => {
				showErrorToast({
					label: "Couldn't read update settings",
					error,
				});
			});
	});
</script>

<SwitchField
	title={setting.title}
	description={setting.description}
	disabled={setting.blocked || stored === null}
	bind:checked={
		() => value,
		(newValue: boolean) => {
			pending = newValue;
			setAutomaticUpdateChecks(newValue)
				.then((settings) => {
					stored = settings.autoCheck;
					pending = null;
					if (settings.autoCheck) {
						void checkAfterOptIn({ selfManaged, addonAvailable });
					}
				})
				.catch((error: unknown) => {
					pending = null;
					showErrorToast({
						label: "Couldn't save update settings",
						error,
					});
				});
		}
	}
/>
{#if manualCheckOffered({ selfManaged, addonAvailable })}
	<CheckForUpdatesButton {selfManaged} {addonAvailable} />
{/if}
