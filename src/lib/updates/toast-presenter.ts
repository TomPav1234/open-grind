import { APP_COMPONENT, type ComponentKey } from "./components";
import type { StagePresenter } from "./flow";
import {
	dismissStage,
	showAddonInstalled,
	showAddonUpToDate,
	showInstalled,
	showManualInstall,
	showProblem,
	showStage,
} from "./toasts";

export function toastPresenter(component: ComponentKey): StagePresenter {
	return {
		show: (stage) => showStage({ component, ...stage }),
		dismiss: () => dismissStage(component),
		problem: (title) =>
			showProblem({
				title,
				body: component === APP_COMPONENT ? undefined : "Companion app",
			}),
		manualInstall: (body) => showManualInstall(body),
		installed: ({ tag, kind }) => {
			if (component === APP_COMPONENT) void showInstalled();
			else showAddonInstalled({ component, tag, kind });
		},
		upToDate: () => showAddonUpToDate(),
	};
}
