<script lang="ts">
	import { CaretRightIcon, FilmSlateIcon } from "phosphor-svelte";

	import * as Item from "$lib/components/ui/item";
</script>

<Item.Root variant="outline">
	{#snippet child({ props })}
		<a href="/media" {...props}>
			<Item.Media>
				<FilmSlateIcon weight="fill" class="size-5 text-indigo-400" />
			</Item.Media>
			<Item.Content class="min-w-0">
				<Item.Title
					class="inline-block w-full min-w-0 truncate text-left font-medium"
				>
					Media Ricevuti
				</Item.Title>
			</Item.Content>
			<Item.Actions>
				<CaretRightIcon class="size-4 text-muted-foreground" />
			</Item.Actions>
		</a>
	{/snippet}
</Item.Root>
