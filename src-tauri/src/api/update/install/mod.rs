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
	ForeignTarget,
	Undetermined,
	NoReleaseArtifacts { target: String },
	Sandboxed { runtime: String },
	LocationNotWritable { path: String },
}

impl Unsupported {
	#[cfg_attr(not(target_os = "android"), allow(dead_code))]
	fn from_gate_marker(
		marker: &str,
		installer: Option<String>,
	) -> Option<Self> {
		match marker {
			"externally-managed" => Some(Self::ExternallyManaged {
				installer: installer.unwrap_or_else(|| "another store".into()),
			}),
			"foreign-signer" => Some(Self::ForeignSigner),
			"foreign-target" => Some(Self::ForeignTarget),
			_ => None,
		}
	}
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
	use super::{suffix_for, Unsupported};

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

	const INSTALLER: &str = include_str!(
		"../../../../gen/android/app/src/main/java/org/opengrind/update/ApkInstaller.kt"
	);

	const PROBE: &str = include_str!(
		"../../../../gen/android/app/src/main/java/org/opengrind/update/InstallProbe.kt"
	);

	const SIGN_IN_PLUGIN: &str = include_str!(
		"../../../../gen/android/app/src/main/java/org/opengrind/googleoauth/GoogleOauthPlugin.kt"
	);

	const TOKEN_HANDOFF: &str = include_str!(
		"../../../../gen/android/app/src/main/java/org/opengrind/TokenHandoffActivity.kt"
	);

	const REQUEST_TOKEN_PERMISSION: &str =
		"org.opengrind.google_oauth.permission.REQUEST_TOKEN";
	const REQUEST_TOKEN_ACTION: &str =
		"org.opengrind.google_oauth.action.REQUEST_TOKEN";
	const RECEIVE_TOKEN_PERMISSION: &str =
		"org.opengrind.permission.RECEIVE_GOOGLE_TOKEN";
	const TOKEN_EXTRA: &str = "org.opengrind.google_oauth.extra.TOKEN";

	fn squashed(source: &str) -> String {
		source.split_whitespace().collect()
	}

