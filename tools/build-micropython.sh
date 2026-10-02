#!/usr/bin/env bash
# DEVELOPMENT ONLY. Rebuilds the MicroPython firmware bundled for the simulated
# Raspberry Pi Pico (public/firmware/micropython-rpi-pico.uf2) from the official
# MicroPython sources. The application runs this unmodified firmware on the
# rp2040js emulator, so Python programs behave as on a real board.
#
#   tools/build-micropython.sh [work-dir]
#
# Needs git, cmake, python3 and the Arm GNU toolchain, e.g. on Ubuntu:
#   apt-get install gcc-arm-none-eabi libnewlib-arm-none-eabi libstdc++-arm-none-eabi-newlib cmake
set -euo pipefail

VERSION="${MICROPYTHON_VERSION:-v1.27.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${1:-$ROOT/.toolchain/micropython-build}"
OUT="$ROOT/public/firmware"

mkdir -p "$WORK" "$OUT"
if [ ! -d "$WORK/micropython/.git" ]; then
  git clone --depth 1 --branch "$VERSION" https://github.com/micropython/micropython.git "$WORK/micropython"
fi
cd "$WORK/micropython"
git -c advice.detachedHead=false checkout "$VERSION"

make -C mpy-cross -j"$(nproc)"
make -C ports/rp2 BOARD=RPI_PICO submodules
make -C ports/rp2 BOARD=RPI_PICO -j"$(nproc)"

cp ports/rp2/build-RPI_PICO/firmware.uf2 "$OUT/micropython-rpi-pico.uf2"
cp LICENSE "$OUT/LICENSE-micropython.txt"
echo "$VERSION" > "$OUT/micropython-version.txt"
echo "Built MicroPython $VERSION -> $OUT/micropython-rpi-pico.uf2"
