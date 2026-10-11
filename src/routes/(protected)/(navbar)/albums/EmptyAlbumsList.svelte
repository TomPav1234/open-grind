<script lang="ts">
	import { ImagesIcon, PlusIcon } from "phosphor-svelte";
	import { Button } from "$lib/components/ui/button";

	let {
		mode = "received",
	}: {
		mode?: "received" | "mine";
	} = $props();
</script>

<div
	class="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center"
>
	<div
		class="flex size-16 items-center justify-center rounded-full bg-muted/60 text-muted-foreground"
	>
		<ImagesIcon weight="duotone" class="size-8 opacity-70" />
	</div>

	<div class="flex flex-col gap-1">
		<h2 class="text-base font-semibold text-foreground">
			{mode === "received"
				? "Nessun album ricevuto"
				: "Nessun album personale"}
		</h2>
		<p class="max-w-xs text-xs text-muted-foreground">
			{mode === "received"
				? "Gli album condivisi con te da altri utenti appariranno qui."
				: "Crea il tuo primo album per condividere foto e video con altri utenti."}
		</p>
	</div>

	{#if mode === "mine"}
		<Button href="/settings/albums/new" class="mt-2 gap-1.5 rounded-full" size="sm">
			<PlusIcon weight="bold" class="size-4" />
			Crea album
		</Button>
	{/if}
</div>
