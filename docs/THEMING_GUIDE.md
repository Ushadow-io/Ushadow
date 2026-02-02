# Keycloak Theme Customization Guide

The Keycloak login, registration, and account pages now use a custom "ushadow" theme that you can fully customize to match your brand.

## Theme Location

```
config/keycloak/themes/ushadow/
├── theme.properties              # Main theme config
├── login/                        # Login & registration pages
│   ├── theme.properties
│   └── resources/
│       ├── css/
│       │   └── login.css        # ⭐ Main customization file
│       └── img/
│           └── logo.png         # ⭐ Your logo here
├── account/                      # User account management
│   └── theme.properties
└── email/                        # Email templates
    └── theme.properties
```

## Quick Start: Customize Your Theme

### Step 1: Define Your Brand Colors

Edit `config/keycloak/themes/ushadow/login/resources/css/login.css`

Find the `:root` section at the top and replace the TODO values with your brand colors:

```css
:root {
  /* Primary brand color */
  --ushadow-primary: #3b82f6;      /* ← Replace with YOUR primary color */
  --ushadow-primary-hover: #2563eb; /* ← Darker shade for hover */

  /* Backgrounds */
  --ushadow-bg-page: #f3f4f6;      /* ← Page background */
  --ushadow-bg-card: #ffffff;       /* ← Login card background */

  /* Text */
  --ushadow-text-primary: #111827;  /* ← Main text */
  --ushadow-text-secondary: #6b7280; /* ← Secondary text */

  /* Borders */
  --ushadow-border: #d1d5db;       /* ← Form borders */
  --ushadow-border-focus: #3b82f6;  /* ← Focus state */
}
```

**Example color palettes**:

<details>
<summary>🌊 Ocean Blue (Professional)</summary>

```css
--ushadow-primary: #0891b2;
--ushadow-primary-hover: #0e7490;
--ushadow-bg-page: #ecfeff;
--ushadow-bg-card: #ffffff;
```
</details>

<details>
<summary>🌸 Rose Pink (Creative)</summary>

```css
--ushadow-primary: #ec4899;
--ushadow-primary-hover: #db2777;
--ushadow-bg-page: #fdf2f8;
--ushadow-bg-card: #ffffff;
```
</details>

<details>
<summary>🌿 Forest Green (Natural)</summary>

```css
--ushadow-primary: #059669;
--ushadow-primary-hover: #047857;
--ushadow-bg-page: #f0fdf4;
--ushadow-bg-card: #ffffff;
```
</details>

<details>
<summary>🔥 Sunset Orange (Energetic)</summary>

```css
--ushadow-primary: #f97316;
--ushadow-primary-hover: #ea580c;
--ushadow-bg-page: #fff7ed;
--ushadow-bg-card: #ffffff;
```
</details>

<details>
<summary>🌙 Purple Night (Modern)</summary>

```css
--ushadow-primary: #8b5cf6;
--ushadow-primary-hover: #7c3aed;
--ushadow-bg-page: #faf5ff;
--ushadow-bg-card: #ffffff;
```
</details>

### Step 2: Add Your Logo

1. **Create or export your logo**:
   - Recommended size: 200px wide × 60px tall
   - Format: PNG with transparent background
   - Keep it simple - this appears on login/register pages

2. **Place the logo file**:
   ```bash
   cp /path/to/your/logo.png config/keycloak/themes/ushadow/login/resources/img/logo.png
   ```

3. **Adjust logo size** (if needed):
   Edit `login.css` and find the `#kc-header-wrapper::before` section:
   ```css
   #kc-header-wrapper::before {
     width: 200px;   /* ← Adjust width */
     height: 60px;   /* ← Adjust height */
     /* ... */
   }
   ```

### Step 3: Apply the Theme

The theme is automatically applied when you run the setup script:

```bash
python scripts/setup_keycloak.py
```

Or manually via Keycloak Admin Console:
1. Go to http://localhost:8081/admin
2. Select **ushadow** realm
3. Go to **Realm Settings** → **Themes**
4. Set:
   - Login Theme: `ushadow`
   - Account Theme: `ushadow`
   - Email Theme: `ushadow`
5. Click **Save**

### Step 4: Test Your Theme

Visit the login page to see your changes:
```bash
open "http://localhost:8081/realms/ushadow/protocol/openid-connect/auth?client_id=ushadow-frontend&redirect_uri=http://localhost:3000&response_type=code&scope=openid"
```

Or the registration page:
```bash
open "http://localhost:8081/realms/ushadow/protocol/openid-connect/registrations?client_id=ushadow-frontend&redirect_uri=http://localhost:3000&response_type=code&scope=openid"
```

**Tip**: Use your browser's DevTools (F12) to inspect elements and test color changes in real-time before updating the CSS file.

## Advanced Customization

### Custom Fonts

Add Google Fonts or custom web fonts:

```css
/* In login.css, add at the top */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

.login-pf-page {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}
```

### Custom Background

Add a background image or gradient:

```css
.login-pf-page {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  /* OR */
  background: url('../img/background.jpg') center/cover no-repeat;
}
```

### Rounded Card Design

Make the login card more modern:

