#!/bin/zsh
cd -- "${0:A:h}" || exit 1
if ! /usr/bin/env python3 launch.py; then
  printf '\nPress Return to close this window.\n'
  read -r
fi
