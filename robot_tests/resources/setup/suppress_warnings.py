"""
Suppress urllib3 connection warnings during test startup.

This is imported as a Variables file, so __init__ runs automatically
when the test suite loads, suppressing noisy warnings during health checks.
"""
import logging
import warnings

# Suppress urllib3 connection pool warnings (expected during startup)
logging.getLogger("urllib3.connectionpool").setLevel(logging.ERROR)
logging.getLogger("urllib3.util.retry").setLevel(logging.ERROR)
logging.getLogger("requests").setLevel(logging.ERROR)

# Suppress Python warnings from urllib3
warnings.filterwarnings("ignore", category=Warning, module="urllib3")

# No variables exported (this is just for side effects during import)
