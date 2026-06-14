# Community Themes for Moros

This document lists known third-party themes for Moros found on GitHub.

## Official Resources

| Repository | Description |
|------------|-------------|
| [Foundry376/Mailspring-Theme-Starter](https://github.com/Foundry376/Mailspring-Theme-Starter) | Official theme template for creating your own themes |

## Popular Theme Collections

These themes are part of larger theme ecosystems:

| Repository | Description | Stars |
|------------|-------------|-------|
| [catppuccin/moros](https://github.com/catppuccin/moros) | Soothing pastel theme (Catppuccin) | ⭐58 |
| [dracula/moros](https://github.com/dracula/moros) | Official Dracula dark theme | ⭐17 |
| [faraadi/moros-nord-theme](https://github.com/faraadi/moros-nord-theme) | Nordic color scheme | ⭐72 |
| [getomni/moros](https://github.com/getomni/moros) | Omni theme | ⭐40 |
| [jakubzet/moros-matcha-theme](https://github.com/jakubzet/moros-matcha-theme) | Matcha theme | ⭐42 |

## Dark Themes

| Repository | Description | Stars |
|------------|-------------|-------|
| [jpminor/moros-isaac-dark-theme](https://github.com/jpminor/moros-isaac-dark-theme) | Newton-inspired dark theme | ⭐23 |
| [asparc/predawn](https://github.com/asparc/predawn) | Predawn (Atom/Sublime Text-inspired) | ⭐23 |
| [pierrenel/moros-dracula](https://github.com/pierrenel/moros-dracula) | Dracula variant | - |
| [GianniLab/Mailspring-Eleven-Dark](https://github.com/GianniLab/Mailspring-Eleven-Dark) | Windows 11-inspired dark | ⭐9 |
| [yz2/moros-minimal-dark-theme](https://github.com/yz2/moros-minimal-dark-theme) | Clean, minimal dark theme | ⭐8 |
| [chroxify/Sweet-Mailspring](https://github.com/chroxify/Sweet-Mailspring) | Custom dark theme | ⭐8 |
| [ZahidHasan/Dark-Light-Theme-Mailspring](https://github.com/ZahidHasan/Dark-Light-Theme-Mailspring) | Minimalist dark theme | - |
| [mjohnson8165/moros-arc-dark](https://github.com/mjohnson8165/moros-arc-dark) | Arc Dark theme | - |
| [dennisotugo/Mailspring-Adapta-Theme](https://github.com/dennisotugo/Mailspring-Adapta-Theme) | Adapta Dark theme | ⭐15 |
| [opes/moros-material](https://github.com/opes/moros-material) | Material Theme-inspired | - |
| [joelabair/Mailspring-OnLevel-Theme](https://github.com/joelabair/Mailspring-OnLevel-Theme) | N1 Level Up-inspired | - |
| [joeroe/moros-gruvbox-dark](https://github.com/joeroe/moros-gruvbox-dark) | Gruvbox color scheme | - |
| [kcaliban/Mailspring-Theme-Gruvbox](https://github.com/kcaliban/Mailspring-Theme-Gruvbox) | Gruvbox theme | - |
| [Infamoustrey/moros-theme-dracula](https://github.com/Infamoustrey/moros-theme-dracula) | Another Dracula variant | - |
| [luisfpg/Mailspring-Materia-Dark-Theme](https://github.com/luisfpg/Mailspring-Materia-Dark-Theme) | Materia Dark matching | - |
| [runeru/moros-runeru-theme](https://github.com/runeru/moros-runeru-theme) | GitHub colors-based dark | ⭐7 |
| [hakouguelfen/moros-theme](https://github.com/hakouguelfen/moros-theme) | Doom-One theme | - |

## Light Themes

| Repository | Description | Stars |
|------------|-------------|-------|
| [jpminor/moros-isaac-light-theme](https://github.com/jpminor/moros-isaac-light-theme) | Newton-inspired light theme | ⭐13 |
| [GianniLab/Mailspring-11-light-theme](https://github.com/GianniLab/Mailspring-11-light-theme) | Windows 11-inspired light | ⭐7 |
| [dincsi/adwaita-moros](https://github.com/dincsi/adwaita-moros) | GNOME Adwaita light theme | - |
| [NeoMahler/moros-idido](https://github.com/NeoMahler/moros-idido) | Polymail-inspired clean theme | ⭐10 |
| [danieljimeneznz/moros-agapanthus-theme](https://github.com/danieljimeneznz/moros-agapanthus-theme) | Inbox/Google Cloud-inspired | - |

## Other Themes

| Repository | Description | Stars |
|------------|-------------|-------|
| [antonioprates/moros-matcha-dark-azul](https://github.com/antonioprates/moros-matcha-dark-azul) | Manjaro matcha-dark-azul matching | ⭐7 |
| [webxperia/moros-theme-spark](https://github.com/webxperia/moros-theme-spark) | Spark theme | - |
| [m1guelpf/moros-theme](https://github.com/m1guelpf/moros-theme) | Personalized dark material | - |
| [nukeknurs/Reborn](https://github.com/nukeknurs/Reborn) | "Less is more" minimal theme | - |
| [tynguyen2k1/Mailspring-Nord-Theme](https://github.com/tynguyen2k1/Mailspring-Nord-Theme) | Tokyo Night-style theme | - |
| [Kasjonus/wiertara-theme](https://github.com/Kasjonus/wiertara-theme) | Wiertara theme | - |
| [Morgareth99/Mailspring-Nord](https://github.com/Morgareth99/Mailspring-Nord) | Nord theme variant | - |
| [ralphacpm/Mailspring-Nord-Theme](https://github.com/ralphacpm/Mailspring-Nord-Theme) | Nord theme variant | - |
| [avano/Mailspring-Theme](https://github.com/avano/Mailspring-Theme) | Custom theme | - |

## Discovering More Themes

- [GitHub Topic: moros-theme](https://github.com/topics/moros-theme) - All themes tagged with this topic
- [GitHub Topic: moros](https://github.com/topics/moros) - General Moros-related repos

## Creating Your Own Theme

To create your own theme:

1. Clone the [Mailspring-Theme-Starter](https://github.com/Foundry376/Mailspring-Theme-Starter)
2. Edit `package.json` with your theme's name and description
3. Modify the LESS files in `styles/`:
   - `index.less` - Main stylesheet
   - `ui-variables.less` - UI color variables
   - `theme-colors.less` - Theme color definitions

### Theme Installation

Install themes via **Edit > Install Theme...** (or **Moros > Install Theme...** on macOS) and select the theme folder.

Alternatively, copy or symlink themes to:
- **macOS**: `~/Library/Application Support/Moros/packages/`
- **Linux**: `~/.config/Moros/packages/`
- **Windows**: `%APPDATA%/Moros/packages/`

### Theme Structure

```
my-theme/
├── package.json          # Metadata (name, description, license)
├── styles/
│   ├── index.less        # Main stylesheet
│   ├── ui-variables.less # UI color variables
│   └── theme-colors.less # Theme color definitions
├── LICENSE.md
└── README.md
```

The `package.json` should include:
```json
{
  "name": "my-theme",
  "displayName": "My Theme",
  "theme": "ui",
  "version": "1.0.0",
  "engines": {
    "moros": "*"
  }
}
```
