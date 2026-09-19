<script lang="ts">
	import { CaretLeftIcon } from "phosphor-svelte";

	import { edgeSwipeState } from "$lib/platform/edge-swipe.svelte";

	const clampedY = $derived.by(() => {
		if (typeof window === "undefined") return 300;
		const height = window.innerHeight;
		return Math.max(90, Math.min(height - 90, edgeSwipeState.y));
	});

	const translateX = $derived.by(() => {
		// Map offset (0 to 60px) to slide-in translation
		const distance = Math.min(48, edgeSwipeState.offset * 0.8);
		return distance - 48; // starts at -48px (hidden) and slides out to 0px
	});
</script>

{#if edgeSwipeState.active}
	<div
		class="pointer-events-none fixed left-0 z-[250000] flex items-center justify-center transition-[background-color,border-color,transform] duration-75 ease-out"
		style:top="{clampedY}px"
		style:transform="translate3d({translateX}px, -50%, 0) scale({edgeSwipeState.triggered ? 1.1 : 0.95 + edgeSwipeState.progress * 0.05})"
		aria-hidden="true"
	>
		<div
			class={[
				"flex size-11 items-center justify-center rounded-r-2xl border border-l-0 shadow-xl backdrop-blur-md transition-colors",
				edgeSwipeState.triggered
					? "border-accent/80 bg-accent text-accent-foreground ring-2 ring-accent/30"
					: "border-white/20 bg-black/65 text-white/90",
			]}
		>
			<CaretLeftIcon
				weight="bold"
				class={[
					"size-5 transition-transform",
					edgeSwipeState.triggered ? "scale-115" : "",
				]}
			/>
		</div>
	</div>
{/if}
