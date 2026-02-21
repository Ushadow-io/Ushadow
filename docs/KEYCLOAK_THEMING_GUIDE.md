# Keycloak Theming Guide

This guide explains how the Ushadow custom theme for Keycloak login/registration pages works.

## ✅ Current Status

The Ushadow theme is **fully configured and active**:
- ✅ Theme files mounted in Keycloak container
- ✅ CSS customized with Ushadow brand colors
- ✅ Realm configured to use the theme
- ✅ Dark theme matching main app design

## Theme Structure

```
config/keycloak/themes/ushadow/
├── theme.properties              # Theme configuration
└── login/
    ├── theme.properties          # Login-specific config
    └── resources/
        ├── css/
        │   └── login.css        # Custom CSS (main styling)
        └── img/
            ├── logo.png         # Ushadow logo (80x80px)
            └── README.md
```

## How It Works

### 1. Theme Mounting
The theme is mounted into the Keycloak container via docker-compose:

```yaml
# In compose/docker-compose.infra.yml
keycloak:
  volumes:
    - ../config/keycloak/themes:/opt/keycloak/themes:ro
```

### 2. Theme Configuration
The `login/theme.properties` file tells Keycloak:
- Inherit from the base `keycloak` theme
- Override styles with our custom `css/login.css`

### 3. CSS Customization
The `login.css` file uses your design system colors:
- **Primary Green**: `#4ade80` (buttons, focus states)
- **Accent Purple**: `#a855f7` (social login, accents)
- **Dark Backgrounds**: Zinc-900/800/700 palette
- **Text Colors**: Zinc-100/400/500 for hierarchy

### 4. Realm Assignment
The realm configuration points to the theme:

```json
{
  "loginTheme": "ushadow",
  "accountTheme": "keycloak",
  "emailTheme": "keycloak"
}
```

## Design System Integration

The theme matches your main app's design system:

### Color Variables
```css
:root {
  /* Primary Color - Bright Blue */
  --ushadow-primary: #3B82F6;      /* Blue-500 - Buttons */

  /* Accent Colors - Logo colors */
  --ushadow-green: #4ade80;        /* Green-400 - Register link */
  --ushadow-purple: #a855f7;       /* Purple-500 - Logo */

  /* Dark Theme Backgrounds */
  --ushadow-bg-page: #0a0a0a;      /* Almost black */
  --ushadow-bg-card: #1a1a1a;      /* Card background */
  --ushadow-bg-input: #0f0f0f;     /* Input fields */

  /* Text Colors */
  --ushadow-text-primary: #ffffff;  /* Pure white */
  --ushadow-text-secondary: #71717a; /* Zinc-500 */

  /* Link Colors */
  --ushadow-link-blue: #60a5fa;    /* Blue-400 - "Forgot Password?" */
  --ushadow-link-green: #4ade80;   /* Green-400 - "Register" */
}
```

### UI Elements
- **Inputs**: Very dark backgrounds (#0f0f0f) with blue focus rings
- **Primary Button**: Bright blue (#3B82F6) with white text and hover effects
- **Social Buttons**: Dark backgrounds with subtle borders
- **Cards**: Dark (#1a1a1a) background with minimal borders
- **Logo**: Square format (64x64) with rounded corners and subtle glow
- **Links**: Blue "Forgot Password?" and green "Register" links
- **Checkbox**: Blue accent color for "Remember me"
- **Background**: Geometric grid pattern overlay

## Applying the Theme

### For New Environments
When Keycloak starts with `--import-realm`, it automatically uses the theme specified in `realm-export.json`.

### For Existing Keycloak Instances
Run the theme application script:

```bash
./scripts/apply_keycloak_theme.sh
```

Or manually via Keycloak Admin UI:
1. Log into Keycloak Admin Console
2. Navigate to: Realm Settings → Themes
3. Set "Login theme" to "ushadow"
4. Save

## Customization

### Updating Colors
Edit `config/keycloak/themes/ushadow/login/resources/css/login.css`:

1. **Update CSS Variables** (lines 24-53)
2. **Restart Keycloak** to load changes:
   ```bash
   docker compose -f compose/docker-compose.infra.yml restart keycloak
   ```

### Changing the Logo
Replace `config/keycloak/themes/ushadow/login/resources/img/logo.png`:

- **Recommended Size**: 80x80px (square)
- **Format**: PNG with transparent background
- **Restart Keycloak** after replacing

### Adding Custom Templates
To customize the HTML (not just CSS):

1. Create `login/` directory with FreeMarker templates
2. Copy templates from base theme to override
3. Modify as needed
4. Restart Keycloak

## Troubleshooting

### Theme Not Showing
1. **Check theme is mounted**:
   ```bash
   docker compose -f compose/docker-compose.infra.yml exec keycloak ls -la /opt/keycloak/themes/ushadow
   ```

2. **Verify realm configuration**:
   ```bash
   curl -s http://localhost:8081/admin/realms/ushadow \
     -H "Authorization: Bearer $TOKEN" | grep loginTheme
   ```

3. **Check Keycloak logs**:
   ```bash
   docker compose -f compose/docker-compose.infra.yml logs keycloak | grep -i theme
   ```

### CSS Changes Not Appearing
- **Browser cache**: Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
- **Keycloak restart**: Required after CSS changes
- **Theme cache**: Clear by restarting Keycloak

### Wrong Theme Still Active
Re-apply the theme:
```bash
./scripts/apply_keycloak_theme.sh
```

## Testing

Visit your Keycloak login page:
```
http://localhost:8081/realms/ushadow/protocol/openid-connect/auth?client_id=ushadow-frontend&redirect_uri=http://localhost:3010/oauth/callback&response_type=code&scope=openid
```

You should see:
- ✅ Very dark background with geometric pattern
- ✅ Ushadow logo (green/purple U) at top
- ✅ Bright blue primary button
- ✅ Very dark input fields
- ✅ Blue "Forgot Password?" and green "Register" links
- ✅ Blue checkbox accent color
- ✅ Consistent styling matching the main login page

## Related Files

- **Theme CSS**: `config/keycloak/themes/ushadow/login/resources/css/login.css`
- **Theme Config**: `config/keycloak/themes/ushadow/login/theme.properties`
- **Realm Config**: `config/keycloak/realm-export.json`
- **Docker Config**: `compose/docker-compose.infra.yml`
- **Apply Script**: `scripts/apply_keycloak_theme.sh`

## Resources

- [Keycloak Theming Guide](https://www.keycloak.org/docs/latest/server_development/#_themes)
- [PatternFly CSS Classes](https://www.patternfly.org/) (Base theme framework)
- [FreeMarker Templates](https://freemarker.apache.org/) (Template engine)
