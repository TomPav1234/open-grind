const STORAGE_KEY = "opengrind_dismissed_received_albums";

export function getDismissedAlbumIds(): Set<number> {
	if (typeof window === "undefined" || !window.localStorage) {
		return new Set();
	}
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return new Set();
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return new Set(parsed.map(Number).filter((n) => !isNaN(n)));
		}
	} catch (e) {
		console.warn("Failed to read dismissed albums from localStorage", e);
	}
	return new Set();
}

export function dismissReceivedAlbum(albumId: number): void {
	if (typeof window === "undefined" || !window.localStorage) return;
	try {
		const set = getDismissedAlbumIds();
		set.add(albumId);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
	} catch (e) {
		console.warn("Failed to save dismissed album", e);
	}
}

export function restoreReceivedAlbum(albumId: number): void {
	if (typeof window === "undefined" || !window.localStorage) return;
	try {
		const set = getDismissedAlbumIds();
		set.delete(albumId);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
	} catch (e) {
		console.warn("Failed to restore dismissed album", e);
	}
}

export function clearDismissedReceivedAlbums(): void {
	if (typeof window === "undefined" || !window.localStorage) return;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch (e) {
		console.warn("Failed to clear dismissed albums", e);
	}
}