```css
.card-pf {
  border-radius: 24px; /* More rounded */
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1),
              0 10px 10px -5px rgba(0, 0, 0, 0.04); /* Larger shadow */
}
```

### Custom Social Buttons

Style social login buttons to match your brand:

```css
/* Google button with brand colors */
.kc-social-link-google {
  background-color: #4285f4;
  color: #ffffff;
  border: none;
}

.kc-social-link-google:hover {
  background-color: #357ae8;
}

/* GitHub dark theme */
.kc-social-link-github {
  background-color: #24292e;
  color: #ffffff;
  border: none;
}
```

## Template Customization (Advanced)

If you need to change the HTML structure (not just styling), you can override FreeMarker templates.

### Override Login Template

1. Copy base template from Keycloak:
   ```bash
   docker cp keycloak:/opt/keycloak/lib/lib/main/org.keycloak.keycloak-themes-26.0.8.jar /tmp/
   unzip /tmp/org.keycloak.keycloak-themes-26.0.8.jar 'theme/keycloak/login/*.ftl' -d /tmp/
   ```

2. Copy the template you want to customize:
   ```bash
   cp /tmp/theme/keycloak/login/login.ftl config/keycloak/themes/ushadow/login/
   ```

3. Edit the `.ftl` file to change HTML structure

4. Restart Keycloak to see changes

**Common templates**:
- `login.ftl` - Main login page
- `register.ftl` - Registration form
- `login-reset-password.ftl` - Password reset
- `error.ftl` - Error page
- `info.ftl` - Information messages

## Theme Development Workflow

### 1. Enable Live Reload (Development)

Edit `docker-compose.infra.yml` to mount the theme as a volume (already configured):

```yaml
volumes:
  - ../config/keycloak/themes:/opt/keycloak/themes:ro
```

### 2. Disable Theme Caching

In Keycloak admin console:
1. Go to **Realm Settings** → **Themes**
2. Set **Caching**: `Disabled` (for development)
3. Save

Now CSS changes appear immediately on page refresh (Ctrl+F5 for hard refresh).

### 3. Development Checklist

When customizing the theme:

- [ ] Test on desktop (1920x1080)
- [ ] Test on mobile (375x667)
- [ ] Test with long email addresses
- [ ] Test error messages (wrong password)
- [ ] Test success messages
- [ ] Test social login buttons (if configured)
- [ ] Test "Forgot password" link
- [ ] Test "Register" link
- [ ] Check accessibility (tab navigation, screen reader)
- [ ] Validate colors have enough contrast (WCAG AA: 4.5:1)

### 4. Browser DevTools Workflow

1. Open login page: `http://localhost:8081/realms/ushadow/account`
2. Press F12 to open DevTools
3. Go to **Elements** tab
4. Click element to inspect
5. Edit CSS in **Styles** panel to test changes
6. Copy working CSS to `login.css`
7. Refresh page (Ctrl+F5) to verify

## Production Considerations

### Re-enable Theme Caching

Before deploying to production:

1. Keycloak Admin → **Realm Settings** → **Themes**
2. Set **Caching**: `Enabled`
3. Save

This significantly improves performance.

### Minify CSS

For production, minify your CSS:

```bash
# Using cssnano or similar
npx cssnano config/keycloak/themes/ushadow/login/resources/css/login.css \
  config/keycloak/themes/ushadow/login/resources/css/login.min.css
```

Update `theme.properties` to reference the minified version.

### Optimize Images

Compress your logo and background images:

```bash
# Using imagemagick
convert logo.png -strip -quality 85 logo-optimized.png

# Or use online tools:
# - TinyPNG (https://tinypng.com/)
# - Squoosh (https://squoosh.app/)
```

## Troubleshooting

### Changes Not Appearing

1. **Hard refresh**: Press Ctrl+F5 (Cmd+Shift+R on Mac)
2. **Clear theme cache**: Disable caching in Realm Settings
3. **Check file permissions**: Ensure theme files are readable
4. **Check volume mount**: Verify `docker-compose.infra.yml` has theme volume
5. **Restart Keycloak**: `docker restart keycloak`

### Theme Not Found

```
Theme ushadow not found for theme type login
```

**Solution**:
1. Check theme directory structure matches exactly
2. Verify `theme.properties` exists in each subdirectory
3. Check `parent=keycloak` is set correctly
4. Restart Keycloak

### CSS Not Loading

```
Failed to load resource: login.css
```

**Solution**:
1. Check `login/theme.properties` has: `styles=css/login.css`
2. Verify file exists at: `login/resources/css/login.css`
3. Check file permissions (must be readable by Keycloak container)

### Logo Not Displaying

**Solution**:
1. Check image exists: `login/resources/img/logo.png`
2. Check image format (PNG recommended)
3. Verify CSS path: `url('../img/logo.png')`
4. Check browser console for 404 errors

## Next Steps

Once you've customized your theme:

1. ✅ Define brand colors
2. ✅ Add your logo
3. ✅ Test on all pages (login, register, reset password)
4. ⏳ Configure Google OAuth (see `REGISTRATION_AND_SOCIAL_LOGIN.md`)
5. ⏳ Implement frontend OIDC flow
6. ⏳ Test complete authentication journey

Your authentication UI is now fully branded and ready for users!
