// electron-builder yapılandırması (JS — yorum yazılabilsin diye package.json'dan
// buraya taşındı). electron-builder bu dosyayı otomatik bulur.
//
// NOT: Linux derlemeleri yalnızca x64 (CachyOS dahil hedef kitle Arch/x86_64).
// arm64'ü geri eklemek için ilgili "arch" satırlarındaki yorumu aç:  ["x64", "arm64"]

module.exports = {
  appId: "com.serkan.portpilot",
  productName: "PortPilot",
  releaseInfo: {
    releaseNotesFile: "CHANGELOG.md",
  },
  files: [
    "electron/**/*",
    "server.js",
    "lib/**/*",
    "routes/**/*",
    "public/**/*",
    "CHANGELOG.md",
  ],
  extraMetadata: {
    main: "electron/main.js",
  },
  directories: {
    output: "dist",
  },
  compression: "maximum",
  publish: [
    {
      provider: "github",
      owner: "serkancakmakk",
      repo: "PortPilot",
      releaseType: "release",
    },
  ],
  mac: {
    category: "public.app-category.developer-tools",
    target: [
      { target: "dmg", arch: ["x64", "arm64"] },
      { target: "zip", arch: ["x64", "arm64"] },
    ],
    icon: "public/icon.png",
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    notarize: true,
  },
  win: {
    target: [
      { target: "nsis", arch: ["x64"] },
      { target: "portable", arch: ["x64"] },
    ],
    icon: "public/icon.png",
  },
  linux: {
    category: "Utility",
    maintainer: "Serkan <cakmakserkan07@gmail.com>",
    executableName: "portpilot",
    desktop: {
      StartupWMClass: "portpilot",
    },
    target: [
      { target: "AppImage", arch: ["x64" /*, "arm64" */] },
      { target: "deb", arch: ["x64" /*, "arm64" */] },
      { target: "rpm", arch: ["x64" /*, "arm64" */] },
      { target: "pacman", arch: ["x64" /*, "arm64" */] },
    ],
    icon: "public/icon.png",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
};
