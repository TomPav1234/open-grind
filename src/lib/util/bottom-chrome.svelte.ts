import { SvelteMap, SvelteSet } from "svelte/reactivity";
import type { Attachment } from "svelte/attachments";

const clearances = new SvelteMap<HTMLElement, number>();
const measurers = new SvelteSet<() => void>();

export function bottomChromeClearance(): number {
	return Math.max(0, ...clearances.values());
}

export function remeasureBottomChrome(): void {
	for (const measure of measurers) measure();
}

export const bottomChrome: Attachment<HTMLElement> = (element) => {
	const measure = () => {
		if (element.inert || element.getClientRects().length === 0) {
			clearances.delete(element);
			return;
		}
		const contentTop =
			element.getBoundingClientRect().top +
			parseFloat(getComputedStyle(element).paddingTop);
		clearances.set(element, window.innerHeight - contentTop);
	};
	const movesWithItsScroller =
		getComputedStyle(element).position === "sticky";
	const observer = new ResizeObserver(measure);
	observer.observe(element);
	measurers.add(measure);
	window.addEventListener("resize", measure);
	element.addEventListener("introend", measure);
	element.addEventListener("outrostart", measure);
	if (movesWithItsScroller)
		window.addEventListener("scroll", measure, {
			capture: true,
			passive: true,
		});
	return () => {
		observer.disconnect();
		measurers.delete(measure);
		window.removeEventListener("resize", measure);
		element.removeEventListener("introend", measure);
		element.removeEventListener("outrostart", measure);
		window.removeEventListener("scroll", measure, { capture: true });
		clearances.delete(element);
	};
};
