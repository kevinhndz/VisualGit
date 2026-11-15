#!/bin/sh
set -eu

repo=https://github.com/kevinhndz/VisualGit/releases/latest/download
system=$(uname -s)
machine=$(uname -m)
case "$system:$machine" in
  Linux:x86_64) asset=git-visual-linux-x64 ;;
  Linux:aarch64|Linux:arm64) asset=git-visual-linux-arm64 ;;
  Darwin:x86_64) asset=git-visual-darwin-x64 ;;
  Darwin:arm64) asset=git-visual-darwin-arm64 ;;
  *) echo "Sistema no compatible: $system $machine" >&2; exit 1 ;;
esac

app_dir="$HOME/.local/share/git-visual"
bin_dir="$HOME/.local/bin"
shortcut="$HOME/.local/share/applications/git-visual.desktop"
profile="$HOME/.profile"
echo "Git Visual instalará $asset en $app_dir, creará $bin_dir/git-visual y un acceso directo."
echo "Descargará el binario y SHA256SUMS desde $repo y comprobará SHA-256."
echo "Añadirá $bin_dir a PATH en $profile si hace falta. No se necesita sudo."
if [ "${1:-}" != "--yes" ]; then
  printf '¿Continuar? [s/N] '
  read -r answer
  case "$answer" in s|S|si|SI|sí|SÍ) ;; *) echo "Cancelado."; exit 0 ;; esac
fi

temp_dir=$(mktemp -d)
trap 'rm -rf "$temp_dir"' EXIT HUP INT TERM
curl -fLsS "$repo/$asset" -o "$temp_dir/$asset"
curl -fLsS "$repo/SHA256SUMS" -o "$temp_dir/SHA256SUMS"
if [ "$system" = Linux ]; then icon=app-icon.png; else icon=app-icon.icns; fi
curl -fLsS "$repo/$icon" -o "$temp_dir/$icon"
expected=$(awk -v name="$asset" '$2 == name { print $1 }' "$temp_dir/SHA256SUMS")
if [ -z "$expected" ]; then echo "No aparece el checksum del archivo." >&2; exit 1; fi
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$temp_dir/$asset" | cut -d ' ' -f 1)
else
  actual=$(shasum -a 256 "$temp_dir/$asset" | cut -d ' ' -f 1)
fi
if [ "$actual" != "$expected" ]; then echo "El SHA-256 no coincide." >&2; exit 1; fi
icon_expected=$(awk -v name="$icon" '$2 == name { print $1 }' "$temp_dir/SHA256SUMS")
if [ -z "$icon_expected" ]; then echo "Falta el checksum del icono." >&2; exit 1; fi
if command -v sha256sum >/dev/null 2>&1; then
  icon_actual=$(sha256sum "$temp_dir/$icon" | cut -d ' ' -f 1)
else
  icon_actual=$(shasum -a 256 "$temp_dir/$icon" | cut -d ' ' -f 1)
fi
if [ "$icon_actual" != "$icon_expected" ]; then echo "El SHA-256 del icono no coincide." >&2; exit 1; fi

mkdir -p "$app_dir" "$bin_dir"
install -m 755 "$temp_dir/$asset" "$app_dir/git-visual"
install -m 644 "$temp_dir/$icon" "$app_dir/$icon"
ln -sfn "$app_dir/git-visual" "$bin_dir/git-visual"
if [ "$system" = Linux ]; then
  mkdir -p "$(dirname "$shortcut")"
  cat > "$shortcut" <<END_DESKTOP
[Desktop Entry]
Type=Application
Name=Git Visual
Exec=$app_dir/git-visual
Icon=$app_dir/app-icon.png
Terminal=false
Categories=Development;Education;
END_DESKTOP
else
  app="$HOME/Applications/Git Visual.app/Contents"
  mkdir -p "$app/MacOS" "$app/Resources"
  cp "$app_dir/app-icon.icns" "$app/Resources/app-icon.icns"
  cat > "$app/MacOS/Git Visual" <<END_APP
#!/bin/sh
exec "$app_dir/git-visual" "\$@"
END_APP
  chmod 755 "$app/MacOS/Git Visual"
  cat > "$app/Info.plist" <<'END_PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>CFBundleName</key><string>Git Visual</string><key>CFBundleExecutable</key><string>Git Visual</string><key>CFBundleIconFile</key><string>app-icon.icns</string><key>CFBundleIdentifier</key><string>local.gitvisual.app</string></dict></plist>
END_PLIST
fi
if ! printf '%s' ":$PATH:" | grep -Fq ":$bin_dir:"; then
  printf '\n# Git Visual PATH\nexport PATH="%s:$PATH"\n' "$bin_dir" >> "$profile"
fi
echo "Instalado. Abre una terminal nueva y ejecuta git visual dentro de tu repositorio."
