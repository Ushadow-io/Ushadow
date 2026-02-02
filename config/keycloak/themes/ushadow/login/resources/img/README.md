# Theme Images

Place your custom images in this directory.

## Logo

**File**: `logo.png`
**Recommended size**: 200px wide × 60px tall
**Format**: PNG with transparent background

This logo appears at the top of:
- Login page
- Registration page
- Password reset page

## Background (Optional)

**File**: `background.jpg` or `background.png`
**Recommended size**: 1920px × 1080px or larger
**Format**: JPG (smaller file size) or PNG

To use a background image, add to `../css/login.css`:

```css
.login-pf-page {
  background: url('../img/background.jpg') center/cover no-repeat;
}
```

## Creating a Simple Logo

If you don't have a logo yet, you can:

1. **Use text-only branding**: Comment out the `#kc-header-wrapper::before` section in `login.css`
2. **Generate online**:
   - Canva (https://www.canva.com/create/logos/)
   - LogoMakr (https://logomakr.com/)
   - Hatchful (https://hatchful.shopify.com/)
3. **Use AI**: DALL-E, Midjourney, or Stable Diffusion

## Example: SVG to PNG Conversion

If you have an SVG logo:

```bash
# Using ImageMagick
convert -background none -density 300 logo.svg -resize 200x60 logo.png

# Using Inkscape
inkscape logo.svg --export-png=logo.png --export-width=200
```
