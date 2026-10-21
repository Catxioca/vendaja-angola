import { EnterpriseLogger } from "./logger.service.js";

export type UpdateChannel = "stable" | "beta" | "pilot";

export interface VersionReleaseManifest {
  version: string;
  releaseDate: string;
  channel: UpdateChannel;
  critical: boolean;
  minSupportedVersion: string;
  releaseNotesUrl: string;
  downloadUrls: {
    windowsInstaller: string;
    macosInstaller: string;
    linuxAppImage: string;
  };
  sha256Checksums: {
    windows: string;
    macos: string;
    linux: string;
  };
  databaseSchemaVersion: number;
}

export const LATEST_RELEASES: Record<UpdateChannel, VersionReleaseManifest> = {
  stable: {
    version: "2.2.2",
    releaseDate: "2026-10-20T12:00:00Z",
    channel: "stable",
    critical: false,
    minSupportedVersion: "2.1.0",
    releaseNotesUrl: "https://updates.vendaja.ao/releases/2.2.2/notes",
    downloadUrls: {
      windowsInstaller: "https://updates.vendaja.ao/releases/2.2.2/VendaJa-Angola-2.2.2-win-x64.exe",
      macosInstaller: "https://updates.vendaja.ao/releases/2.2.2/VendaJa-Angola-2.2.2-mac-arm64.dmg",
      linuxAppImage: "https://updates.vendaja.ao/releases/2.2.2/VendaJa-Angola-2.2.2-x86_64.AppImage",
    },
    sha256Checksums: {
      windows: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      macos: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      linux: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    databaseSchemaVersion: 8,
  },
  beta: {
    version: "2.3.0-beta.1",
    releaseDate: "2026-10-20T14:00:00Z",
    channel: "beta",
    critical: false,
    minSupportedVersion: "2.2.0",
    releaseNotesUrl: "https://updates.vendaja.ao/releases/2.3.0-beta.1/notes",
    downloadUrls: {
      windowsInstaller: "https://updates.vendaja.ao/releases/beta/VendaJa-Angola-2.3.0-beta.1-win-x64.exe",
      macosInstaller: "https://updates.vendaja.ao/releases/beta/VendaJa-Angola-2.3.0-beta.1-mac-arm64.dmg",
      linuxAppImage: "https://updates.vendaja.ao/releases/beta/VendaJa-Angola-2.3.0-beta.1-x86_64.AppImage",
    },
    sha256Checksums: {
      windows: "d41d8cd98f00b204e9800998ecf8427e",
      macos: "d41d8cd98f00b204e9800998ecf8427e",
      linux: "d41d8cd98f00b204e9800998ecf8427e",
    },
    databaseSchemaVersion: 9,
  },
  pilot: {
    version: "2.3.0-pilot.5",
    releaseDate: "2026-10-20T14:30:00Z",
    channel: "pilot",
    critical: false,
    minSupportedVersion: "2.2.0",
    releaseNotesUrl: "https://updates.vendaja.ao/releases/pilot/notes",
    downloadUrls: {
      windowsInstaller: "https://updates.vendaja.ao/releases/pilot/VendaJa-Angola-pilot-win-x64.exe",
      macosInstaller: "https://updates.vendaja.ao/releases/pilot/VendaJa-Angola-pilot-mac-arm64.dmg",
      linuxAppImage: "https://updates.vendaja.ao/releases/pilot/VendaJa-Angola-pilot-x86_64.AppImage",
    },
    sha256Checksums: {
      windows: "d41d8cd98f00b204e9800998ecf8427e",
      macos: "d41d8cd98f00b204e9800998ecf8427e",
      linux: "d41d8cd98f00b204e9800998ecf8427e",
    },
    databaseSchemaVersion: 9,
  },
};

export class EnterpriseCloudUpdateService {
  /**
   * Check for software updates against the central release channel.
   */
  static checkForUpdate(currentVersion: string, channel: UpdateChannel = "stable"): {
    updateAvailable: boolean;
    manifest: VersionReleaseManifest;
    mustForceUpdate: boolean;
  } {
    const manifest = LATEST_RELEASES[channel] || LATEST_RELEASES.stable;
    const updateAvailable = currentVersion !== manifest.version;
    const mustForceUpdate = manifest.critical;

    EnterpriseLogger.info(
      "CLOUD_UPDATE",
      "UPDATE_CHECK",
      `Verificação de versão: atual=${currentVersion}, latest=${manifest.version} (${channel})`,
      { currentVersion, updateAvailable }
    );

    return {
      updateAvailable,
      manifest,
      mustForceUpdate,
    };
  }

  /**
   * Retrieve release manifest by channel.
   */
  static async getUpdateManifest(channel: UpdateChannel = "stable", _currentVersion?: string): Promise<VersionReleaseManifest> {
    return LATEST_RELEASES[channel] || LATEST_RELEASES.stable;
  }

  /**
   * Publish new OTA release update manifest.
   */
  static async publishUpdate(data: {
    version: string;
    channel: UpdateChannel;
    minVersionRequired?: string;
    releaseNotes?: string;
    downloadUrl?: string;
    sha256?: string;
    fileSizeMb?: number;
  }): Promise<VersionReleaseManifest> {
    const manifest: VersionReleaseManifest = {
      version: data.version,
      releaseDate: new Date().toISOString(),
      channel: data.channel,
      critical: false,
      minSupportedVersion: data.minVersionRequired || "2.0.0",
      releaseNotesUrl: `https://updates.vendaja.ao/releases/${data.version}/notes`,
      downloadUrls: {
        windowsInstaller: data.downloadUrl || `https://updates.vendaja.ao/releases/${data.channel}/VendaJa-${data.version}.exe`,
        macosInstaller: `https://updates.vendaja.ao/releases/${data.channel}/VendaJa-${data.version}.dmg`,
        linuxAppImage: `https://updates.vendaja.ao/releases/${data.channel}/VendaJa-${data.version}.AppImage`,
      },
      sha256Checksums: {
        windows: data.sha256 || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        macos: data.sha256 || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        linux: data.sha256 || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
      databaseSchemaVersion: 9,
    };
    LATEST_RELEASES[data.channel] = manifest;
    return manifest;
  }
}
