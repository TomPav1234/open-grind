<script lang="ts">
	import { ImagesIcon } from "phosphor-svelte";
</script>

<div
	class="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center"
>
	<div
		class="flex size-16 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground ring-1 ring-border"
	>
		<ImagesIcon weight="duotone" class="size-8 text-muted-foreground/80" />
	</div>
	<div class="flex flex-col gap-1 max-w-72">
		<h3 class="text-base font-medium text-foreground">
			Nessun album ricevuto
		</h3>
		<p class="text-xs text-muted-foreground">
			Gli album privati che gli altri utenti condividono con te appariranno qui.
		</p>
	</div>
</div>
