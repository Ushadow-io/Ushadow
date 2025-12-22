# Third-Party Licenses

ushadow integrates with and uses components from various open source projects. This document provides attribution and license information for these dependencies.

---

## Chronicle

ushadow uses Chronicle as an external service for audio processing, transcription, conversation management, and memory extraction.

- **Project**: Chronicle
- **Repository**: https://github.com/chronicler-ai/chronicle
- **License**: MIT License (pending - see note below)
- **Usage**: Used as external API service via HTTP integration

**License Status**: Chronicle is in the process of adding an open source license. ushadow's integration treats Chronicle as an external service accessed via API, maintaining clean architectural separation.

**Attribution**: Chronicle is developed by the Chronicle AI team. ushadow is grateful for their work on personal memory systems and audio processing.

---

## FastAPI

ushadow's backend is built on FastAPI.

- **Project**: FastAPI
- **Repository**: https://github.com/tiangolo/fastapi
- **License**: MIT License
- **Usage**: Web framework for ushadow backend API

```
MIT License

Copyright (c) 2018 Sebastián Ramírez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## React

ushadow's frontend is built with React.

- **Project**: React
- **Repository**: https://github.com/facebook/react
- **License**: MIT License
- **Usage**: UI framework for ushadow dashboard

```
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Additional Dependencies

ushadow uses many additional open source libraries. For a complete list of dependencies and their licenses, please see:

- **Backend**: `backend/requirements.txt` for Python dependencies
- **Frontend**: `frontend/package.json` for JavaScript dependencies

All dependencies are used in accordance with their respective licenses.

### Notable Dependencies

**Backend**:
- **Pydantic**: MIT License - Data validation
- **httpx**: BSD License - HTTP client
- **pymongo**: Apache 2.0 License - MongoDB driver
- **redis**: MIT License - Redis client

**Frontend**:
- **React Router**: MIT License - Routing
- **TanStack Query**: MIT License - Data fetching
- **Axios**: MIT License - HTTP client
- **Lucide React**: ISC License - Icons
- **Zustand**: MIT License - State management

---

## License Compliance

ushadow is licensed under the Apache License 2.0, which is compatible with all the above licenses (MIT, BSD, Apache 2.0, ISC).

When using ushadow, you must comply with:
1. ushadow's Apache 2.0 License
2. The licenses of any services you integrate (Chronicle, MCP servers, etc.)
3. The licenses of ushadow's dependencies (automatically handled by package managers)

---

## Database & Infrastructure

ushadow uses the following database and infrastructure components:

- **MongoDB**: Server Side Public License (SSPL) - Database
- **Redis**: BSD 3-Clause License - Caching and queues
- **Qdrant**: Apache 2.0 License - Vector database

These are used as external services and do not impose licensing requirements on ushadow itself.

---

## Updates

This file is periodically updated to reflect changes in dependencies. Last updated: December 22, 2024

If you notice any missing attributions or licensing concerns, please open an issue at https://github.com/Ushadow-io/Ushadow/issues

---

**Thank you to all open source contributors who make projects like ushadow possible!** 🙏
