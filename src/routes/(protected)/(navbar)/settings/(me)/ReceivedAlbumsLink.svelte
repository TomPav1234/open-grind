<script lang="ts">
	import { CaretRightIcon, ImagesIcon } from "phosphor-svelte";

	import * as Item from "$lib/components/ui/item";
</script>

<Item.Root variant="outline">
	{#snippet child({ props })}
		<a href="/albums" {...props}>
			<Item.Media>
				<ImagesIcon weight="fill" class="size-5 text-amber-500" />
			</Item.Media>
			<Item.Content class="min-w-0">
				<Item.Title
					class="inline-block w-full min-w-0 truncate text-left font-medium"
				>
					Album Ricevuti
				</Item.Title>
			</Item.Content>
			<Item.Actions>
				<CaretRightIcon class="size-4 text-muted-foreground" />
			</Item.Actions>
		</a>
	{/snippet}
</Item.Root>
