<script lang="ts">
	import { FilmSlateIcon } from "phosphor-svelte";
</script>

<div
	class="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center"
>
	<div
		class="flex size-16 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground ring-1 ring-border"
	>
		<FilmSlateIcon weight="duotone" class="size-8 text-muted-foreground/80" />
	</div>
	<div class="flex flex-col gap-1 max-w-72">
		<h3 class="text-base font-medium text-foreground">
			Nessun media ricevuto
		</h3>
		<p class="text-xs text-muted-foreground">
			Le foto, i video ricevuti nelle chat e gli album condivisi appariranno qui.
		</p>
	</div>
</div>
