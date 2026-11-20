const targets = [
  ['x86_64-windows', 'zls-x86_64-windows.zip'],
  ['aarch64-windows', 'zls-aarch64-windows.zip'],
  ['x86_64-macos', 'zls-x86_64-macos.tar.xz'],
  ['aarch64-macos', 'zls-aarch64-macos.tar.xz'],
  ['x86_64-linux', 'zls-x86_64-linux.tar.xz'],
  ['aarch64-linux', 'zls-aarch64-linux.tar.xz'],
];

async function getJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Zig-IDE-Toolchain-Asset-Check', ...headers },
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (b[i] || 0) - (a[i] || 0);
  }
  return 0;
}

const zigIndex = await getJson('https://ziglang.org/download/index.json');
const zlsReleases = await getJson(
  'https://api.github.com/repos/zigtools/zls/releases?per_page=100',
  { Accept: 'application/vnd.github+json' },
);
const stableVersions = Object.keys(zigIndex)
  .filter((version) => /^\d+\.\d+\.\d+$/.test(version))
  .sort(compareVersions);

let selected = null;
for (const zigVersion of stableVersions) {
  const [major, minor] = zigVersion.split('.');
  const compatible = zlsReleases
    .filter((release) => {
      const match = String(release.tag_name).replace(/^v/, '').match(/^(\d+)\.(\d+)\./);
      return match && match[1] === major && match[2] === minor && !release.prerelease && !release.draft;
    })
    .sort((a, b) => compareVersions(
      String(a.tag_name).replace(/^v/, ''),
      String(b.tag_name).replace(/^v/, ''),
    ));

  const allTargetsAvailable = targets.every(([zigKey, zlsAssetName]) => {
    const zigAsset = zigIndex[zigVersion]?.[zigKey];
    const zlsAssetExists = compatible.some((release) =>
      release.assets?.some((asset) => asset.name === zlsAssetName && asset.browser_download_url),
    );
    return Boolean(zigAsset?.tarball && zigAsset?.shasum && zlsAssetExists);
  });

  if (allTargetsAvailable) {
    selected = { zigVersion, zlsVersion: compatible[0].tag_name };
    break;
  }
}

if (!selected) {
  throw new Error('No stable Zig/ZLS version pair has downloadable assets for all six Windows/macOS/Linux x64/arm64 targets.');
}

console.log(`Latest common stable toolchain: Zig ${selected.zigVersion} + ZLS ${selected.zlsVersion}`);
for (const [zigKey, zlsAssetName] of targets) {
  console.log(`OK ${zigKey}: Zig archive + ${zlsAssetName}`);
}
console.log('All six Windows/macOS/Linux x64/arm64 toolchain combinations are available.');
