import { runBackGestureHandlers } from "$lib/platform/back-gesture-event.svelte";

export class EdgeSwipeState {
	active = $state(false);
	progress = $state(0);
	offset = $state(0);
	y = $state(0);
	triggered = $state(false);
}

export const edgeSwipeState = new EdgeSwipeState();

let installed = false;

export function installEdgeSwipeGesture(): () => void {
	if (typeof window === "undefined" || installed) return () => {};
	installed = true;

	let startX = 0;
	let startY = 0;
	let tracking = false;
	let committed = false;

	const EDGE_THRESHOLD_PX = 35;
	const TRIGGER_DISTANCE_PX = 55;

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length !== 1) {
			tracking = false;
			return;
		}

		const touch = e.touches[0];
		if (!touch) return;

		// Only start if the touch begins near the left edge
		if (touch.clientX <= EDGE_THRESHOLD_PX) {
			startX = touch.clientX;
			startY = touch.clientY;
			tracking = true;
			committed = false;
			edgeSwipeState.offset = 0;
			edgeSwipeState.progress = 0;
			edgeSwipeState.y = touch.clientY;
			edgeSwipeState.triggered = false;
		}
	}

	function onTouchMove(e: TouchEvent) {
		if (!tracking) return;
		const touch = e.touches[0];
		if (!touch) return;

		const dx = touch.clientX - startX;
		const dy = touch.clientY - startY;

		if (!committed) {
			// If moving left off-screen, cancel
			if (dx < 0) {
				tracking = false;
				return;
			}
			// If moving vertically more than horizontally, cancel
			if (Math.abs(dy) > 20 && Math.abs(dy) > dx) {
				tracking = false;
				return;
			}
			// Commit to edge swipe if horizontal pull is clear
			if (dx > 10 && dx > Math.abs(dy) * 1.1) {
				committed = true;
				edgeSwipeState.active = true;
			}
		}

		if (committed) {
			edgeSwipeState.y = touch.clientY;
			edgeSwipeState.offset = Math.max(0, dx);
			const progress = Math.min(1, Math.max(0, (dx - 10) / (TRIGGER_DISTANCE_PX - 10)));
			edgeSwipeState.progress = progress;
			edgeSwipeState.triggered = dx >= TRIGGER_DISTANCE_PX;
		}
	}

	function onTouchEnd() {
		if (tracking && committed) {
			if (edgeSwipeState.triggered) {
				// Haptic feedback
				try {
					navigator?.vibrate?.(15);
				} catch {}

				// Check if modal/dialog/lightbox dismisses first
				const handled = runBackGestureHandlers();
				if (!handled) {
					if (window.navigation?.canGoBack ?? history.length > 1) {
						history.back();
					}
				}
			}
		}

		tracking = false;
		committed = false;
		edgeSwipeState.active = false;
		edgeSwipeState.progress = 0;
		edgeSwipeState.offset = 0;
		edgeSwipeState.triggered = false;
	}

	window.addEventListener("touchstart", onTouchStart, { passive: true });
	window.addEventListener("touchmove", onTouchMove, { passive: true });
	window.addEventListener("touchend", onTouchEnd, { passive: true });
	window.addEventListener("touchcancel", onTouchEnd, { passive: true });

	return () => {
		window.removeEventListener("touchstart", onTouchStart);
		window.removeEventListener("touchmove", onTouchMove);
		window.removeEventListener("touchend", onTouchEnd);
		window.removeEventListener("touchcancel", onTouchEnd);
		installed = false;
	};
}
