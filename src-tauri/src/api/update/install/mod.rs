#[cfg(target_os = "android")]
mod android;
#[cfg(target_os = "android")]
pub use android::AndroidUpdater;
#[cfg(not(target_os = "android"))]
mod desktop;

use serde::{Deserialize, Serialize};

use super::baseline::Baseline;
use super::component::Component;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
	rename_all = "camelCase",
	rename_all_fields = "camelCase",
	tag = "reason",
	content = "detail"
)]
pub enum Unsupported {
	ExternallyManaged { installer: String },
	ForeignSigner,
	Undetermined,
	NoReleaseArtifacts { target: String },
	Sandboxed { runtime: String },
	LocationNotWritable { path: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(
	rename_all = "camelCase",
	rename_all_fields = "camelCase",
	tag = "state",
	content = "detail"
)]
pub enum Capability {
	Supported {
		payload_suffix: String,
		can_install_now: bool,
	},
	Unsupported(Unsupported),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
	#[serde(default)]
	pub package_name: Option<String>,
	pub succeeded: bool,
	#[serde(default)]
	pub canceled: bool,
	pub code: Option<i32>,
	pub message: Option<String>,
}

fn suffix_for(os: &str, arch: &str) -> Option<String> {
	let arch = match arch {
		"aarch64" => "arm64",
		other => other,
	};
	match os {
		"android" => Some("-android.apk".to_owned()),
		"macos" => Some("-macos.zip".to_owned()),
		"windows" => Some(format!("-windows-{arch}.exe")),
		"linux" => Some(format!("-linux-{arch}.AppImage")),
		_ => None,
	}
}

pub fn release_asset_suffix() -> Option<String> {
	let os = std::env::consts::OS;
	if os == "linux" && crate::appimage::path().is_none() {
		return None;
	}
	suffix_for(os, std::env::consts::ARCH)
}

fn target() -> String {
	format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

pub fn capability_for(
	app: &tauri::AppHandle,
	component: &Component,
) -> Capability {
	let can_install_now = match platform::verdict(app, component) {
		Ok(can_install_now) => can_install_now,
		Err(reason) => return Capability::Unsupported(reason),
	};
	match (component.asset_suffix)() {
		Some(payload_suffix) => Capability::Supported {
			payload_suffix,
			can_install_now,
		},
		None => Capability::Unsupported(Unsupported::NoReleaseArtifacts {
			target: target(),
		}),
	}
}

pub fn probe(app: &tauri::AppHandle, component: &Component) -> Baseline {
	match component.package() {
		None => Baseline::of_version(app.package_info().version.clone()),
		Some(package) => platform::probe_package(app, package),
	}
}

#[cfg(target_os = "android")]
use android as platform;
#[cfg(not(target_os = "android"))]
use desktop as platform;

pub use platform::{
	enforce_home, hold_process, install, install_pending,
	open_install_permission_settings, sweep_replaced, take_outcome,
	watch_install,
};

#[cfg(test)]
mod pins {
	use super::suffix_for;

	const KEYS: &str = include_str!("../../../../../KEYS.md");
	const LINUX_BUILD: &str = include_str!("../../../../../ci/linux/build.sh");
	const GATE: &str = include_str!(
		"../../../../android-logic/src/main/kotlin/org/opengrind/update/InstallGate.kt"
	);
	const MANIFEST: &str = include_str!(
		"../../../../gen/android/app/src/main/AndroidManifest.xml"
	);

	fn hex64(line: &str) -> bool {
		line.len() == 64 && line.chars().all(|c| c.is_ascii_hexdigit())
	}

	const PLUGIN: &str = include_str!(
		"../../../../gen/android/app/src/main/java/org/opengrind/update/UpdatePlugin.kt"
	);

	const ANDROID_BRIDGE: &str = include_str!("android.rs");

	#[test]
	fn every_literal_plugin_command_the_bridge_invokes_exists_in_kotlin() {
		let invoked: Vec<&str> = ANDROID_BRIDGE
			.split("run_mobile_plugin")
			.skip(1)
			.filter_map(|call| {
				let arguments = call[call.find('(')? + 1..].trim_start();
				arguments.strip_prefix('"')?.split('"').next()
			})
			.collect();
		assert!(
			invoked.contains(&"installPending"),
			"the bridge no longer asks the plugin whether an install is pending"
		);
		for command in invoked {
			assert!(
				PLUGIN.contains(&format!(
					"@Command\n\tfun {command}(invoke: Invoke)"
				)),
				"UpdatePlugin has no @Command named {command}"
			);
		}
	}

	#[test]
	fn the_kotlin_install_allowlist_matches_the_component_table() {
		use super::super::component;

		let start = PLUGIN
			.find("const val GOOGLE_OAUTH")
			.expect("UpdatePlugin pins the addon package id");
		let pinned = PLUGIN[start..]
			.split('"')
			.nth(1)
			.expect("the pin holds a string literal");
		assert_eq!(pinned, component::GOOGLE_OAUTH.install_target());

		let allowlisted: Vec<&str> = component::ALL
			.iter()
			.map(|c| c.install_target())
			.filter(|target| *target != component::SELF_PACKAGE)
			.collect();
		assert_eq!(
			allowlisted,
			vec![pinned],
			"every non-self component must appear in the Kotlin allowlist"
		);
		assert!(
			PLUGIN.contains("packageName == activity.packageName"),
			"the allowlist must still admit this app itself"
		);
		assert!(
			PLUGIN.contains("packageName == GOOGLE_OAUTH"),
			"isInstallableTarget must admit the addon package"
		);
		for target in &allowlisted {
			assert!(
				MANIFEST
					.contains(&format!("<package android:name=\"{target}\" />")),
				"{target} needs a <queries> entry or the package probe reports it absent"
			);
		}
	}

	#[test]
	fn the_kotlin_signer_pin_matches_the_published_jks_fingerprint() {
		let published = KEYS
			.lines()
			.skip_while(|line| !line.contains("Android JKS"))
			.map(str::trim)
			.find(|line| hex64(line))
			.expect("KEYS.md publishes no Android JKS fingerprint");
		let start = GATE
			.find("RELEASE_CERT_SHA256")
			.expect("pin in InstallGate");
		let literal = GATE[start..]
			.split('"')
			.nth(1)
			.expect("pin holds a string literal");

		assert!(
			literal.eq_ignore_ascii_case(published),
			"pin drifted from KEYS.md"
		);
		assert!(
			literal.chars().all(|c| !c.is_ascii_lowercase()),
			"soleSignerOf emits uppercase hex and the comparison is case-sensitive"
		);
	}

	#[test]
	fn the_linux_suffix_matches_the_appimage_name_the_build_writes() {
		assert_eq!(
			suffix_for("linux", "x86_64").unwrap(),
			"-linux-x86_64.AppImage"
		);
		assert_eq!(
			suffix_for("linux", "aarch64").unwrap(),
			"-linux-arm64.AppImage"
		);
		assert!(
			LINUX_BUILD.contains("-linux-$arch.AppImage"),
			"build.sh no longer writes the name the updater asks for"
		);
		assert!(
			LINUX_BUILD.contains("aarch64) arch=arm64"),
			"build.sh no longer maps aarch64 to arm64"
		);
	}

	#[cfg(target_os = "linux")]
	#[test]
	fn a_linux_install_that_is_not_an_appimage_is_offered_nothing() {
		assert!(
			super::release_asset_suffix().is_none(),
			"a .deb install must leave updates to the package manager"
		);
	}

	#[test]
	fn the_update_components_stay_unexported() {
		for component in ["InstallResultReceiver", "TransferService"] {
			let at = MANIFEST.find(component).expect(component);
			let element = &MANIFEST
				[at..MANIFEST[at..].find('>').map(|i| at + i).unwrap()];
			assert!(
				element.contains("android:exported=\"false\""),
				"{component} must not be exported"
			);
		}
	}
}
