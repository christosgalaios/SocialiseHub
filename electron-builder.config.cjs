// electron-builder config — using .cjs to avoid ESM issues
module.exports = {
  appId: 'com.socialise.hub',
  productName: 'SocialiseHub',
  directories: {
    output: 'release',
    buildResources: 'assets',
  },
  files: [
    'dist/**/*',
    'dist-client/**/*',
    'dist-electron/**/*',
    'package.json',
  ],
  extraResources: [
    { from: 'data', to: 'data', filter: ['**/*'] },
  ],
  win: {
    target: ['nsis'],
    icon: 'assets/icon.ico',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  mac: {
    target: ['dmg'],
    icon: 'assets/icon.icns',
  },
};
