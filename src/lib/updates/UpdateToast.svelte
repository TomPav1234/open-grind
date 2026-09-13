<script lang="ts">
	import ArrowsClockwiseIcon from "phosphor-svelte/lib/ArrowsClockwiseIcon";
	import DownloadSimpleIcon from "phosphor-svelte/lib/DownloadSimpleIcon";

	import { Progress } from "$lib/components/ui/progress";
	import { APP_COMPONENT, type ComponentKey } from "./components";
	import type { InstallKind } from "./flow";
	import type { UpdateStage } from "./stage";
	import ToastCard from "./ToastCard.svelte";

	let {
		component = APP_COMPONENT,
		kind,
		stage,
		received,
		total,
		onActivate,
		onCancel,
	}: {
		component?: ComponentKey;
		kind: InstallKind;
		stage: UpdateStage;
		received: number;
		total: number;
		onActivate: () => void;
		onCancel: () => void;
	} = $props();

	const looks = {
		available: {
			icon: DownloadSimpleIcon,
			body: "Tap to install, swipe to dismiss",
		},
		downloading: { icon: DownloadSimpleIcon, body: undefined },
		verifying: { icon: ArrowsClockwiseIcon, body: undefined },
		paused: { icon: DownloadSimpleIcon, body: "Tap to download" },
		ready: { icon: ArrowsClockwiseIcon, body: "Tap to install" },
		installing: { icon: ArrowsClockwiseIcon, body: undefined },
	} satisfies Record<UpdateStage, unknown>;

	const addonUpdateTitles: Record<UpdateStage, string> = {
		available: "Companion app update available",
		downloading: "Downloading the companion app…",
		verifying: "Verifying the companion app…",
		paused: "Companion app update is available",
		ready: "Companion app update is downloaded",
		installing: "Installing the companion app…",
	};

	const titles: Record<
		"app" | "addonUpdate" | "addonInstall",
		Record<UpdateStage, string>
	> = {
		app: {
			available: "New update available",
			downloading: "Downloading update…",
			verifying: "Verifying the update…",
			paused: "Update is available",
			ready: "Update is downloaded",
			installing: "Installing…",
		},
		addonUpdate: addonUpdateTitles,
		addonInstall: {
			...addonUpdateTitles,
			available: "Companion app is available",
			paused: "Companion app is ready to download",
			ready: "Companion app is downloaded",
		},
	};

	const look = $derived(looks[stage]);
	const title = $derived(
		titles[
			component === APP_COMPONENT
				? "app"
				: kind === "install"
					? "addonInstall"
					: "addonUpdate"
		][stage],
	);
	const indeterminate = $derived(
		stage === "installing" || stage === "verifying",
	);
	const percent = $derived(
		indeterminate
			? 100
			: total === 0
				? 0
				: Math.min(100, Math.round((received / total) * 100)),
	);
</script>

<ToastCard
	icon={look.icon}
	{title}
	body={look.body}
	onActivate={look.body === undefined ? undefined : onActivate}
	onCancel={stage === "downloading" ? onCancel : undefined}
>
	<Progress
		value={percent}
		class={["mt-2", { "animate-pulse": indeterminate }]}
	/>
</ToastCard>