	fn kotlin_constant<'a>(source: &'a str, file: &str, name: &str) -> &'a str {
		let declaration = format!("const val {name} = \"");
		let start = source
			.find(&declaration)
			.unwrap_or_else(|| panic!("{file} no longer declares {name}"))
			+ declaration.len();
		let length = source[start..]
			.find('"')
			.unwrap_or_else(|| panic!("{file} {name} is not a string literal"));
		&source[start..start + length]
	}

	fn bridge_function(name: &str) -> &'static str {
		let start = ANDROID_BRIDGE
			.find(&format!("fn {name}("))
			.unwrap_or_else(|| panic!("android.rs no longer defines {name}"));
		let length =
			ANDROID_BRIDGE[start..].find("\n}\n").unwrap_or_else(|| {
				panic!("android.rs {name} has no closing brace")
			});
		&ANDROID_BRIDGE[start..start + length]
	}

	fn manifest_element(tag: &str, name: &str) -> &'static str {
		let opening = format!("<{tag}");
		let named = format!("android:name=\"{name}\"");
		MANIFEST
			.match_indices(&opening)
			.map(|(at, _)| {
				let end =
					MANIFEST[at..].find('>').map_or(MANIFEST.len(), |i| at + i);
				&MANIFEST[at..end]
			})
			.find(|element| element.contains(&named))
			.unwrap_or_else(|| {
				panic!("the manifest has no <{tag}> named {name}")
			})
	}

	#[test]
	fn every_gate_refusal_the_kotlin_side_sends_maps_to_its_reason() {
		for (verdict, marker, expected) in [
			(
				"ExternallyManaged",
				"externally-managed",
				Unsupported::ExternallyManaged {
					installer: "another store".into(),
				},
			),
			(
				"ForeignSigner",
				"foreign-signer",
				Unsupported::ForeignSigner,
			),
			(
				"ForeignTarget",
				"foreign-target",
				Unsupported::ForeignTarget,
			),
		] {
			assert!(
				squashed(PLUGIN).contains(&squashed(&format!(
					"is InstallGate.Verdict.{verdict} -> put(\"reason\", \"{marker}\")"
				))) || squashed(PLUGIN).contains(&squashed(&format!(
					"is InstallGate.Verdict.{verdict} -> {{ put(\"reason\", \"{marker}\")"
				))),
				"UpdatePlugin.capability no longer reports {verdict} as {marker}"
			);
			assert!(
				squashed(INSTALLER).contains(&squashed(&format!(
					"is InstallGate.Verdict.{verdict} -> throw InstallRefused(\"{marker}\")"
				))),
				"ApkInstaller.install no longer refuses {verdict} as {marker}"
			);
			assert_eq!(
				Unsupported::from_gate_marker(marker, None),
				Some(expected),
				"the bridge does not map {marker}"
			);
		}
		assert_eq!(
			Unsupported::from_gate_marker(
				"externally-managed",
				Some("org.fdroid.fdroid".into())
			),
			Some(Unsupported::ExternallyManaged {
				installer: "org.fdroid.fdroid".into()
			})
		);
		assert_eq!(Unsupported::from_gate_marker("downgrade", None), None);
	}

	#[test]
	fn the_android_bridge_reads_gate_refusals_through_the_shared_mapping() {
		assert!(
			bridge_function("verdict").contains(
				"Unsupported::from_gate_marker(reason, response.installer)"
			),
			"android.rs verdict no longer maps capability reasons through from_gate_marker"
		);
		let refusal = bridge_function("map_plugin_error");
		assert!(
			refusal.contains("Unsupported::from_gate_marker(marker, None)")
				&& refusal.contains("return UpdateError::Unsupported(unsupported);"),
			"android.rs map_plugin_error no longer maps install refusals through from_gate_marker"
		);
		assert!(
			bridge_function("install").contains(".map_err(map_plugin_error)"),
			"android.rs install no longer maps plugin errors"
		);
	}

	#[test]
	fn the_install_probe_judges_the_target_by_one_signature_check() {
		assert!(
			squashed(PROBE).contains(&squashed(
				"targetSigner = InstallGate.TargetSigner.of(context.packageManager.checkSignatures(context.packageName, target)"
			)),
			"InstallProbe.verdictFor no longer maps a single checkSignatures result through TargetSigner.of"
		);
	}

	#[test]
	fn the_sign_in_handoff_matches_the_companion_contract() {
		use super::super::component;

		let companion = component::GOOGLE_OAUTH.install_target();
		assert!(
			MANIFEST.contains(&format!(
				"<uses-permission android:name=\"{REQUEST_TOKEN_PERMISSION}\" />"
			)),
			"the manifest no longer asks for {REQUEST_TOKEN_PERMISSION}, so the companion refuses the token request"
		);
		assert!(
			REQUEST_TOKEN_PERMISSION.starts_with(&format!("{companion}.")),
			"the component table package {companion} no longer owns {REQUEST_TOKEN_PERMISSION}"
		);

		assert!(
			manifest_element("permission", RECEIVE_TOKEN_PERMISSION)
				.contains("android:protectionLevel=\"signature\""),
			"{RECEIVE_TOKEN_PERMISSION} is no longer a signature permission, so any app could hand over a token"
		);
		assert!(
			manifest_element("activity", ".TokenHandoffActivity").contains(
				&format!("android:permission=\"{RECEIVE_TOKEN_PERMISSION}\"")
			),
			"TokenHandoffActivity is no longer guarded by {RECEIVE_TOKEN_PERMISSION}"
		);

		assert!(
			MANIFEST
				.contains(&format!("<package android:name=\"{companion}\" />")),
			"the manifest <queries> no longer names the companion {companion}"
		);
		for (file, source) in [
			("GoogleOauthPlugin.kt", SIGN_IN_PLUGIN),
			("TokenHandoffActivity.kt", TOKEN_HANDOFF),
		] {
			assert_eq!(
				kotlin_constant(source, file, "COMPANION_PACKAGE"),
				companion,
				"{file} COMPANION_PACKAGE drifted from the component table"
			);
			assert_eq!(
				kotlin_constant(source, file, "EXTRA_TOKEN"),
				TOKEN_EXTRA,
				"{file} EXTRA_TOKEN drifted from the companion's published extra"
			);
		}
		assert_eq!(
			kotlin_constant(
				SIGN_IN_PLUGIN,
				"GoogleOauthPlugin.kt",
				"REQUEST_TOKEN_ACTION"
			),
			REQUEST_TOKEN_ACTION,
			"GoogleOauthPlugin.kt REQUEST_TOKEN_ACTION drifted from the companion's published action"
		);
	}

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
