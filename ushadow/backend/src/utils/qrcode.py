"""QR Code Generation Utility.

Provides QR code generation as base64-encoded data URLs for embedding in web UIs.
"""

import base64
import io
from typing import Optional

try:
    import qrcode
    QRCODE_AVAILABLE = True
except ImportError:
    QRCODE_AVAILABLE = False


def generate_qr_code_data_url(data: str, box_size: int = 10, border: int = 4) -> Optional[str]:
    """Generate QR code as a base64-encoded PNG data URL.

    Args:
        data: Data to encode in QR code (typically a URL)
        box_size: Size of each box in pixels (default: 10)
        border: Border size in boxes (default: 4)

    Returns:
        Data URL string (e.g., "data:image/png;base64,iVBOR...") or None if qrcode not available

    Example:
        >>> url = "https://example.com/auth"
        >>> qr_data_url = generate_qr_code_data_url(url)
        >>> # Use in HTML: <img src="{qr_data_url}" />
    """
    if not QRCODE_AVAILABLE:
        return None

    # Create QR code
    qr = qrcode.QRCode(version=1, box_size=box_size, border=border)
    qr.add_data(data)
    qr.make(fit=True)

    # Generate image
    img = qr.make_image(fill_color="black", back_color="white")

    # Convert to base64 data URL
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()

    return f"data:image/png;base64,{img_str}"
