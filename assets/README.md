# Assets

Master brand assets live here — the source of truth for the app's identity.

## Icon

`icon-master.png` — the transparent master icon. Every icon the app uses is
generated from this single file:

| Generated file (`public/icons/`) | Where it appears |
| -------------------------------- | ---------------- |
| `icon.png`, `icon-192.png`, `icon-512.png` | browser tab favicon, PWA install icon (desktop/taskbar/dock) |
| `icon-maskable-192/512.png` | install icons on devices that mask icons into circles/rounded squares |
| `apple-touch-icon.png` | iOS home screen icon (opaque — iOS rounds it itself) |
| `icon-192.png` (also) | the brand mark in the sidebar, mobile nav and login screen |

To change the identity: replace `icon-master.png` (a transparent PNG, square
or safely center-cropped) and run:

```bash
npm run icons
```

The script picks the tile colour for the opaque variants automatically
(bright art → dark brand tile, dark art → white); force it with
`--bg '#RRGGBB'`. Never edit files in `public/icons/` by hand — they are
build output of this master.
